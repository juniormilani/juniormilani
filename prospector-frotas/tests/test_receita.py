import json
import zipfile
from pathlib import Path

import duckdb
import httpx
import pytest

from prospector.ingest import receita as r

FIX = Path(__file__).parent / "fixtures" / "receita"

# zip -> (arquivo de fixture, nome do membro no zip, fatia de linhas)
ZIPS = {
    "Estabelecimentos0.zip": ("ESTABELE.csv", "K3241.K03200Y0.D60912.ESTABELE", slice(0, 10)),
    "Estabelecimentos1.zip": ("ESTABELE.csv", "K3241.K03200Y1.D60912.ESTABELE", slice(10, None)),
    "Empresas0.zip": ("EMPRECSV.csv", "K3241.K03200Y0.D60912.EMPRECSV", slice(0, 9)),
    "Empresas1.zip": ("EMPRECSV.csv", "K3241.K03200Y1.D60912.EMPRECSV", slice(9, None)),
    "Simples.zip": ("SIMPLES.csv", "F.K03200$W.SIMPLES.CSV.D60912", slice(None)),
    "Cnaes.zip": ("CNAECSV.csv", "F.K03200$Z.D60912.CNAECSV", slice(None)),
    "Municipios.zip": ("MUNICCSV.csv", "F.K03200$Z.D60912.MUNICCSV", slice(None)),
    "Naturezas.zip": ("NATJUCSV.csv", "F.K03200$Z.D60912.NATJUCSV", slice(None)),
}


def zip_bytes(nome: str) -> bytes:
    fonte, membro, fatia = ZIPS[nome]
    linhas = (FIX / fonte).read_bytes().splitlines(keepends=True)[fatia]
    import io

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(membro, b"".join(linhas))
    return buf.getvalue()


def montar_raw(raw_dir: Path) -> dict[str, list[str]]:
    raw_dir.mkdir(parents=True, exist_ok=True)
    for nome in ZIPS:
        (raw_dir / nome).write_bytes(zip_bytes(nome))
    return r.zips_necessarios(ZIPS)


LISTAGEM_RAIZ = """<html><body><h1>Index of /arquivos</h1><pre>
<a href="../">Parent Directory</a>
<a href="2026-07-12/">2026-07-12/</a>
<a href="2026-08-09/">2026-08-09/</a>
<a href="2026-09-14/">2026-09-14/</a>
<a href="?C=M;O=A">Last modified</a>
</pre></body></html>"""


def listagem_mes(nomes) -> str:
    return "<pre>" + "".join(f'<a href="{n}">{n}</a>\n' for n in nomes) + "</pre>"


# --- descoberta -----------------------------------------------------------------------

def test_listar_meses_e_escolha():
    meses = r.listar_meses(LISTAGEM_RAIZ)
    assert meses == ["2026-07-12", "2026-08-09", "2026-09-14"]
    assert r.escolher_mes(meses) == "2026-09-14"
    assert r.escolher_mes(meses, "2026-08") == "2026-08-09"
    with pytest.raises(RuntimeError, match="não existe"):
        r.escolher_mes(meses, "2025-01")


def test_listar_zips_ignora_socios():
    html = listagem_mes(["Cnaes.zip", "Socios0.zip", "Socios9.zip", "Empresas0.zip", "notas.txt"])
    assert r.listar_zips(html) == ["Cnaes.zip", "Empresas0.zip"]


def test_zips_necessarios_falta_arquivo():
    with pytest.raises(RuntimeError, match="simples"):
        r.zips_necessarios([n for n in ZIPS if n != "Simples.zip"])


# --- conversão ------------------------------------------------------------------------

def test_converter_filtra_uf_e_basicos(tmp_path):
    raw = tmp_path / "raw"
    zips = montar_raw(raw)
    out = tmp_path / "pq"
    linhas = r.converter_mes(raw, out, zips, "RS")

    con = duckdb.connect()
    ufs = con.execute(f"SELECT DISTINCT uf FROM '{out}/estabelecimentos.parquet'").fetchall()
    assert ufs == [("RS",)]
    # 20 linhas na fixture: 3 fora do RS (SC, SC com fantasia "RS", PR)
    assert linhas["estabelecimentos"] == 17
    # Empresas/Simples só dos cnpj_basico que têm estabelecimento no RS
    basicos_empresas = {b for (b,) in con.execute(f"SELECT cnpj_basico FROM '{out}/empresas.parquet'").fetchall()}
    assert "33333333" not in basicos_empresas and "17171717" not in basicos_empresas
    assert "13131313" not in basicos_empresas
    assert linhas["empresas"] == 15
    assert linhas["simples"] == 3
    # campo com ';' e acento preservados (latin-1 -> UTF-8)
    fant = con.execute(f"SELECT complemento FROM '{out}/estabelecimentos.parquet' WHERE cnpj_basico='12121212'").fetchone()[0]
    assert fant == "SALA 1; FUNDOS"
    desc = con.execute(f"SELECT descricao FROM '{out}/cnaes.parquet' WHERE codigo='4930202'").fetchone()[0]
    assert "rodoviário" in desc
    # todas as colunas VARCHAR (zeros à esquerda preservados)
    tipos = {t for (_, t) in con.execute(f"SELECT column_name, column_type FROM (DESCRIBE SELECT * FROM '{out}/estabelecimentos.parquet')").fetchall()}
    assert tipos == {"VARCHAR"}
    assert not (out / "_tmp").exists()


