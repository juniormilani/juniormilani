"""Download e conversão da base CNPJ da Receita para Parquet.

Layout validado contra amostra real (mês 2026-09-14) e contra o PDF oficial de
metadados — ver `sql/receita_layout.md`. Resumo:

- cada zip contém UM arquivo CSV (nome sem extensão .csv, ex. `K3241.K03200Y1.D60912.ESTABELE`)
- sem cabeçalho, separador `;`, todos os campos entre aspas, encoding latin-1, fim de linha `\\n`
- datas `AAAAMMDD`; `00000000` ou vazio = sem data

Estratégia de memória/disco: o CSV é lido em streaming de dentro do zip (nunca
descompactado inteiro em disco). Só as linhas relevantes (UF alvo em
Estabelecimentos; `cnpj_basico` presentes nesses Estabelecimentos em Empresas e
Simples) são gravadas num CSV temporário, que o DuckDB converte para Parquet.
"""

from __future__ import annotations

import csv
import io
import json
import re
import shutil
import zipfile
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import duckdb
import httpx
from rich.console import Console
from rich.progress import BarColumn, DownloadColumn, Progress, TextColumn, TransferSpeedColumn
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

console = Console()

# --- Layouts (ordem das colunas no CSV) ------------------------------------------------

ESTABELECIMENTOS = [
    "cnpj_basico", "cnpj_ordem", "cnpj_dv", "identificador_matriz_filial", "nome_fantasia",
    "situacao_cadastral", "data_situacao_cadastral", "motivo_situacao_cadastral",
    "nome_cidade_exterior", "pais", "data_inicio_atividade", "cnae_fiscal_principal",
    "cnae_fiscal_secundaria", "tipo_logradouro", "logradouro", "numero", "complemento", "bairro",
    "cep", "uf", "municipio", "ddd_1", "telefone_1", "ddd_2", "telefone_2", "ddd_fax", "fax",
    "correio_eletronico", "situacao_especial", "data_situacao_especial",
]
EMPRESAS = [
    "cnpj_basico", "razao_social", "natureza_juridica", "qualificacao_responsavel",
    "capital_social", "porte_empresa", "ente_federativo_responsavel",
]
SIMPLES = [
    "cnpj_basico", "opcao_pelo_simples", "data_opcao_simples", "data_exclusao_simples",
    "opcao_mei", "data_opcao_mei", "data_exclusao_mei",
]
DOMINIO = ["codigo", "descricao"]

UF_COL = ESTABELECIMENTOS.index("uf")


@dataclass(frozen=True)
class Tabela:
    nome: str            # nome da tabela/parquet
    padrao: str          # regex do nome do zip
    colunas: list[str]
    filtro: str          # "uf" | "cnpj_basico" | "nenhum"


# Ordem importa: Estabelecimentos primeiro (gera o conjunto de cnpj_basico da UF).
TABELAS = [
    Tabela("estabelecimentos", r"^Estabelecimentos\d+\.zip$", ESTABELECIMENTOS, "uf"),
    Tabela("empresas", r"^Empresas\d+\.zip$", EMPRESAS, "cnpj_basico"),
    Tabela("simples", r"^Simples\.zip$", SIMPLES, "cnpj_basico"),
    Tabela("cnaes", r"^Cnaes\.zip$", DOMINIO, "nenhum"),
    Tabela("municipios", r"^Municipios\.zip$", DOMINIO, "nenhum"),
    Tabela("naturezas", r"^Naturezas\.zip$", DOMINIO, "nenhum"),
]

# Nunca baixar (LGPD / desnecessário).
PROIBIDOS = re.compile(r"^Socios", re.IGNORECASE)


# --- Descoberta do mês e dos arquivos --------------------------------------------------

_HREF = re.compile(r'href="([^"?#]+)"', re.IGNORECASE)
_MES = re.compile(r"^(\d{4}-\d{2}(?:-\d{2})?)/?$")


def listar_links(html: str) -> list[str]:
    """Extrai hrefs de uma listagem de diretório estilo Apache/nginx."""
    return [h for h in _HREF.findall(html)]


def listar_meses(html: str) -> list[str]:
    """Pastas de mês (`AAAA-MM` ou `AAAA-MM-DD`) presentes na listagem, ordenadas."""
    meses = {m.group(1) for h in listar_links(html) if (m := _MES.match(h.rstrip("/").split("/")[-1] + "/"))}
    return sorted(meses)


