# PLAN — Prospector de Frotas RS

Implementar uma fase por vez, na ordem. Ao concluir, marcar `[x]` e anotar desvios em "Notas".

---

## Fase 0 — Setup  [x]
**Tarefas**
- Criar projeto com `uv`, `pyproject.toml`, estrutura de pastas do CLAUDE.md
- `config.py` lendo `.env` (pydantic-settings) e `config/targets.yaml`
- CLI `typer` com os subcomandos vazios e `--help`
- `.gitignore` incluindo `data/` e `.env`
- `models.py` com o modelo `Lead` (campos na seção "Modelo de dados")

**Aceite**
- `uv run prospector --help` lista todos os comandos
- `uv run pytest` roda (mesmo com teste trivial)
- Config inválida no YAML gera erro claro

---

## Fase 1 — Ingestão da base CNPJ da Receita  [ ]
**Fonte:** dados abertos do CNPJ da Receita Federal (pesquisar a URL atual; historicamente em `arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/<AAAA-MM>/`). Pegar sempre o mês mais recente disponível.

**Arquivos necessários:** `Empresas*.zip`, `Estabelecimentos*.zip`, `Simples.zip`, `Cnaes.zip`, `Municipios.zip`, `Naturezas.zip`. (Não baixar `Socios*` — não é necessário e reduz risco LGPD.)

**Layout conhecido (validar com amostra real antes de codar):**
- CSV sem cabeçalho, separador `;`, encoding `latin-1`, strings entre aspas
- Estabelecimentos: `cnpj_basico, cnpj_ordem, cnpj_dv, identificador_matriz_filial, nome_fantasia, situacao_cadastral, data_situacao_cadastral, motivo_situacao_cadastral, nome_cidade_exterior, pais, data_inicio_atividade, cnae_fiscal_principal, cnae_fiscal_secundaria, tipo_logradouro, logradouro, numero, complemento, bairro, cep, uf, municipio, ddd_1, telefone_1, ddd_2, telefone_2, ddd_fax, fax, correio_eletronico, situacao_especial, data_situacao_especial`
- Empresas: `cnpj_basico, razao_social, natureza_juridica, qualificacao_responsavel, capital_social, porte_empresa, ente_federativo_responsavel`
- Simples: `cnpj_basico, opcao_pelo_simples, data_opcao_simples, data_exclusao_simples, opcao_mei, data_opcao_mei, data_exclusao_mei`
- Códigos: `situacao_cadastral = 02` → ATIVA; `porte_empresa`: 00 não informado, 01 micro, 03 EPP, 05 demais
- `municipio` usa código próprio da Receita (tabela Municipios), **não** o código IBGE
- `capital_social` vem com vírgula decimal
- CNAEs sem pontuação (ex.: `4929902`); secundários separados por vírgula

**Tarefas**
- `prospector ingest`: download com retomada (Range/verificação de tamanho), descompactar, converter cada CSV para Parquet via DuckDB (`read_csv` com `columns` explícitas, `all_varchar=true`)
- **Otimização:** ao converter Estabelecimentos, já filtrar `uf = 'RS'` para reduzir o volume drasticamente
- `prospector filter`: query DuckDB que gera a tabela `leads_base`:
  - `uf = 'RS'` e `situacao_cadastral = '02'`
  - CNAE principal **ou** secundário em `targets.yaml`
  - excluir MEI (`opcao_mei = 'S'`), a menos que `include_mei: true`
  - join com Empresas, Simples, Municipios, Cnaes
  - agregar `qtd_filiais` (estabelecimentos por `cnpj_basico` dentro do RS)
  - marcar `match_tipo` = `principal` | `secundario` e `segmento` a partir do mapa de CNAEs
- Exportar `data/exports/leads_base.csv`

