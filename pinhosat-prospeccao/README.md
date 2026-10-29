# PinhoSat Prospecção — gerador de listas B2B (MVP)

Ferramenta interna da equipe comercial da PinhoSat para **encontrar, qualificar, salvar e exportar empresas com frota**
(transportadoras, distribuidoras, desentupidoras, locadoras, construtoras etc.) e acompanhar a prospecção sem
contatar a mesma empresa duas vezes.

> A proposta técnica e comercial completa (arquitetura, fontes, custos, prazos e escopo) está em [`PROPOSTA.md`](./PROPOSTA.md).

## O que o MVP faz

| Área | Recursos |
|---|---|
| Busca | Texto livre (nome, CNPJ, atividade), segmentos (vários ao mesmo tempo), CNAEs avulsos, UF, regiões, cidades, CEP, situação cadastral, porte, matriz/filial, tempo de atividade, capital social, excluir MEI |
| Filtros comerciais | Com telefone, com celular, com e-mail, com e-mail de domínio próprio, com site verificado, RNTRC ativo (ANTT), potencial, fora da base / não contatadas |
| Score ICP | Perfis de cliente ideal configuráveis (um por produto), score 0–100 por aderência ponderada, faixas A/B/C/D, eliminatórios e detalhamento por critério |
| Potencial de frota | Pontuação **explicável** (cada ponto tem um motivo visível) e níveis Alto / Médio / A verificar |
| Listas | Selecionar, remover, salvar com nome, adicionar a listas existentes, aviso de duplicados por CNPJ e por grupo (matriz/filial) |
| Exportação | Excel (.xlsx) e CSV, com escolha dos campos e registro de cada exportação |
| Prospecção | Status (9 etapas), observações, último contato, próximo acompanhamento, responsável, histórico e painel de retornos |
| Configuração | Segmentos (CNAEs + palavras-chave) e regiões editáveis pela interface, sem alterar código |
| LGPD | Fonte e data em todo dado, CPF removido da razão social de MEI, pessoas físicas do RNTRC descartadas, botão de exclusão/oposição, acesso restrito |

## Fontes de dados

