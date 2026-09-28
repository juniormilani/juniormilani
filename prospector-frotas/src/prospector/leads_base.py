"""Etapa `filter`: aplica targets.yaml sobre o Parquet da Receita e gera `leads_base`."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import duckdb

from prospector.config import PROJECT_ROOT, Targets

SQL_PATH = PROJECT_ROOT / "sql" / "leads_base.sql"
TABELAS_PARQUET = ["estabelecimentos", "empresas", "simples", "cnaes", "municipios", "naturezas"]


@dataclass
class LinhaRelatorio:
    segmento: str
    prioridade: int
    total: int
    principal: int
    secundario: int
    matrizes: int
    mei_excluidos: int
    secundario_filtrados: int
    match_secundario: bool


def gerar_leads_base(con: duckdb.DuckDBPyConnection, parquet_dir: Path, targets: Targets) -> int:
    for t in TABELAS_PARQUET:
        arq = parquet_dir / f"{t}.parquet"
        if not arq.exists():
            raise FileNotFoundError(f"{arq} não encontrado. Rode `prospector ingest`.")
        con.execute(f"CREATE OR REPLACE VIEW {t} AS SELECT * FROM read_parquet('{arq.as_posix()}')")

    ordem = {nome: i for i, nome in enumerate(targets.segmentos)}
    alvo = [
        (c, seg, prio, ordem[seg], targets.segmentos[seg].match_secundario)
        for c, (seg, prio) in targets.cnae_map().items()
    ]
    con.execute(
        "CREATE OR REPLACE TABLE alvo_cnae "
        "(cnae VARCHAR PRIMARY KEY, segmento VARCHAR, prioridade INT, ordem INT, aceita_secundario BOOLEAN)"
    )
    con.executemany("INSERT INTO alvo_cnae VALUES (?, ?, ?, ?, ?)", alvo)
    excluir = [(n, c) for n, s in targets.segmentos.items() for c in s.secundario_excluir_principais]
    con.execute("CREATE OR REPLACE TABLE excluir_principal (segmento VARCHAR, cnae VARCHAR)")
    if excluir:
        con.executemany("INSERT INTO excluir_principal VALUES (?, ?)", excluir)
    con.execute("CREATE OR REPLACE TABLE parametros AS SELECT ?::VARCHAR AS uf, ?::BOOLEAN AS include_mei", [targets.uf, targets.include_mei])

    con.execute(SQL_PATH.read_text(encoding="utf-8"))

    dup, ruins = con.execute(
        "SELECT count(*) - count(DISTINCT cnpj), count(*) FILTER (WHERE NOT regexp_full_match(cnpj, '\\d{14}')) FROM leads_base"
    ).fetchone()
    if dup or ruins:
        raise RuntimeError(f"leads_base inconsistente: {dup} CNPJs duplicados, {ruins} CNPJs fora do formato de 14 dígitos")
    return con.execute("SELECT count(*) FROM leads_base").fetchone()[0]


def relatorio(con: duckdb.DuckDBPyConnection, targets: Targets) -> list[LinhaRelatorio]:
    base = dict(
        (r[0], r[1:]) for r in con.execute(
            """SELECT segmento, count(*), count(*) FILTER (match_tipo='principal'),
                      count(*) FILTER (match_tipo='secundario'), count(*) FILTER (matriz_filial='matriz')
               FROM leads_base GROUP BY 1"""
        ).fetchall()
    )
    # excluídos por MEI (entre os que passariam no filtro de secundário) e por filtro de secundário
    mei = dict(con.execute(
        "SELECT segmento, count(*) FROM leads_candidatos WHERE mei AND NOT secundario_filtrado GROUP BY 1"
    ).fetchall())
    sec_filt = dict(con.execute(
        "SELECT segmento, count(*) FROM leads_candidatos, parametros p "
        "WHERE secundario_filtrado AND (p.include_mei OR NOT mei) GROUP BY 1"
    ).fetchall())
    linhas = []
    for nome, seg in targets.segmentos.items():
        tot, pri, sec, mat = base.get(nome, (0, 0, 0, 0))
        mei_exc = 0 if targets.include_mei else mei.get(nome, 0)
        linhas.append(LinhaRelatorio(nome, seg.prioridade, tot, pri, sec, mat, mei_exc,
                                     sec_filt.get(nome, 0), seg.match_secundario))
    return linhas


def exportar_csv(con: duckdb.DuckDBPyConnection, destino: Path) -> Path:
    """CSV intermediário (UTF-8, `,`); listas viram texto separado por vírgula."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    con.execute(
        f"""COPY (
              SELECT * REPLACE (array_to_string(cnaes_secundarios, ',') AS cnaes_secundarios,
                                array_to_string(outros_segmentos, ',') AS outros_segmentos)
              FROM leads_base ORDER BY segmento, municipio, cnpj
            ) TO '{destino.as_posix()}' (HEADER, DELIMITER ',')"""
    )
    return destino
