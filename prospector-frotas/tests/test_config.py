from pathlib import Path

import pytest
import yaml
from typer.testing import CliRunner

from prospector.cli import app
from prospector.config import DEFAULT_TARGETS_PATH, ConfigError, load_targets


def _write(tmp_path: Path, data: dict) -> Path:
    p = tmp_path / "t.yaml"
    p.write_text(yaml.safe_dump(data), encoding="utf-8")
    return p


def _base() -> dict:
    return yaml.safe_load(DEFAULT_TARGETS_PATH.read_text(encoding="utf-8"))


def test_targets_do_repo_valido():
    t = load_targets()
    assert t.uf == "RS"
    assert t.cnae_map()["4929902"] == ("fretamento", 1)


def test_cnae_mal_formatado(tmp_path):
    d = _base()
    d["segmentos"]["fretamento"]["cnaes"].append("4929-9/02")
    with pytest.raises(ConfigError, match=r"segmentos\.fretamento\.cnaes"):
        load_targets(_write(tmp_path, d))


def test_chave_desconhecida_e_peso_faltando(tmp_path):
    d = _base()
    d["scoring"]["pesos"]["peso_inventado"] = 3
    del d["scoring"]["pesos"]["tem_site"]
    with pytest.raises(ConfigError) as e:
        load_targets(_write(tmp_path, d))
    assert "peso_inventado" in str(e.value) and "tem_site" in str(e.value)


def test_cnae_duplicado_entre_segmentos(tmp_path):
    d = _base()
    d["segmentos"]["locadoras"]["cnaes"].append("4924800")
    with pytest.raises(ConfigError, match="4924800"):
        load_targets(_write(tmp_path, d))


def test_yaml_quebrado(tmp_path):
    p = tmp_path / "t.yaml"
    p.write_text("uf: [RS\n", encoding="utf-8")
    with pytest.raises(ConfigError, match="YAML inválido"):
        load_targets(p)


def test_cli_help_lista_comandos():
    r = CliRunner().invoke(app, ["--help"])
    assert r.exit_code == 0
    for cmd in ["ingest", "filter", "cross", "enrich-places", "enrich-sites", "score", "export", "run-all"]:
        assert cmd in r.output


def test_cli_config_invalida_sai_com_erro(tmp_path):
    d = _base()
    d["uf"] = "rio grande"
    r = CliRunner().invoke(app, ["score", "--targets", str(_write(tmp_path, d))])
    assert r.exit_code == 2
    assert "uf" in r.output


def test_excluir_principais_valida_cnae(tmp_path):
    d = _base()
    d["segmentos"]["locadoras"]["secundario_excluir_principais"] = ["4511-1/02"]
    with pytest.raises(ConfigError, match="secundario_excluir_principais"):
        load_targets(_write(tmp_path, d))
