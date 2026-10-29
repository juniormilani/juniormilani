-- Perfis de cliente ideal (ICP). Os critérios ficam em JSON (validados em lib/icp.ts) e são editados em /configuracoes.
create table if not exists icps (
  id          serial primary key,
  nome        text not null unique,
  descricao   text,
  criterios   jsonb not null,
  padrao      boolean not null default false,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- No máximo um perfil padrão.
create unique index if not exists icps_um_padrao on icps (padrao) where padrao;

-- Perfis iniciais, um por linha de produto. Segmentos são referenciados pelo nome do seed 002.
-- A localização (regiões) é preenchida por scripts/seed-regioes.ts, depois que as regiões existirem.
insert into icps (nome, descricao, padrao, criterios)
select 'Rastreamento e telemetria — frotas médias',
  'Transportadoras e operações de campo com frota própria registrada, porte EPP ou maior, na Grande Porto Alegre.',
  true,
  jsonb_build_object(
    'segmentos', jsonb_build_object('peso', 3, 'ids', (select coalesce(jsonb_agg(id), '[]') from segmentos where nome in (
      'Transportadoras de cargas', 'Cargas perigosas, combustíveis e químicos', 'Logística e armazenagem',
      'Distribuidoras de bebidas', 'Distribuidoras de alimentos', 'Distribuidoras e revendas de gás (GLP)',
      'Coleta e transporte de resíduos', 'Desentupimento, limpa-fossa e hidrojateamento', 'Terraplenagem, demolição e fundações',
      'Concreteiras', 'Locadoras de máquinas e equipamentos', 'Locação de caminhões e veículos',
      'Guinchos, reboques e transporte de veículos/máquinas'))),
    'porte', jsonb_build_object('peso', 2, 'valores', jsonb_build_array('03', '05')),
    'capital', jsonb_build_object('peso', 2, 'minimo', 100000),
    'idade', jsonb_build_object('peso', 1, 'anosMinimo', 3),
    'estabelecimentos', jsonb_build_object('peso', 1, 'minimo', 2),
    'rntrc', jsonb_build_object('peso', 3),
    'localizacao', jsonb_build_object('peso', 2, 'regioes', '[]'::jsonb),
    'contato', jsonb_build_object('peso', 1),
    'eliminatorios', jsonb_build_object('mei', true, 'inativa', true, 'semTelefone', false))
on conflict (nome) do nothing;

insert into icps (nome, descricao, criterios)
select 'Câmeras de baú — entregas urbanas',
  'Distribuidoras e transportadoras com caminhões baú em entregas urbanas; aceita empresas menores.',
  jsonb_build_object(
    'segmentos', jsonb_build_object('peso', 4, 'ids', (select coalesce(jsonb_agg(id), '[]') from segmentos where nome in (
      'Distribuidoras de bebidas', 'Distribuidoras de alimentos', 'Transportadoras de cargas', 'Logística e armazenagem',
      'Coleta e entrega (courier)', 'Mudanças e transporte especializado', 'Atacadistas em geral'))),
    'porte', jsonb_build_object('peso', 1, 'valores', jsonb_build_array('01', '03', '05')),
    'capital', jsonb_build_object('peso', 1, 'minimo', 50000),
    'idade', jsonb_build_object('peso', 1, 'anosMinimo', 2),
    'estabelecimentos', jsonb_build_object('peso', 0, 'minimo', 2),
    'rntrc', jsonb_build_object('peso', 2),
    'localizacao', jsonb_build_object('peso', 2, 'regioes', '[]'::jsonb),
    'contato', jsonb_build_object('peso', 2),
    'eliminatorios', jsonb_build_object('mei', true, 'inativa', true, 'semTelefone', true))
on conflict (nome) do nothing;

insert into icps (nome, descricao, criterios)
select 'Videomonitoramento — passageiros e cargas perigosas',
  'Ônibus, fretamento, transporte escolar e cargas perigosas: exigência de segurança e registro de ocorrências.',
  jsonb_build_object(
    'segmentos', jsonb_build_object('peso', 4, 'ids', (select coalesce(jsonb_agg(id), '[]') from segmentos where nome in (
      'Fretamento e turismo rodoviário', 'Ônibus — linhas regulares', 'Transporte escolar',
      'Cargas perigosas, combustíveis e químicos', 'Distribuidoras e revendas de gás (GLP)', 'Segurança patrimonial e transporte de valores'))),
    'porte', jsonb_build_object('peso', 2, 'valores', jsonb_build_array('03', '05')),
    'capital', jsonb_build_object('peso', 1, 'minimo', 200000),
    'idade', jsonb_build_object('peso', 1, 'anosMinimo', 5),
    'estabelecimentos', jsonb_build_object('peso', 1, 'minimo', 2),
    'rntrc', jsonb_build_object('peso', 1),
    'localizacao', jsonb_build_object('peso', 1, 'regioes', '[]'::jsonb),
    'contato', jsonb_build_object('peso', 1),
    'eliminatorios', jsonb_build_object('mei', true, 'inativa', true, 'semTelefone', false))
on conflict (nome) do nothing;
