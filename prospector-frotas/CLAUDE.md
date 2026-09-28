# Prospector de Frotas RS

## Contexto do projeto
Ferramenta de prospecção B2B para uma empresa que vende **câmeras veiculares** (videomonitoramento embarcado, câmeras de fadiga/DMS, DVR veicular) para empresas com frota.

Objetivo: gerar uma lista **qualificada e pontuada** de empresas com frota no **Rio Grande do Sul**, com contatos enriquecidos, para prospecção comercial ativa.

Segmentos-alvo (prioridade): fretamento, transporte de combustíveis/produtos perigosos (incluindo TRRs), transporte de carga, transporte escolar, transporte coletivo, transporte de valores, coleta de resíduos, locadoras de veículos, ambulâncias.

## Princípio central
**Dados abertos primeiro, scraping depois.** A base de CNPJs da Receita Federal é a fonte primária (filtro por CNAE + UF=RS). Scraping serve só para enriquecer leads já identificados. Nunca raspar Google Maps nem LinkedIn: usar a Google Places API oficial.

## Stack
- Python 3.12+, gerenciado com `uv`
- `duckdb` + Parquet para a base da Receita (não carregar tudo em memória com pandas)
- `httpx` (async) + `selectolax` para scraping; `playwright` apenas como fallback para sites que exigem JS
- `pydantic` v2 para modelos e validação; `pydantic-settings` para config
- `typer` para CLI; `rich` para logs e progresso
- `tenacity` para retry com backoff
- `supabase-py` para o destino final
- `pytest` para testes

## Estrutura do repositório
```
prospector-frotas/
├── CLAUDE.md
├── PLAN.md
├── pyproject.toml
├── .env.example
├── config/
│   └── targets.yaml          # CNAEs, UF, municípios, pesos de score
├── data/                     # gitignored
│   ├── raw/                  # zips baixados da Receita
│   ├── parquet/              # tabelas convertidas
│   ├── cache/                # respostas de APIs e HTML de sites
│   └── exports/              # CSVs finais
├── src/prospector/
│   ├── cli.py                # entrypoint typer
│   ├── config.py
│   ├── models.py             # Lead e demais modelos pydantic
│   ├── ingest/receita.py     # download + conversão + filtro
│   ├── sources/antt.py
│   ├── sources/anp.py
│   ├── enrich/places.py      # Google Places API
│   ├── enrich/website.py     # scraper de sites
│   ├── scoring.py
│   └── export/               # csv.py, supabase.py
├── sql/                      # queries DuckDB e migrations Supabase
└── tests/
```

## Comandos da CLI (alvo)
```
uv run prospector ingest        # baixa e converte base da Receita
uv run prospector filter        # aplica filtros de targets.yaml → leads_base
uv run prospector cross         # cruza com ANTT/ANP
uv run prospector enrich-places --limit 200
uv run prospector enrich-sites --limit 200
uv run prospector score
uv run prospector export --to csv|supabase
uv run prospector run-all --limit 200   # pipeline completo
```

## Regras de implementação
1. **Idempotência:** toda etapa pode rodar de novo sem duplicar dados nem gastar API. Chave primária é o CNPJ completo (14 dígitos, só números).
2. **Cache obrigatório** para toda chamada externa (Places, sites). Guardar com timestamp; reprocessar só se `--force` ou cache mais velho que o TTL configurado.
3. **Controle de custo:** chamadas à Places API sempre limitadas por `--limit` e por `PLACES_MAX_CALLS_PER_RUN`. Usar field masks mínimos. Logar o total de chamadas ao final.
4. **Scraping educado:** respeitar `robots.txt`, máx. 1 req/s por domínio, timeout de 15s, user-agent identificado, no máx. 3 páginas por site (home, contato, sobre). Nunca tentar contornar bloqueios ou captchas.
5. **Config fora do código:** CNAEs, municípios, pesos de score e limites vivem em `config/targets.yaml` e `.env`. Nada hardcoded.
6. **Não confiar em layout fixo de fontes externas:** URLs e layouts da Receita/ANTT/ANP mudam. Antes de implementar um parser, baixar uma amostra real e validar as colunas. Documentar o layout encontrado em `sql/` ou docstring.
7. **LGPD:** coletar apenas dados de contato corporativos. Não armazenar CPF de sócios. Não usar a tabela de sócios para contato pessoal. Manter campo `opt_out` no lead.
8. **Testes:** cada parser e a função de score têm testes com fixtures pequenas em `tests/fixtures/`. Nunca depender de rede nos testes.
9. **Segredos** só no `.env` (nunca commitar). Manter `.env.example` atualizado.

## Variáveis de ambiente
```
GOOGLE_PLACES_API_KEY=
PLACES_MAX_CALLS_PER_RUN=300
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SCRAPER_USER_AGENT="ProspectorFrotas/0.1 (contato: email@empresa.com.br)"
CACHE_TTL_DAYS=30
```

## Definição de pronto de uma fase
- Comando da CLI funcionando de ponta a ponta
- Testes passando (`uv run pytest`)
- Critérios de aceite da fase no PLAN.md cumpridos
- PLAN.md atualizado marcando a fase como concluída, com notas do que mudou