def test_linha_com_colunas_erradas(tmp_path):
    zp = tmp_path / "Cnaes.zip"
    with zipfile.ZipFile(zp, "w") as zf:
        zf.writestr("X", '"1";"a";"extra"\n'.encode("latin-1"))
    with open(tmp_path / "o.csv", "w") as fh, pytest.raises(RuntimeError, match="3 colunas"):
        r.filtrar_zip(zp, fh, 2)


# --- download -------------------------------------------------------------------------

def _servidor_bytes(conteudo: bytes, ranges: list, aceita_range: bool):
    def handler(req: httpx.Request) -> httpx.Response:
        if req.method == "HEAD":
            h = {"content-length": str(len(conteudo))}
            if aceita_range:
                h["accept-ranges"] = "bytes"
            return httpx.Response(200, headers=h)
        rg = req.headers.get("range")
        ranges.append(rg)
        if rg:
            a, b = rg.split("=")[1].split("-")
            fim = int(b) + 1 if b else len(conteudo)
            return httpx.Response(206, content=conteudo[int(a):fim])
        return httpx.Response(200, content=conteudo)

    return httpx.MockTransport(handler)


def test_download_retoma_com_range(tmp_path):
    conteudo = bytes(range(256)) * 100
    ranges: list = []
    destino = tmp_path / "X.zip"
    (tmp_path / "X.zip.part").write_bytes(conteudo[:1000])
    with httpx.Client(transport=_servidor_bytes(conteudo, ranges, aceita_range=False)) as c:
        r.baixar(c, "https://ex/X.zip", destino)
        assert destino.read_bytes() == conteudo
        assert ranges == [f"bytes=1000-{len(conteudo) - 1}"]
        # segunda vez: tamanho bate, não baixa de novo
        r.baixar(c, "https://ex/X.zip", destino)
        assert len(ranges) == 1
    assert not list(tmp_path.glob("*.part*"))


def test_download_segmentado_paralelo_e_retomavel(tmp_path):
    conteudo = bytes(range(256)) * 400  # 102400 bytes
    ranges: list = []
    destino = tmp_path / "G.zip"
    # 4 trechos de 25600; o trecho 1 já tem 100 bytes de uma execução anterior
    (tmp_path / "G.zip.part1of4").write_bytes(conteudo[25600:25700])
    with httpx.Client(transport=_servidor_bytes(conteudo, ranges, aceita_range=True)) as c:
        r.baixar(c, "https://ex/G.zip", destino, conexoes=4, min_segmento=1000)
    assert destino.read_bytes() == conteudo
    assert sorted(ranges) == sorted(["bytes=0-25599", "bytes=25700-51199", "bytes=51200-76799", "bytes=76800-102399"])
    assert not list(tmp_path.glob("*.part*"))


def test_download_arquivo_pequeno_nao_segmenta(tmp_path):
    conteudo = b"x" * 5000
    ranges: list = []
    with httpx.Client(transport=_servidor_bytes(conteudo, ranges, aceita_range=True)) as c:
        r.baixar(c, "https://ex/P.zip", tmp_path / "P.zip", conexoes=4, min_segmento=64 << 20)
    assert ranges == ["bytes=0-4999"]


def test_download_servidor_ignora_range(tmp_path):
    conteudo = b"a" * 5000

    def handler(req):
        if req.method == "HEAD":
            return httpx.Response(200, headers={"content-length": "5000"})
        return httpx.Response(200, content=conteudo)  # sem suporte a Range

    (tmp_path / "Y.zip.part").write_bytes(b"lixo" * 100)
    with httpx.Client(transport=httpx.MockTransport(handler)) as c:
        r.baixar(c, "https://ex/Y.zip", tmp_path / "Y.zip")
    assert (tmp_path / "Y.zip").read_bytes() == conteudo


# --- ingest completo (servidor simulado) ----------------------------------------------

def _servidor(chamadas: list[str]):
    base = "https://mirror.test/arquivos/"
    mes = "2026-09-14"
    nomes = list(ZIPS) + ["Socios0.zip", "Paises.zip"]

    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        chamadas.append(f"{req.method} {url}")
        if url == base:
            return httpx.Response(200, text=LISTAGEM_RAIZ)
        if url == f"{base}{mes}/":
            return httpx.Response(200, text=listagem_mes(nomes))
        nome = url.rsplit("/", 1)[-1]
        if nome.startswith("Socios"):
            raise AssertionError("Socios nunca deve ser baixado")
        corpo = zip_bytes(nome)
        if req.method == "HEAD":
            return httpx.Response(200, headers={"content-length": str(len(corpo))})
        return httpx.Response(200, content=corpo)

    return base, httpx.MockTransport(handler)


def test_ingest_ponta_a_ponta_e_idempotente(tmp_path):
    chamadas: list[str] = []
    base, transport = _servidor(chamadas)
    with httpx.Client(transport=transport) as c:
        res = r.ingest(base, tmp_path / "raw", tmp_path / "pq", "RS", client=c)
        assert res.mes == "2026-09-14" and not res.pulado
        assert res.linhas["estabelecimentos"] == 17
        man = json.loads((tmp_path / "pq" / "2026-09-14" / "_manifest.json").read_text())
        assert man["uf"] == "RS"
        assert not any("Paises" in ch for ch in chamadas)

        chamadas.clear()
        res2 = r.ingest(base, tmp_path / "raw", tmp_path / "pq", "RS", client=c)
        assert res2.pulado
        assert all(not ch.startswith("GET https://mirror.test/arquivos/2026") for ch in chamadas)
