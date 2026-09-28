import csv

import duckdb
import pytest

from prospector.config import load_targets
from prospector.ingest import receita as r
from prospector.leads_base import exportar_csv, gerar_leads_base, relatorio
from tests.test_receita import montar_raw


@pytest.fixture(scope="module")
def parquet_dir(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("receita")
    zips = montar_raw(tmp / "raw")
    out = tmp / "pq"
    r.converter_mes(tmp / "raw", out, zips, "RS")
    return out


def _leads(parquet_dir, targets=None):
    targets = targets or load_targets()
    con = duckdb.connect()
    gerar_leads_base(con, parquet_dir, targets)
    cols = [d[0] for d in con.execute("SELECT * FROM leads_base").description]
    rows = {row[0]: dict(zip(cols, row)) for row in con.execute("SELECT * FROM leads_base").fetchall()}
    return con, rows


def test_leads_esperados(parquet_dir):
    _, leads = _leads(parquet_dir)
    basicos = {c[:8] for c in leads}
    assert basicos == {
        "11111111", "22222222", "66666666", "88888888", "99999999",
        "12121212", "14141414", "15151515", "18181818", "19191919",
    }
    assert len(leads) == 11  # 11111111 tem matriz + filial ativas


def test_exclusoes(parquet_dir):
    _, leads = _leads(parquet_dir)
    basicos = {c[:8] for c in leads}
    assert "11111111000303" not in leads         # filial baixada
    assert "44444444" not in basicos              # inapta
    assert "16161616" not in basicos              # suspensa
    assert "55555555" not in basicos              # MEI
    assert {"33333333", "13131313", "17171717"}.isdisjoint(basicos)  # outra UF
    assert {"77777777", "20202020"}.isdisjoint(basicos)              # CNAE fora da lista


def test_match_secundario_escolhe_maior_prioridade(parquet_dir):
    _, leads = _leads(parquet_dir)
    l = leads["22222222000104"]
    assert l["match_tipo"] == "secundario"
    assert l["segmento"] == "combustiveis_perigosos"   # prioridade 1 vence carga (2)
    assert l["outros_segmentos"] == ["transporte_carga"]
    assert l["cnaes_secundarios"] == ["4930202", "4930203"]


def test_principal_vence_secundario(parquet_dir):
    _, leads = _leads(parquet_dir)
    l = leads["99999999000111"]
    assert (l["match_tipo"], l["segmento"]) == ("principal", "locadoras")
    assert l["outros_segmentos"] == ["fretamento"]


def test_campos_derivados(parquet_dir):
    _, leads = _leads(parquet_dir)
    l = leads["11111111000101"]
    assert l["qtd_filiais"] == 2          # só estabelecimentos ativos no RS
    assert l["matriz_filial"] == "matriz"
    assert l["municipio"] == "PORTO ALEGRE"
    assert l["porte"] == "DEMAIS"
    assert l["capital_social"] == 150000.0
    assert l["email_receita"] == "contato@fretasul.com.br"
    assert l["telefone_receita"] == "5133334444"
    assert str(l["data_abertura"]) == "2015-03-10"
    assert l["natureza_juridica"] == "Sociedade Empresária Limitada"
    assert leads["88888888000110"]["capital_social"] == pytest.approx(1234567.89)
    assert leads["15151515000115"]["nome_fantasia"] is None
    assert leads["14141414000114"]["optante_simples"] is False  # sem linha no Simples


def test_cnpj_unico_14_digitos(parquet_dir):
    con, leads = _leads(parquet_dir)
    assert all(len(c) == 14 and c.isdigit() for c in leads)
    assert con.execute("SELECT count(*) = count(DISTINCT cnpj) FROM leads_base").fetchone()[0]


def test_include_mei(parquet_dir):
    t = load_targets().model_copy(update={"include_mei": True})
    _, leads = _leads(parquet_dir, t)
    assert "55555555000107" in leads
    assert leads["55555555000107"]["mei"] is True


def test_yaml_muda_resultado(parquet_dir):
    t = load_targets()
    segs = dict(t.segmentos)
    segs.pop("ambulancias")
    _, leads = _leads(parquet_dir, t.model_copy(update={"segmentos": segs}))
    assert "88888888000110" not in leads


def test_relatorio_e_csv(parquet_dir, tmp_path):
    t = load_targets()
    con, _ = _leads(parquet_dir, t)
    rel = {x.segmento: x for x in relatorio(con, t)}
    assert rel["fretamento"].total == 2 and rel["fretamento"].matrizes == 1
    assert rel["transporte_escolar"].total == 1 and rel["transporte_escolar"].mei_excluidos == 1
    assert rel["combustiveis_perigosos"].secundario == 1
    assert sum(x.total for x in rel.values()) == 11

    out = exportar_csv(con, tmp_path / "leads_base.csv")
    with out.open(encoding="utf-8") as fh:
        linhas = list(csv.DictReader(fh))
    assert len(linhas) == 11
    l = next(x for x in linhas if x["cnpj"] == "22222222000104")
    assert l["cnaes_secundarios"] == "4930202,4930203"