| Fonte | O que traz | Custo | Atualização |
|---|---|---|---|
| [Receita Federal — Dados Abertos CNPJ](https://arquivos.receitafederal.gov.br/index.php/s/gn672Ad4CF8N6TK) | Cadastro completo: razão social, fantasia, CNAEs, endereço, **telefones e e-mail declarados**, porte, capital, Simples/MEI | Gratuito | Mensal |
| [ANTT — RNTRC](https://dados.antt.gov.br/dataset/rntrc) | Empresas registradas como transportadoras rodoviárias de carga (situação e nº do registro) | Gratuito | Mensal |
| Contatos complementares | WhatsApp confirmado, site, e-mail do responsável — cadastrados pela equipe ou por API contratada, sempre com a fonte | — | Contínua |
| Verificação de site | Testa se o domínio do e-mail corporativo responde como site | Gratuito | Sob demanda |

## Como rodar

Pré-requisitos: Node.js 20+ e PostgreSQL 14+ (local ou Supabase).

```bash
npm install
cp .env.example .env          # ajuste DATABASE_URL e APP_USERS
export $(grep -v '^#' .env | xargs)
npm run db:migrate            # cria as tabelas e os 27 segmentos iniciais
```

### Carregar os dados

1. Baixe os arquivos da competência mais recente da Receita Federal para `./dados-rf`
   (`Cnaes.zip`, `Municipios.zip`, `Estabelecimentos0..9.zip`, `Empresas0..9.zip`, `Simples.zip` — ~7 GB).
2. Baixe o CSV mais recente de transportadores do RNTRC (ANTT).
3. Importe:

```bash
npm run importar:rf -- --dir ./dados-rf --ref 2026-10 --ufs RS
npm run importar:rntrc -- --arquivo ./dados-rf/transportadores_rntrc_09_2026.csv --ref 2026-09
npm run db:regioes            # regiões iniciais + região dos perfis ICP
```

- `--ufs RS,SC,PR` importa vários estados; `--ufs todas` importa o Brasil inteiro.
- Por padrão são importados estabelecimentos ativos, suspensos e inaptos (`--situacoes todas` inclui baixados).
- Reimportar uma competência nova **atualiza** as empresas (upsert por CNPJ) e não mexe em listas e histórico.
- Ao final, o importador classifica as empresas nos segmentos (tabela `empresa_segmento`). Editar um segmento pela
  interface reclassifica só ele; `npm run db:classificar` refaz tudo.

### Subir a aplicação

```bash
npm run build && npm start    # http://localhost:3000 (login com um usuário de APP_USERS)
```

Testes e verificação: `npm test` e `npm run typecheck`.

## Estrutura

```
app/                 páginas (busca, listas, empresa, acompanhamento, configurações) e rotas /api
components/          tabela de resultados, modais de exportação e de lista
lib/busca.ts         montagem da consulta + pontuação de potencial (fonte única das regras)
lib/classificacao.ts classificação pré-calculada empresa × segmento
lib/icp.ts           perfis de cliente ideal: validação e expressões do score
lib/campos.ts        campos exportáveis
db/migrations/       schema SQL e segmentos iniciais
scripts/             importadores (Receita Federal, RNTRC) e regiões iniciais
```

## Score ICP (perfil de cliente ideal)

O **score ICP** mede o quanto a empresa se parece com o cliente ideal de um produto. O **potencial de frota**
(seção seguinte) mede a evidência de que ela tem veículos. Os dois aparecem lado a lado.

Cada perfil (tela *ICP e segmentos*) dá um peso de 0 a 10 a cada critério. A aderência da empresa vai de 0 a 100%:

| Critério | Aderência |
|---|---|
| Segmento | CNAE principal em segmento do ICP = 100%; só secundário ou só pelo nome = 50% |
| Porte | Porte na lista ideal = 100% |
| Capital social | Proporcional até o mínimo ideal |
| Tempo de atividade | Proporcional até os anos mínimos |
| Estrutura | Proporcional até o nº mínimo de estabelecimentos |
| Frota (RNTRC) | Ativo = 100%; outra situação = 30% |
| Localização | Dentro das regiões do perfil = 100% |
| Contato | Telefone 50% + celular 25% + e-mail corporativo 25% |

`score = 100 × Σ(peso × aderência) / Σ(pesos)`. Faixas: **A ≥ 75**, **B ≥ 50**, **C ≥ 25**, **D** abaixo.
Eliminatórios configuráveis (MEI, situação não ativa, sem telefone) zeram o score.

Vêm três perfis prontos: *Rastreamento e telemetria — frotas médias* (padrão), *Câmeras de baú — entregas urbanas*
e *Videomonitoramento — passageiros e cargas perigosas*. A busca, as listas e a exportação permitem trocar o perfil, e
o score de cada empresa é recalculado na hora.

## Como a pontuação de potencial de frota funciona

Cada critério soma ou subtrai pontos e aparece como motivo na tela (botão “por quê?”) e na exportação:

| Critério | Pontos |
|---|---|
| CNAE principal em segmento de prioridade alta / média / baixa | +40 / +30 / +20 |
| CNAE secundário no segmento | +15 |
| Palavra-chave do segmento no nome (ex.: DESENTUP*) | +20 |
| Registro ATIVO no RNTRC (ANTT) | +25 |
| Porte Demais / EPP | +15 / +10 |
| Capital ≥ R$ 1 mi / ≥ R$ 100 mil | +10 / +5 |
| Mais de 5 anos de atividade / menos de 1 ano | +5 / −5 |
| Possui filiais | +5 |
| Telefone / e-mail / e-mail com domínio próprio | +5 / +3 / +2 |
| Optante pelo MEI | −25 |
| Situação cadastral não ativa | −50 |

- **Alto potencial:** ≥ 60 pontos **e** evidência de frota (RNTRC ativo, ou CNAE principal de segmento prioritário com porte EPP/Demais, capital ≥ R$ 100 mil ou filiais).
- **Potencial médio:** ≥ 35 pontos.
- **A verificar:** demais casos.

As fontes públicas não informam a quantidade de veículos; o sistema não estima nem inventa esse número.