**Aceite**
- Rodar do zero em máquina comum sem estourar RAM
- `leads_base` com contagem por segmento impressa no terminal (tabela `rich`)
- Nenhum CNPJ duplicado; CNPJ com 14 dígitos
- Teste com fixture de ~20 linhas cobrindo: inativa excluída, MEI excluído, match por secundário, outra UF excluída

> Esta fase sozinha já entrega uma lista utilizável.

---

## Fase 2 — Cruzamento ANTT e ANP  [ ]
**Tarefas**
- Pesquisar os datasets atuais de dados abertos:
  - **ANTT:** transportadores com RNTRC (dados.antt.gov.br). Verificar se há CNPJ, situação e quantidade/categoria de veículos. Também verificar lista de empresas autorizadas para fretamento.
  - **ANP:** agentes autorizados — distribuidoras e TRRs (dados abertos da ANP / gov.br).
- Baixar, normalizar CNPJ, filtrar RS, gravar em Parquet
- `prospector cross`: adicionar a `leads` os campos `rntrc_ativo`, `frota_estimada` (se disponível), `anp_autorizado`, `anp_tipo`
- Empresas presentes em ANTT/ANP mas **ausentes** de `leads_base` (CNAE fora da lista) devem ser adicionadas com `origem = 'antt'|'anp'` — são leads válidos que o filtro de CNAE perdeu

**Aceite**
- Relatório: quantos leads ganharam flag, quantos novos entraram via ANTT/ANP
- Se algum dataset não existir ou não tiver CNPJ, documentar em Notas e seguir sem ele (não bloquear o pipeline)

---

## Fase 3 — Enriquecimento via Google Places API  [ ]
**Tarefas**
- Usar Places API (New): `places:searchText` com query `"{nome_fantasia ou razao_social} {municipio} RS"`
- Field mask mínimo: `places.id, places.displayName, places.formattedAddress, places.nationalPhoneNumber, places.websiteUri, places.rating, places.userRatingCount, places.businessStatus`
- **Validação de match:** aceitar resultado só se nome tiver similaridade ≥ limiar (`rapidfuzz`) **e** município bater. Guardar `places_match_confidence`
- Ordem de processamento: leads ainda não enriquecidos, ordenados pelo score parcial (fase 5 pode rodar antes em modo "pré-score" só com dados da Receita) — gastar API primeiro nos melhores
- Cache por CNPJ em `data/cache/places/`

**Aceite**
- Respeita `--limit` e `PLACES_MAX_CALLS_PER_RUN`; imprime chamadas feitas e estimativa de custo
- Rodar duas vezes seguidas não gera nenhuma chamada nova
- Taxa de match reportada no final

---

## Fase 4 — Scraper de sites  [ ]
**Entrada:** leads com `site` (da Places ou do e-mail corporativo da Receita → domínio).

**Tarefas**
- Para cada domínio: checar `robots.txt`; buscar home; descobrir links de "contato", "fale conosco", "sobre", "quem somos"; buscar no máx. 3 páginas
- Extrair:
  - e-mails (regex + `mailto:`), descartando genéricos de plataforma (wix, sentry etc.)
  - WhatsApp (`wa.me`, `api.whatsapp.com`, números com DDD 51–55)
  - Instagram, Facebook, LinkedIn (URLs de perfil, sem visitar)
  - `keywords_encontradas`: termos de `targets.yaml` (ex.: "frota", "rastreamento", "monitoramento", "telemetria", "câmera", "segurança", "veículos", "ônibus", "caminhões", "carretas")
  - números próximos de "veículos/ônibus/caminhões" como sinal de tamanho de frota (`frota_site_estimada`, heurística simples)
- Async com semáforo por domínio (1 req/s) e concorrência global configurável
- Playwright apenas se a página vier vazia (SPA) e `--use-browser` estiver ativo

**Aceite**
- Testes com HTMLs salvos em `tests/fixtures/sites/` cobrindo cada extrator
- Relatório: % de sites acessados, % com e-mail, % com WhatsApp
- Falhas (timeout, 403, SSL) registradas em `enrich_error`, sem derrubar a execução

