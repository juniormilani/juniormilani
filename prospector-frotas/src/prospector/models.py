"""Modelos pydantic do domínio."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Origem = Literal["receita", "antt", "anp"]
MatchTipo = Literal["principal", "secundario"]
Faixa = Literal["A", "B", "C"]


def normaliza_cnpj(valor: str) -> str:
    """Remove pontuação e valida 14 dígitos."""
    digitos = re.sub(r"\D", "", valor or "")
    if len(digitos) != 14:
        raise ValueError(f"CNPJ deve ter 14 dígitos, recebido: {valor!r}")
    return digitos


class Lead(BaseModel):
    # Receita
    cnpj: str
    razao_social: str | None = None
    nome_fantasia: str | None = None
    cnae_principal: str | None = None
    cnaes_secundarios: list[str] = Field(default_factory=list)
    porte: str | None = None
    capital_social: float | None = None
    natureza_juridica: str | None = None
    data_abertura: date | None = None
    municipio: str | None = None
    endereco: str | None = None
    cep: str | None = None
    telefone_receita: str | None = None
    email_receita: str | None = None
    qtd_filiais: int = 1

    # filtro
    segmento: str | None = None
    match_tipo: MatchTipo | None = None

    # pipeline
    origem: Origem = "receita"

    # ANTT / ANP
    rntrc_ativo: bool | None = None
    frota_estimada: int | None = None
    anp_autorizado: bool | None = None
    anp_tipo: str | None = None

    # Places
    place_id: str | None = None
    site: str | None = None
    telefone_places: str | None = None
    rating_places: float | None = None
    places_match_confidence: float | None = None

    # site
    emails_site: list[str] = Field(default_factory=list)
    whatsapp: str | None = None
    instagram: str | None = None
    facebook: str | None = None
    linkedin: str | None = None
    keywords_encontradas: list[str] = Field(default_factory=list)
    frota_site_estimada: int | None = None

    # scoring
    score: int | None = Field(default=None, ge=0, le=100)
    faixa: Faixa | None = None
    score_motivos: list[str] = Field(default_factory=list)

    # comercial (nunca sobrescrito pelo pipeline)
    status_prospeccao: str = "novo"
    responsavel: str | None = None
    observacoes: str | None = None
    ultimo_contato: datetime | None = None
    opt_out: bool = False

    # controle
    enriquecido_places_em: datetime | None = None
    enriquecido_site_em: datetime | None = None
    enrich_error: str | None = None

    @field_validator("cnpj", mode="before")
    @classmethod
    def _cnpj(cls, v: str) -> str:
        return normaliza_cnpj(str(v))
