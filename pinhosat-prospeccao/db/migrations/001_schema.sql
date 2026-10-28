-- PinhoSat Prospecção — schema inicial (compatível com PostgreSQL 14+ / Supabase)

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Tabelas de referência (Receita Federal)
-- ---------------------------------------------------------------------------
create table if not exists cnaes (
  codigo    char(7) primary key,          -- subclasse CNAE 2.3, sem pontuação (ex.: 4930202)
  descricao text not null,
  descricao_busca text not null default ''  -- descrição sem acentos, maiúscula
);

create table if not exists municipios (
  codigo     char(4) primary key,         -- código TOM usado pela Receita Federal
  nome       text not null,
  uf         char(2),                     -- preenchido a partir dos estabelecimentos importados
  nome_busca text not null                -- nome sem acentos, maiúsculo (para casar com regiões)
);
create index if not exists municipios_uf_idx on municipios (uf, nome);

-- ---------------------------------------------------------------------------
-- Empresas: um registro por ESTABELECIMENTO (CNPJ completo de 14 dígitos)
-- ---------------------------------------------------------------------------
create table if not exists empresas (
  cnpj               char(14) primary key,
  cnpj_basico        char(8)  not null,
  matriz             boolean  not null,
  razao_social       text,
  nome_fantasia      text,
  nomes_busca        text     not null default '', -- razão + fantasia normalizados (busca por palavra-chave)
  situacao           char(2)  not null,          -- 01 nula, 02 ativa, 03 suspensa, 04 inapta, 08 baixada
  data_situacao      date,
  data_inicio        date,
  cnae_principal     char(7),
  cnaes_secundarios  char(7)[] not null default '{}',
  tipo_logradouro    text,
  logradouro         text,
  numero             text,
  complemento        text,
  bairro             text,
  cep                char(8),
  uf                 char(2)  not null,
  municipio_codigo   char(4),
  telefone1          text,                       -- DDD + número, só dígitos
  telefone2          text,
  email              text,
  natureza_juridica  char(4),
  porte              char(2),                    -- 00 não informado, 01 ME, 03 EPP, 05 demais
  capital_social     numeric(18,2),
  opcao_simples      boolean,
  opcao_mei          boolean,
  fonte              text     not null default 'Receita Federal — Dados Abertos CNPJ',
  referencia         text     not null,          -- competência da base (ex.: 2026-10)
  importado_em       timestamptz not null default now()
);
create index if not exists empresas_local_idx    on empresas (uf, municipio_codigo);
create index if not exists empresas_cnae_idx     on empresas (cnae_principal);
create index if not exists empresas_cnaesec_idx  on empresas using gin (cnaes_secundarios);
create index if not exists empresas_basico_idx   on empresas (cnpj_basico);
create index if not exists empresas_nomes_trgm   on empresas using gin (nomes_busca gin_trgm_ops);
create index if not exists empresas_cep_idx      on empresas (cep);

-- Quantidade de estabelecimentos ativos por empresa (raiz do CNPJ) — recalculada a cada importação
create table if not exists empresas_grupo (
  cnpj_basico         char(8) primary key,
  estabelecimentos    int not null
);

-- ---------------------------------------------------------------------------
-- RNTRC / ANTT — transportadores rodoviários de carga registrados
-- ---------------------------------------------------------------------------
create table if not exists rntrc (
  cnpj            char(14) primary key,
  cnpj_basico     char(8) generated always as (substr(cnpj, 1, 8)) stored,
  numero_rntrc    text,
  categoria       text,          -- ETC (empresa), CTC (cooperativa)
  situacao        text,          -- ATIVO, PENDENTE, SUSPENSO, ...
  data_cadastro   date,
  data_situacao   date,
  uf              char(2),
  referencia      text not null,
  fonte           text not null default 'ANTT — RNTRC (dados abertos)'
);
create index if not exists rntrc_basico_idx on rntrc (cnpj_basico);

-- Um registro RNTRC por empresa (raiz do CNPJ), priorizando o ativo — o registro costuma estar na matriz
-- e vale para todos os estabelecimentos. Recalculado a cada importação do RNTRC.
create table if not exists rntrc_empresa (
  cnpj_basico   char(8) primary key,
  numero_rntrc  text,
  categoria     text,
  situacao      text
);

