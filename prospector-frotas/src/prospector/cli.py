"""Entrypoint da CLI `prospector`."""

from __future__ import annotations

from enum import Enum
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from prospector.config import DEFAULT_TARGETS_PATH, ConfigError, Targets, get_settings, load_targets

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
def ingest(
    targets: Path = TargetsOpt,
    force: bool = typer.Option(False, "--force", help="Reconverte mesmo se o mês já estiver em Parquet"),
    delete_raw: bool = typer.Option(False, "--delete-raw", help="Apaga cada zip depois de convertido"),
) -> None:
    """Baixa e converte a base CNPJ da Receita para Parquet (filtrando a UF do targets.yaml)."""
    from prospector.ingest.receita import ingest as run_ingest

    t = _targets(targets)
    s = get_settings()
    res = run_ingest(s.receita_base_url, s.raw_dir, s.parquet_dir, t.uf, s.receita_mes, force=force, apagar_raw=delete_raw,
                     conexoes=s.receita_download_conexoes)
    tab = Table(title=f"Base CNPJ {res.mes} — UF {t.uf}" + (" (já existente)" if res.pulado else ""))
    tab.add_column("tabela")
    tab.add_column("linhas", justify="right")
    for nome, n in res.linhas.items():
        tab.add_row(nome, f"{n:,}")
    console.print(tab)


@app.command("filter")
def filter_(targets: Path = TargetsOpt) -> None:
    """Aplica os filtros de targets.yaml e gera leads_base (+ data/exports/leads_base.csv)."""
    import duckdb

    from prospector.ingest.receita import mes_mais_recente_local
    from prospector.leads_base import exportar_csv, gerar_leads_base, relatorio

    t = _targets(targets)
    s = get_settings()
    try:
        parquet_dir = mes_mais_recente_local(s.parquet_dir)
    except RuntimeError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(code=1) from e
    s.db_path.parent.mkdir(parents=True, exist_ok=True)
    with duckdb.connect(str(s.db_path)) as con:
        total = gerar_leads_base(con, parquet_dir, t)
        csv_path = exportar_csv(con, s.exports_dir / "leads_base.csv")
        linhas = relatorio(con, t)
        dups = con.execute("SELECT count(*) - count(DISTINCT substr(cnpj, 1, 8)) FROM leads_base").fetchone()[0]

    tab = Table(title=f"leads_base — {parquet_dir.name} — UF {t.uf}")
    for col, just in [("segmento", "left"), ("prio", "right"), ("leads", "right"), ("por CNAE principal", "right"),
                      ("por secundário", "right"), ("matrizes", "right"), ("MEI excluídos", "right")]:
        tab.add_column(col, justify=just)
    for r in sorted(linhas, key=lambda r: (r.prioridade, -r.total)):
        tab.add_row(r.segmento, str(r.prioridade), f"{r.total:,}", f"{r.principal:,}", f"{r.secundario:,}",
                    f"{r.matrizes:,}", f"{r.mei_excluidos:,}")
    tab.add_section()
    tab.add_row("TOTAL", "", f"{total:,}", f"{sum(r.principal for r in linhas):,}", f"{sum(r.secundario for r in linhas):,}",
                f"{sum(r.matrizes for r in linhas):,}", f"{sum(r.mei_excluidos for r in linhas):,}")
    console.print(tab)
    console.print(f"Empresas distintas (cnpj_basico): {total - dups:,}")
    console.print(f"CSV: {csv_path}")


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