def escolher_mes(meses: list[str], preferido: str = "") -> str:
    if not meses:
        raise RuntimeError("Nenhuma pasta de mês encontrada na listagem da fonte")
    if preferido:
        candidatos = [m for m in meses if m.startswith(preferido)]
        if not candidatos:
            raise RuntimeError(f"Mês {preferido!r} não existe na fonte. Disponíveis (últimos): {meses[-5:]}")
        return candidatos[-1]
    return meses[-1]


def listar_zips(html: str) -> list[str]:
    nomes = sorted({h.split("/")[-1] for h in listar_links(html) if h.lower().endswith(".zip")})
    return [n for n in nomes if not PROIBIDOS.match(n)]


def zips_necessarios(nomes: Iterable[str]) -> dict[str, list[str]]:
    """Agrupa os zips por tabela; erro se algum grupo obrigatório estiver faltando."""
    nomes = list(nomes)
    out: dict[str, list[str]] = {}
    for t in TABELAS:
        achados = sorted(n for n in nomes if re.match(t.padrao, n))
        if not achados:
            raise RuntimeError(f"Nenhum arquivo para '{t.nome}' (padrão {t.padrao}) na pasta do mês")
        out[t.nome] = achados
    return out


# --- Download com retomada ------------------------------------------------------------

class DownloadIncompleto(Exception):
    pass


_RETRY = dict(
    retry=retry_if_exception_type((httpx.TransportError, DownloadIncompleto, httpx.HTTPStatusError)),
    wait=wait_exponential(multiplier=2, max=60),
    stop=stop_after_attempt(6),
    reraise=True,
)


@retry(**_RETRY)
def _baixar_trecho(
    client: httpx.Client, url: str, part: Path, ini: int, fim: int | None,
    progress: Progress | None = None, task=None,
) -> None:
    """Baixa os bytes [ini, fim] de `url` para `part`, continuando do que já existe em `part`."""
    esperado = None if fim is None else fim - ini + 1
    ja = part.stat().st_size if part.exists() else 0
    if esperado is not None and ja > esperado:
        part.unlink()
        ja = 0
    if esperado is not None and ja == esperado:
        return
    headers = {}
    if ini + ja > 0 or fim is not None:
        headers["Range"] = f"bytes={ini + ja}-{'' if fim is None else fim}"
    with client.stream("GET", url, headers=headers) as r:
        r.raise_for_status()
        if r.status_code == 206:
            modo = "ab"
        elif ini == 0:  # servidor ignorou o Range: recomeça do zero
            modo = "wb"
            if progress is not None and ja:
                progress.advance(task, -ja)
        else:
            raise DownloadIncompleto(f"{part.name}: servidor não respeitou Range")
        with part.open(modo) as fh:
            for chunk in r.iter_bytes(1 << 20):
                fh.write(chunk)
                if progress is not None:
                    progress.advance(task, len(chunk))
    tamanho = part.stat().st_size
    if esperado is not None and tamanho != esperado:
        raise DownloadIncompleto(f"{part.name}: {tamanho} de {esperado} bytes")