-- ---------------------------------------------------------------------------
-- Configuração comercial (editável pela interface, sem alterar código)
-- ---------------------------------------------------------------------------
create table if not exists segmentos (
  id             serial primary key,
  nome           text not null unique,
  grupo          text not null,                       -- ex.: "Transporte e logística"
  prioridade     text not null check (prioridade in ('alta','media','baixa')),
  cnaes          char(7)[] not null default '{}',
  palavras_chave text[]    not null default '{}',     -- buscadas na razão social / nome fantasia
  descricao      text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now()
);

-- Correspondência pré-calculada empresa × segmento (recalculada ao editar um segmento ou reimportar a base).
-- tipo: 1 = CNAE principal, 2 = CNAE secundário, 3 = palavra-chave no nome. Guarda a melhor correspondência.
create table if not exists empresa_segmento (
  cnpj         char(14) not null,
  segmento_id  int not null references segmentos(id) on delete cascade,
  tipo         smallint not null check (tipo between 1 and 3),
  melhor       boolean not null default false,   -- melhor segmento da empresa entre todos os ativos
  primary key (cnpj, segmento_id)
);
create index if not exists empresa_segmento_seg_idx on empresa_segmento (segmento_id, tipo);
create index if not exists empresa_segmento_melhor_idx on empresa_segmento (cnpj) where melhor;

create table if not exists regioes (
  id          serial primary key,
  nome        text not null unique,
  uf          char(2) not null,
  municipios  char(4)[] not null default '{}',
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contatos complementares (enriquecimento manual ou por fonte autorizada)
-- ---------------------------------------------------------------------------
create table if not exists contatos (
  id          bigserial primary key,
  cnpj        char(14) not null,
  tipo        text not null check (tipo in ('telefone','whatsapp','email','site')),
  valor       text not null,
  fonte       text not null,                 -- obrigatório: de onde veio a informação
  verificado  boolean not null default false,
  observacao  text,
  criado_por  text,
  criado_em   timestamptz not null default now(),
  unique (cnpj, tipo, valor)
);
create index if not exists contatos_cnpj_idx on contatos (cnpj);

-- ---------------------------------------------------------------------------
-- Listas de prospecção
-- ---------------------------------------------------------------------------
create table if not exists listas (
  id          serial primary key,
  nome        text not null unique,
  descricao   text,
  filtros     jsonb,                          -- filtros usados para gerar a lista
  criado_por  text,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists lista_itens (
  lista_id    int not null references listas(id) on delete cascade,
  cnpj        char(14) not null,
  adicionado_por text,
  adicionado_em  timestamptz not null default now(),
  primary key (lista_id, cnpj)
);
create index if not exists lista_itens_cnpj_idx on lista_itens (cnpj);

create table if not exists exportacoes (
  id          bigserial primary key,
  lista_id    int references listas(id) on delete set null,
  formato     text not null,
  quantidade  int  not null,
  campos      text[] not null,
  usuario     text,
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Controle da prospecção (1 registro por CNPJ = sem contatos duplicados)
-- ---------------------------------------------------------------------------
create table if not exists prospeccao (
  cnpj             char(14) primary key,
  status           text not null default 'novo' check (status in (
                     'novo','nao_contatado','primeiro_contato','aguardando','negociacao',
                     'futuro','sem_interesse','cliente','nao_prospectar')),
  observacoes      text,
  ultimo_contato   date,
  proximo_contato  date,
  responsavel      text,
  atualizado_por   text,
  atualizado_em    timestamptz not null default now()
);
create index if not exists prospeccao_status_idx on prospeccao (status);
create index if not exists prospeccao_proximo_idx on prospeccao (proximo_contato);

create table if not exists prospeccao_historico (
  id          bigserial primary key,
  cnpj        char(14) not null,
  status      text,
  nota        text,
  usuario     text,
  criado_em   timestamptz not null default now()
);
create index if not exists prospeccao_hist_cnpj_idx on prospeccao_historico (cnpj, criado_em desc);

-- Registro das cargas de dados (transparência sobre a atualização da base)
create table if not exists importacoes (
  id           bigserial primary key,
  fonte        text not null,          -- 'receita_federal' | 'rntrc'
  referencia   text not null,
  escopo       text,
  registros    int,
  concluido_em timestamptz not null default now()
);

create table if not exists schema_migrations (
  nome text primary key,
  aplicado_em timestamptz not null default now()
);
