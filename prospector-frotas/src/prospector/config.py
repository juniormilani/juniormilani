"""Configuração: segredos/limites do `.env` e alvos de negócio do `config/targets.yaml`."""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TARGETS_PATH = PROJECT_ROOT / "config" / "targets.yaml"

CNAE_RE = re.compile(r"^\d{7}$")


class ConfigError(Exception):
    """Erro de configuração com mensagem legível para o usuário."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", env_file_encoding="utf-8", extra="ignore")

    google_places_api_key: str = ""
    places_max_calls_per_run: int = Field(300, ge=0)
    supabase_url: str = ""
    supabase_service_key: str = ""
    scraper_user_agent: str = "ProspectorFrotas/0.1"
    cache_ttl_days: int = Field(30, ge=0)

    # Base CNPJ da Receita (ver Notas no PLAN.md sobre a URL atual).
    # Listagem de diretório com uma pasta por mês (AAAA-MM ou AAAA-MM-DD) contendo os zips.
    # Default: espelho da Casa dos Dados — o servidor oficial bloqueia IPs fora do Brasil.
    receita_base_url: str = "https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/"
    receita_mes: str = ""  # AAAA-MM[-DD]; vazio = mais recente
    receita_download_conexoes: int = Field(4, ge=1, le=16)  # trechos paralelos por arquivo grande

    data_dir: Path = PROJECT_ROOT / "data"

    @property
    def raw_dir(self) -> Path:
        return self.data_dir / "raw"

    @property
    def parquet_dir(self) -> Path:
        return self.data_dir / "parquet"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @property
    def exports_dir(self) -> Path:
        return self.data_dir / "exports"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "prospector.duckdb"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _valida_cnaes(v: list[str]) -> list[str]:
    ruins = [c for c in v if not CNAE_RE.match(str(c))]
    if ruins:
        raise ValueError(f"CNAE deve ter 7 dígitos sem pontuação (ex.: '4929902'); inválidos: {ruins}")
    return [str(c) for c in v]


class Segmento(_Strict):
    prioridade: int = Field(ge=1, le=3)
    cnaes: list[str] = Field(min_length=1)
    # Aceitar estabelecimentos que têm o CNAE do segmento só como secundário.
    match_secundario: bool = True
    # No match secundário, ignorar estabelecimentos cujo CNAE principal esteja nesta lista.
    secundario_excluir_principais: list[str] = Field(default_factory=list)

    @field_validator("cnaes", "secundario_excluir_principais")
    @classmethod
    def _cnaes_validos(cls, v: list[str]) -> list[str]:
        return _valida_cnaes(v)


class PlacesCfg(_Strict):
    match_nome_min_similaridade: int = Field(ge=0, le=100)


class Pesos(_Strict):
    cnae_principal_alvo: int
    cnae_secundario_alvo: int
    segmento_prioridade_1: int
    segmento_prioridade_2: int
    rntrc_ou_anp: int
    porte_epp_ou_demais: int
    capital_social_acima_limite: int
    tem_filiais: int
    mais_de_3_anos: int
    tem_site: int
    tem_whatsapp: int
    tem_email: int
    keywords_frota_no_site: int
    municipio_prioritario: int


class Faixas(_Strict):
    A: int = Field(ge=0, le=100)
    B: int = Field(ge=0, le=100)

    @model_validator(mode="after")
    def _ordem(self) -> "Faixas":
        if self.B >= self.A:
            raise ValueError(f"faixa B ({self.B}) deve ser menor que faixa A ({self.A})")
        return self


class Scoring(_Strict):
    pesos: Pesos
    capital_social_limite: float = Field(ge=0)
    faixas: Faixas


class Targets(_Strict):
    uf: str = Field(pattern=r"^[A-Z]{2}$")
    include_mei: bool = False
    municipios_prioritarios: list[str] = Field(default_factory=list)
    segmentos: dict[str, Segmento] = Field(min_length=1)
    keywords_site: list[str] = Field(default_factory=list)
    places: PlacesCfg
    scoring: Scoring

    @field_validator("municipios_prioritarios", mode="before")
    @classmethod
    def _none_vira_lista(cls, v: object) -> object:
        return [] if v is None else v

    @field_validator("municipios_prioritarios")
    @classmethod
    def _upper(cls, v: list[str]) -> list[str]:
        return [m.strip().upper() for m in v]

    @model_validator(mode="after")
    def _cnae_em_um_segmento(self) -> "Targets":
        vistos: dict[str, str] = {}
        for nome, seg in self.segmentos.items():
            for c in seg.cnaes:
                if c in vistos:
                    raise ValueError(f"CNAE {c} aparece nos segmentos '{vistos[c]}' e '{nome}'")
                vistos[c] = nome
        return self

    def com_secundario(self, segmentos: list[str]) -> "Targets":
        """Cópia em que só `segmentos` aceitam match secundário (sobrescreve o YAML).

        Aceita também os valores especiais `todos` e `nenhum`.
        """
        nomes = {s.strip() for s in segmentos if s.strip()}
        if nomes == {"todos"}:
            ligados = set(self.segmentos)
        elif nomes == {"nenhum"}:
            ligados = set()
        else:
            desconhecidos = nomes - set(self.segmentos)
            if desconhecidos:
                raise ConfigError(
                    f"Segmento(s) desconhecido(s) em --secundario: {sorted(desconhecidos)}. "
                    f"Use 'todos', 'nenhum' ou: {', '.join(self.segmentos)}"
                )
            ligados = nomes
        segs = {n: s.model_copy(update={"match_secundario": n in ligados}) for n, s in self.segmentos.items()}
        return self.model_copy(update={"segmentos": segs})

    def cnae_map(self) -> dict[str, tuple[str, int]]:
        """CNAE -> (segmento, prioridade)."""
        return {c: (nome, seg.prioridade) for nome, seg in self.segmentos.items() for c in seg.cnaes}


def load_targets(path: Path | str = DEFAULT_TARGETS_PATH) -> Targets:
    path = Path(path)
    if not path.exists():
        raise ConfigError(f"Arquivo de alvos não encontrado: {path}")
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        raise ConfigError(f"YAML inválido em {path}: {e}") from e
    if not isinstance(raw, dict):
        raise ConfigError(f"{path}: esperado um mapeamento no topo do arquivo")
    try:
        return Targets.model_validate(raw)
    except ValidationError as e:
        linhas = [f"Configuração inválida em {path}:"]
        for err in e.errors():
            local = ".".join(str(p) for p in err["loc"]) or "(raiz)"
            linhas.append(f"  - {local}: {err['msg']}")
        raise ConfigError("\n".join(linhas)) from e


@lru_cache
def get_settings() -> Settings:
    return Settings()