---

## Fase 5 — Scoring  [ ]
**Tarefas**
- `scoring.py` com regras e pesos lidos de `targets.yaml` (ver seção `scoring`)
- Score 0–100 + campo `score_motivos` (lista legível do porquê da pontuação)
- Classificar em faixas: A (≥70), B (50–69), C (<50)

**Aceite**
- Função pura, 100% testada
- Alterar peso no YAML altera o resultado sem mudar código

---

## Fase 6 — Export e Supabase  [ ]
**Tarefas**
- `export --to csv`: `data/exports/leads_rs_<data>.csv` ordenado por score, colunas amigáveis (em português)
- `export --to supabase`: upsert por `cnpj` na tabela `leads`
- Migration SQL em `sql/001_leads.sql` com a tabela, índices em `score`, `segmento`, `municipio`, `status_prospeccao`
- **Preservar campos comerciais:** upsert nunca sobrescreve `status_prospeccao`, `observacoes`, `responsavel`, `opt_out`, `ultimo_contato` — esses são editados pela equipe comercial
- `run-all` executa fases 1→6 em sequência (pulando ingestão se o Parquet do mês já existir)

**Aceite**
- Reexecutar o pipeline não apaga o trabalho comercial registrado
- CSV abre corretamente no Excel/Sheets (UTF-8 com BOM, separador `;`)

---

## Fase 7 (opcional) — Painel de prospecção  [ ]
- Interface simples (Next.js + Supabase) para: filtrar por segmento/município/faixa, mudar status (novo → contatado → reunião → proposta → fechado/perdido), anotar observações, marcar opt-out
- Métricas: leads por status, taxa de conversão por segmento (para recalibrar os pesos do score)

---

## Modelo de dados — `Lead`
| Campo | Tipo | Origem |
|---|---|---|
| cnpj (PK) | str(14) | Receita |
| razao_social, nome_fantasia | str | Receita |
| cnae_principal, cnaes_secundarios | str, list[str] | Receita |
| segmento, match_tipo | str | filtro |
| porte, capital_social, natureza_juridica | str, float, str | Receita |
| data_abertura | date | Receita |
| municipio, endereco, cep | str | Receita |
| telefone_receita, email_receita | str | Receita |
| qtd_filiais | int | Receita |
| origem | str (`receita`/`antt`/`anp`) | pipeline |
| rntrc_ativo, frota_estimada | bool, int | ANTT |
| anp_autorizado, anp_tipo | bool, str | ANP |
| place_id, site, telefone_places, rating_places, places_match_confidence | … | Places |
| emails_site, whatsapp, instagram, facebook, linkedin | … | site |
| keywords_encontradas, frota_site_estimada | list[str], int | site |
| score, faixa, score_motivos | int, str, list[str] | scoring |
| status_prospeccao, responsavel, observacoes, ultimo_contato, opt_out | … | comercial (nunca sobrescrito) |
| enriquecido_places_em, enriquecido_site_em, enrich_error | … | controle |

---

## Notas
_(registrar aqui desvios, layouts descobertos, datasets indisponíveis, decisões)_

### Fase 0 (concluída)
- Projeto criado em `prospector-frotas/` dentro do repo `juniormilani/juniormilani` (sem repo dedicado por ora).
- Python fixado em 3.13 (`.python-version`); `requires-python >=3.12`.
- Dependências só do que as fases 0–1 usam; `selectolax`, `rapidfuzz`, `playwright`, `supabase` entram nas fases correspondentes.
- `targets.yaml` validado com `extra="forbid"`: chave desconhecida, peso ausente, CNAE fora do formato 7 dígitos, CNAE repetido em dois segmentos ou faixa B ≥ A geram `ConfigError` com o caminho do campo. A CLI sai com código 2.
- `Lead.status_prospeccao` tem default `"novo"`.
