"""Entrypoint da CLI `prospector`."""

from __future__ import annotations

from enum import Enum
from pathlib import Path

import typer
from rich.console import Console

from prospector.config import DEFAULT_TARGETS_PATH, ConfigError, Targets, load_targets

app = typer.Typer(help="Prospector de Frotas RS — prospecção B2B a partir de dados abertos.", no_args_is_help=True)
console = Console()

TargetsOpt = typer.Option(DEFAULT_TARGETS_PATH, "--targets", help="Caminho do targets.yaml")


def _targets(path: Path) -> Targets:
    try:
        return load_targets(path)
    except ConfigError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(code=2) from e


def _nao_implementado(fase: str) -> None:
    console.print(f"[yellow]Ainda não implementado ({fase}).[/yellow]")
    raise typer.Exit(code=1)


@app.command()
def ingest(targets: Path = TargetsOpt) -> None:
    """Baixa e converte a base CNPJ da Receita para Parquet."""
    _targets(targets)
    _nao_implementado("Fase 1")


@app.command("filter")
def filter_(targets: Path = TargetsOpt) -> None:
    """Aplica os filtros de targets.yaml e gera leads_base."""
    _targets(targets)
    _nao_implementado("Fase 1")


@app.command()
def cross(targets: Path = TargetsOpt) -> None:
    """Cruza leads com ANTT/ANP."""
    _targets(targets)
    _nao_implementado("Fase 2")


@app.command("enrich-places")
def enrich_places(limit: int = typer.Option(200, "--limit"), targets: Path = TargetsOpt) -> None:
    """Enriquece leads via Google Places API."""
    _targets(targets)
    _nao_implementado("Fase 3")


@app.command("enrich-sites")
def enrich_sites(limit: int = typer.Option(200, "--limit"), targets: Path = TargetsOpt) -> None:
    """Raspa sites dos leads para contatos e sinais de frota."""
    _targets(targets)
    _nao_implementado("Fase 4")


@app.command()
def score(targets: Path = TargetsOpt) -> None:
    """Calcula score e faixa dos leads."""
    _targets(targets)
    _nao_implementado("Fase 5")


class Destino(str, Enum):
    csv = "csv"
    supabase = "supabase"


@app.command()
def export(to: Destino = typer.Option(..., "--to"), targets: Path = TargetsOpt) -> None:
    """Exporta leads para CSV ou Supabase."""
    _targets(targets)
    _nao_implementado("Fase 6")


@app.command("run-all")
def run_all(limit: int = typer.Option(200, "--limit"), targets: Path = TargetsOpt) -> None:
    """Executa o pipeline completo."""
    _targets(targets)
    _nao_implementado("Fase 6")


if __name__ == "__main__":
    app()