def baixar(
    client: httpx.Client, url: str, destino: Path, progress: Progress | None = None,
    conexoes: int = 1, min_segmento: int = 64 << 20,
) -> Path:
    """Baixa `url` para `destino` com retomada via Range.

    Se o servidor aceita Range e o arquivo é grande, divide em até `conexoes` trechos baixados
    em paralelo (arquivos `<destino>.partIofN`), depois concatena. Cada trecho é retomável.
    Idempotente: se `destino` já existe com o tamanho anunciado pelo servidor, não baixa.
    """
    destino.parent.mkdir(parents=True, exist_ok=True)
    head = client.head(url)
    head.raise_for_status()
    total = int(head.headers.get("content-length", 0)) or None
    if destino.exists() and (total is None or destino.stat().st_size == total):
        return destino

    aceita_range = head.headers.get("accept-ranges", "").lower() == "bytes"
    n = 1
    if total and aceita_range and conexoes > 1:
        n = max(1, min(conexoes, total // min_segmento))
    if n == 1:
        trechos = [(destino.with_name(destino.name + ".part"), 0, None if total is None else total - 1)]
    else:
        passo = -(-total // n)
        trechos = [
            (destino.with_name(f"{destino.name}.part{i}of{n}"), i * passo, min(total, (i + 1) * passo) - 1)
            for i in range(n)
        ]

    task = None
    if progress is not None:
        ja = sum(p.stat().st_size for p, _, _ in trechos if p.exists())
        task = progress.add_task(destino.name + (f" ({n} conexões)" if n > 1 else ""), total=total, completed=ja)
    try:
        if n == 1:
            _baixar_trecho(client, url, *trechos[0], progress, task)
        else:
            with ThreadPoolExecutor(max_workers=n) as ex:
                for f in [ex.submit(_baixar_trecho, client, url, p, a, b, progress, task) for p, a, b in trechos]:
                    f.result()
    finally:
        if task is not None:
            progress.remove_task(task)

    tmp = destino.with_name(destino.name + ".tmp")
    if n == 1:
        trechos[0][0].replace(tmp)
    else:
        with tmp.open("wb") as out:
            for p, _, _ in trechos:
                with p.open("rb") as fh:
                    shutil.copyfileobj(fh, out, 16 << 20)
        for p, _, _ in trechos:
            p.unlink()
    if total is not None and tmp.stat().st_size != total:
        tamanho = tmp.stat().st_size
        tmp.unlink()
        raise DownloadIncompleto(f"{destino.name}: {tamanho} de {total} bytes após concatenar")
    tmp.replace(destino)
    return destino


# --- Filtro em streaming --------------------------------------------------------------

def _linhas_do_zip(zip_path: Path) -> Iterable[bytes]:
    with zipfile.ZipFile(zip_path) as zf:
        membros = [m for m in zf.infolist() if not m.is_dir()]
        if len(membros) != 1:
            raise RuntimeError(f"{zip_path.name}: esperado 1 arquivo no zip, encontrados {len(membros)}")
        with zf.open(membros[0]) as fh:
            yield from io.BufferedReader(fh, buffer_size=1 << 22)


def _parse(linha: bytes) -> list[str]:
    return next(csv.reader([linha.decode("latin-1").rstrip("\r\n")], delimiter=";", quotechar='"'))


def filtrar_zip(
    zip_path: Path,
    saida,
    ncols: int,
    manter: Callable[[bytes], bool] | None = None,
    confirmar: Callable[[list[str]], bool] | None = None,
    ao_manter: Callable[[list[str]], None] | None = None,
) -> tuple[int, int]:
    """Copia para `saida` (texto UTF-8) as linhas do CSV dentro do zip que passam no filtro.

    `manter` é um pré-filtro barato em bytes; `confirmar` valida a linha já parseada.
    Retorna (linhas_lidas, linhas_gravadas). Linhas com nº de colunas errado geram erro.
    """
    escritor = csv.writer(saida, delimiter=";", quotechar='"', quoting=csv.QUOTE_ALL, lineterminator="\n")
    lidas = gravadas = 0
    for linha in _linhas_do_zip(zip_path):
        lidas += 1
        if manter is not None and not manter(linha):
            continue
        campos = _parse(linha)
        if len(campos) != ncols:
            raise RuntimeError(f"{zip_path.name} linha {lidas}: {len(campos)} colunas, esperado {ncols}")
        if confirmar is not None and not confirmar(campos):
            continue
        escritor.writerow(campos)
        gravadas += 1
        if ao_manter is not None:
            ao_manter(campos)
    return lidas, gravadas


def csv_para_parquet(csv_path: Path, colunas: list[str], parquet_path: Path) -> int:
    """Converte CSV (UTF-8, sem cabeçalho) em Parquet com todas as colunas VARCHAR."""
    parquet_path.parent.mkdir(parents=True, exist_ok=True)
    cols = "{" + ", ".join(f"'{c}': 'VARCHAR'" for c in colunas) + "}"
    tmp = parquet_path.with_suffix(".parquet.tmp")
    con = duckdb.connect()
    try:
        con.execute(
            f"""
            COPY (
              SELECT * FROM read_csv(?, delim=';', quote='"', escape='"', header=false,
                                     columns={cols}, auto_detect=false, strict_mode=true)
            ) TO '{tmp.as_posix()}' (FORMAT parquet, COMPRESSION zstd)
            """,
            [csv_path.as_posix()],
        )
        n = con.execute(f"SELECT count(*) FROM read_parquet('{tmp.as_posix()}')").fetchone()[0]
    finally:
        con.close()
    tmp.replace(parquet_path)
    return n


# --- Orquestração ---------------------------------------------------------------------

@dataclass
class ResultadoIngest:
    mes: str
    parquet_dir: Path
    linhas: dict[str, int]
    pulado: bool = False


def converter_mes(raw_dir: Path, parquet_dir: Path, zips: dict[str, list[str]], uf: str, apagar_raw: bool = False) -> dict[str, int]:
    """Filtra e converte os zips de `raw_dir` para Parquet em `parquet_dir`."""
    parquet_dir.mkdir(parents=True, exist_ok=True)
    tmp_dir = parquet_dir / "_tmp"
    tmp_dir.mkdir(exist_ok=True)
    uf_bytes = f'"{uf}";"'.encode()
    basicos: set[bytes] = set()
    contagens: dict[str, int] = {}

    for t in TABELAS:
        csv_tmp = tmp_dir / f"{t.nome}.csv"
        lidas_total = 0
        with csv_tmp.open("w", encoding="utf-8", newline="") as saida:
            for nome in zips[t.nome]:
                zp = raw_dir / nome
                if t.filtro == "uf":
                    lidas, grav = filtrar_zip(
                        zp, saida, len(t.colunas),
                        manter=lambda b: uf_bytes in b,
                        confirmar=lambda c: c[UF_COL] == uf,
                        ao_manter=lambda c: basicos.add(c[0].encode()),
                    )
                elif t.filtro == "cnpj_basico":
                    # linha começa com "XXXXXXXX" -> bytes [1:9]
                    lidas, grav = filtrar_zip(zp, saida, len(t.colunas), manter=lambda b: b[1:9] in basicos)
                else:
                    lidas, grav = filtrar_zip(zp, saida, len(t.colunas))
                lidas_total += lidas
                console.log(f"{nome}: {lidas:,} linhas lidas, {grav:,} mantidas")
                if apagar_raw:
                    zp.unlink()
        n = csv_para_parquet(csv_tmp, t.colunas, parquet_dir / f"{t.nome}.parquet")
        csv_tmp.unlink()
        contagens[t.nome] = n
        console.log(f"[green]{t.nome}.parquet[/green]: {n:,} linhas (de {lidas_total:,})")
    tmp_dir.rmdir()
    return contagens


def ingest(
    base_url: str,
    raw_root: Path,
    parquet_root: Path,
    uf: str,
    mes_preferido: str = "",
    force: bool = False,
    apagar_raw: bool = False,
    conexoes: int = 1,
    client: httpx.Client | None = None,
) -> ResultadoIngest:
    base_url = base_url.rstrip("/") + "/"
    own = client is None
    client = client or httpx.Client(
        timeout=httpx.Timeout(60, read=120), follow_redirects=True,
        limits=httpx.Limits(max_connections=max(10, conexoes * 2)),
    )
    try:
        r = client.get(base_url)
        r.raise_for_status()
        mes = escolher_mes(listar_meses(r.text), mes_preferido)
        parquet_dir = parquet_root / mes
        manifesto = parquet_dir / "_manifest.json"
        if manifesto.exists() and not force:
            dados = json.loads(manifesto.read_text())
            if dados.get("uf") == uf:
                console.log(f"Mês {mes} já convertido para UF={uf} ({manifesto}); use --force para refazer.")
                return ResultadoIngest(mes, parquet_dir, dados["linhas"], pulado=True)

        url_mes = f"{base_url}{mes}/"
        r = client.get(url_mes)
        r.raise_for_status()
        zips = zips_necessarios(listar_zips(r.text))
        console.log(f"Mês {mes}: {sum(len(v) for v in zips.values())} arquivos a baixar de {url_mes}")

        raw_dir = raw_root / mes
        with Progress(TextColumn("{task.description}"), BarColumn(), DownloadColumn(), TransferSpeedColumn(), console=console) as prog:
            for nomes in zips.values():
                for nome in nomes:
                    baixar(client, url_mes + nome, raw_dir / nome, prog, conexoes=conexoes)

        linhas = converter_mes(raw_dir, parquet_dir, zips, uf, apagar_raw=apagar_raw)
        manifesto.write_text(json.dumps({"mes": mes, "uf": uf, "fonte": url_mes, "linhas": linhas}, indent=2))
        return ResultadoIngest(mes, parquet_dir, linhas)
    finally:
        if own:
            client.close()


def mes_mais_recente_local(parquet_root: Path) -> Path:
    """Pasta do mês convertido mais recente (com manifesto)."""
    meses = sorted(p.parent for p in parquet_root.glob("*/_manifest.json"))
    if not meses:
        raise RuntimeError(f"Nenhuma base convertida em {parquet_root}. Rode `prospector ingest` antes.")
    return meses[-1]
