// Montagem da consulta de busca de empresas + classificação de potencial comercial.
// Tudo é calculado no SQL para permitir ordenar e filtrar por potencial sobre o resultado inteiro.

import { LIMITE_MAXIMO, type FiltrosBusca } from './filtros';
import { expressoesIcp, faixaSql, type IcpCarregado } from './icp';
import { Params, txt } from './sql';
import { normalizar, soDigitos } from './texto';

/** Provedores de e-mail gratuitos (regex SQL): e-mail fora desta lista é tratado como corporativo. */
export const REGEX_EMAIL_GRATUITO =
  '@(gmail|hotmail|outlook|live|yahoo|ymail|bol|uol|terra|ig|msn|icloud|me|globo|r7|zipmail|pop|ibest|oi|brturbo|protonmail)\\.|contab|contador|escritorio';

/** Critérios da pontuação. Cada um vira um termo da soma e um "motivo" legível. */
export interface Criterio {
  quando: string;     // condição SQL sobre as colunas da CTE "base"
  pontos: number;
  motivo: string;     // expressão SQL que gera o texto exibido ao usuário
}

export function criteriosPontuacao(): Criterio[] {
  return [
    // Segmento (atividade)
    { quando: `b.match_tipo = 1 and s.prioridade = 'alta'`, pontos: 40,
      motivo: `'CNAE principal no segmento "' || s.nome || '" (prioridade alta)'` },
    { quando: `b.match_tipo = 1 and s.prioridade = 'media'`, pontos: 30,
      motivo: `'CNAE principal no segmento "' || s.nome || '" (prioridade média)'` },
    { quando: `b.match_tipo = 1 and s.prioridade = 'baixa'`, pontos: 20,
      motivo: `'CNAE principal no segmento "' || s.nome || '" (prioridade baixa)'` },
    { quando: `b.match_tipo = 2`, pontos: 15,
      motivo: `'CNAE secundário no segmento "' || s.nome || '" (atividade principal é outra)'` },
    { quando: `b.match_tipo = 3`, pontos: 20,
      motivo: `'Nome da empresa indica o segmento "' || s.nome || '" (CNAE não confirma)'` },
    // Evidência de frota: registro na ANTT
    { quando: `b.rntrc_situacao = 'ATIVO'`, pontos: 25,
      motivo: `'Registro ATIVO no RNTRC/ANTT (transportador de cargas, nº ' || b.numero_rntrc || ')'` },
    { quando: `b.rntrc_situacao is not null and b.rntrc_situacao <> 'ATIVO'`, pontos: 5,
      motivo: `'Possui registro no RNTRC/ANTT com situação ' || b.rntrc_situacao` },
    // Porte e estrutura
    { quando: `b.porte = '05'`, pontos: 15, motivo: txt('Porte "Demais" (acima de EPP)') },
    { quando: `b.porte = '03'`, pontos: 10, motivo: txt('Porte EPP') },
    { quando: `b.opcao_mei`, pontos: -25, motivo: txt('Optante pelo MEI (baixa chance de frota)') },
    { quando: `b.capital_social >= 1000000`, pontos: 10, motivo: txt('Capital social ≥ R$ 1 milhão') },
    { quando: `b.capital_social >= 100000 and b.capital_social < 1000000`, pontos: 5,
      motivo: txt('Capital social ≥ R$ 100 mil') },
    { quando: `b.data_inicio <= current_date - interval '5 years'`, pontos: 5, motivo: txt('Mais de 5 anos de atividade') },
    { quando: `b.data_inicio > current_date - interval '1 year'`, pontos: -5, motivo: txt('Aberta há menos de 1 ano') },
    { quando: `b.filiais > 0`, pontos: 5, motivo: `'Empresa com ' || (b.filiais + 1) || ' estabelecimentos'` },
    // Contato disponível
    { quando: `b.tem_telefone`, pontos: 5, motivo: txt('Telefone disponível') },
    { quando: `b.tem_email`, pontos: 3, motivo: txt('E-mail disponível') },
    { quando: `b.email_corporativo`, pontos: 2, motivo: txt('E-mail com domínio próprio (presença digital)') },
    // Situação
    { quando: `b.situacao <> '02'`, pontos: -50, motivo: txt('Situação cadastral não está ativa') },
  ];
}

/** Evidência mínima de operação com frota exigida para "Alto potencial". */
const EVIDENCIA_FROTA = `(b.rntrc_situacao = 'ATIVO' or (b.match_tipo = 1 and s.prioridade = 'alta'
  and (b.porte in ('03','05') or b.capital_social >= 100000 or b.filiais > 0)))`;

export const LIMIARES = { alto: 60, medio: 35 };

export interface ConsultaMontada {
  sql: string;
  params: unknown[];
}

/**
 * Monta a consulta. A correspondência empresa × segmento vem da tabela pré-calculada
 * "empresa_segmento" (ver lib/classificacao.ts); aqui só escolhemos o melhor segmento de cada empresa
 * entre os selecionados (ou entre todos os ativos, se nenhum foi selecionado).
 */
export function montarConsulta(f: FiltrosBusca, regioesMunicipios: string[] = [], icp: IcpCarregado | null = null): ConsultaMontada {
  const p = new Params();
  const ic = icp ? expressoesIcp(icp, p) : null;
  const where: string[] = [];
  const amplo = (f.modoSegmento ?? 'amplo') === 'amplo';
  const selecionados = f.segmentos?.length ? f.segmentos : null;
  const refSegs = selecionados ? p.add(selecionados) : null;
  const tipoMax = amplo ? 3 : 1; // 1 = CNAE principal, 2 = CNAE secundário, 3 = palavra-chave no nome

  // Segmento exibido: sem seleção, o melhor pré-calculado (junção simples); com seleção, o melhor entre os escolhidos.
  const juncaoSegmento = !refSegs && amplo
    ? `left join (empresa_segmento sme join segmentos sgm on sgm.id = sme.segmento_id and sgm.ativo)
         on sme.cnpj = e.cnpj and sme.melhor
       left join lateral (select sme.segmento_id, sme.tipo, sgm.nome, sgm.prioridade) sm on true`
    : `left join lateral (
    select es.segmento_id, es.tipo, sg.nome, sg.prioridade
    from empresa_segmento es join segmentos sg on sg.id = es.segmento_id and sg.ativo
    where es.cnpj = e.cnpj and es.tipo <= ${tipoMax}${refSegs ? ` and es.segmento_id = any(${refSegs}::int[])` : ''}
    order by es.tipo, case sg.prioridade when 'alta' then 0 when 'media' then 1 else 2 end, sg.id
    limit 1
  ) sm on true`;

  // --- Texto livre: CNPJ, raiz do CNPJ, nome ou atividade ---
  if (f.texto) {
    const dig = soDigitos(f.texto);
    if (dig.length === 14 && dig.length >= f.texto.replace(/[\s./-]/g, '').length) {
      where.push(`e.cnpj = ${p.add(dig)}`);
    } else if (dig.length === 8 && dig.length >= f.texto.replace(/[\s./-]/g, '').length) {
      where.push(`e.cnpj_basico = ${p.add(dig)}`);
    } else {
      const termo = `%${normalizar(f.texto).replace(/[\\%_]/g, '\\$&')}%`;
      const ref = p.add(termo);
      where.push(`(e.nomes_busca like ${ref} or e.cnae_principal in (select codigo from cnaes where descricao_busca like ${ref}))`);
    }
  }

  if (f.cnpjs) where.push(`e.cnpj = any(${p.add(f.cnpjs)}::char(14)[])`);

  // --- Geografia ---
  const filtrosLocais: string[] = [];
  if (f.ufs?.length) filtrosLocais.push(`uf = any(${p.add(f.ufs)}::char(2)[])`);
  const municipios = [...new Set([...(f.municipios ?? []), ...regioesMunicipios])];
  if (municipios.length) filtrosLocais.push(`municipio_codigo = any(${p.add(municipios)}::char(4)[])`);
  if (f.cep) where.push(`e.cep like ${p.add(f.cep + '%')}`);

  // --- Cadastro ---
  const situacoes = f.situacoes?.length ? f.situacoes : f.cnpjs ? [] : ['02'];
  if (situacoes.length) filtrosLocais.push(`situacao = any(${p.add(situacoes)}::char(2)[])`);
  where.push(...filtrosLocais.map((c) => `e.${c}`));
  if (f.portes?.length) where.push(`e.porte = any(${p.add(f.portes)}::char(2)[])`);
  if (f.matrizFilial === 'matriz') where.push('e.matriz');
  if (f.matrizFilial === 'filial') where.push('not e.matriz');
  if (f.idadeMinAnos !== undefined)
    where.push(`e.data_inicio <= current_date - make_interval(months => ${p.add(Math.round(f.idadeMinAnos * 12))}::int)`);
  if (f.idadeMaxAnos !== undefined)
    where.push(`e.data_inicio >= current_date - make_interval(months => ${p.add(Math.round(f.idadeMaxAnos * 12))}::int)`);
  if (f.capitalMin !== undefined) where.push(`e.capital_social >= ${p.add(f.capitalMin)}`);
  if (f.excluirMei ?? !f.cnpjs) where.push('not coalesce(e.opcao_mei, false)');

  // --- Segmentos / CNAEs ---
  if (refSegs || f.cnaes?.length) {
    const ou: string[] = [];
    if (refSegs) {
      ou.push(`e.cnpj in (select es.cnpj from empresa_segmento es
        where es.segmento_id = any(${refSegs}::int[]) and es.tipo <= ${tipoMax})`);
    }
    if (f.cnaes?.length) {
      const ref = p.add(f.cnaes);
      ou.push(`e.cnae_principal = any(${ref}::char(7)[])`);
      if (amplo) ou.push(`e.cnaes_secundarios && ${ref}::char(7)[]`);
    }
    where.push(`(${ou.join(' or ')})`);
  }

  // --- Contatos ---
  const extra = (tipos: string) => `exists (select 1 from contatos c where c.cnpj = e.cnpj and c.tipo in (${tipos}))`;
  if (f.comTelefone) where.push(`(e.telefone1 is not null or e.telefone2 is not null or ${extra(`'telefone','whatsapp'`)})`);
  if (f.comCelular) where.push(`(e.telefone1 ~ '^[0-9]{2}9[0-9]{8}$' or e.telefone2 ~ '^[0-9]{2}9[0-9]{8}$' or ${extra(`'whatsapp'`)})`);
  if (f.comEmail) where.push(`(e.email is not null or ${extra(`'email'`)})`);
  if (f.comEmailCorporativo) where.push(`(e.email is not null and e.email !~* ${p.add(REGEX_EMAIL_GRATUITO)})`);
  if (f.comSite) where.push(extra(`'site'`));
  if (f.somenteRntrcAtivo) where.push(`r.situacao = 'ATIVO'`);

  // --- Prospecção / duplicados ---
  const emLista = 'exists (select 1 from lista_itens li where li.cnpj = e.cnpj)';
  if (f.prospeccao === 'fora_da_base') where.push(`(p.cnpj is null and not ${emLista})`);
  if (f.prospeccao === 'nao_contatadas') where.push(`(p.cnpj is null or p.status in ('novo','nao_contatado'))`);
  if (f.prospeccao === 'na_base') where.push(`(p.cnpj is not null or ${emLista})`);
  if (f.excluirNaoProspectar ?? !f.cnpjs) where.push(`coalesce(p.status, '') <> 'nao_prospectar'`);
  if (f.excluirClientes ?? !f.cnpjs) where.push(`coalesce(p.status, '') <> 'cliente'`);
  // Amostra: pré-seleciona ~1/8 da base de forma pseudoaleatória estável antes do cálculo pesado.
  if (f.ordenarPor === 'amostra') where.push(`substr(md5(e.cnpj), 1, 1) in ('0', '1')`);

  // --- Pontuação ---
  const crit = criteriosPontuacao();
  const somaPontos = crit.map((c) => `case when ${c.quando} then ${c.pontos} else 0 end`).join(' + ');
  const motivos = `array_remove(array[${crit
    .map((c) => `case when ${c.quando} then (${c.motivo}) || ' (${c.pontos > 0 ? '+' : ''}${c.pontos})' end`)
    .join(', ')}], null)`;

  const filtrosFinais: string[] = [];
  if (f.potencial?.length) filtrosFinais.push(`nivel = any(${p.add(f.potencial)}::text[])`);
  if (ic && f.icpFaixas?.length) filtrosFinais.push(`icp_faixa = any(${p.add(f.icpFaixas)}::text[])`);
  const filtroPotencial = filtrosFinais.length ? `where ${filtrosFinais.join(' and ')}` : '';

  const ordem: Record<string, string> = {
    amostra: `md5(cnpj)`, // ordem pseudoaleatória estável (amostras para a calibração do ICP)
    icp: ic ? `icp_score desc, pontos desc, razao_social` : `pontos desc, razao_social`,
    potencial: `case nivel when 'alto' then 0 when 'medio' then 1 else 2 end, pontos desc, razao_social`,
    cidade: `municipio_nome, razao_social`,
    segmento: `segmento nulls last, pontos desc`,
    porte: `porte desc nulls last, pontos desc`,
    razao_social: `razao_social`,
    abertura: `data_inicio nulls last`,
    capital: `capital_social desc nulls last`,
  };
  const orderBy = ordem[f.ordenarPor ?? (ic ? 'icp' : 'potencial')];
  const limite = Math.min(Math.max(1, Math.trunc(f.limite ?? 200)), LIMITE_MAXIMO);
  const pagina = Math.max(0, Math.trunc(f.pagina ?? 0));

  const sql = `
with base as materialized (
  select e.*, m.nome as municipio_nome,
    r.situacao as rntrc_situacao, r.categoria as rntrc_categoria, r.numero_rntrc,
    p.status as prospeccao_status, p.ultimo_contato, p.proximo_contato,
    (e.telefone1 is not null or e.telefone2 is not null) as tem_telefone,
    (e.email is not null) as tem_email,
    (e.telefone1 ~ '^[0-9]{2}9[0-9]{8}$' or e.telefone2 ~ '^[0-9]{2}9[0-9]{8}$') as tem_celular,${ic?.segmentosIcp.length ? `
    (select min(ei.tipo) from empresa_segmento ei
      where ei.cnpj = e.cnpj and ei.segmento_id = any(${p.add(ic.segmentosIcp)}::int[])) as icp_seg_tipo,` : `
    null::smallint as icp_seg_tipo,`}
    (e.email is not null and e.email !~* ${p.add(REGEX_EMAIL_GRATUITO)}) as email_corporativo,
    greatest(coalesce(g.estabelecimentos, 1) - 1, 0) as filiais,
    sm.segmento_id, sm.tipo as match_tipo, sm.nome as segmento, sm.prioridade as segmento_prioridade
  from empresas e
  left join municipios m on m.codigo = e.municipio_codigo
  left join empresas_grupo g on g.cnpj_basico = e.cnpj_basico
  left join rntrc_empresa r on r.cnpj_basico = e.cnpj_basico
  left join prospeccao p on p.cnpj = e.cnpj
  ${juncaoSegmento}
  ${where.length ? 'where ' + where.join('\n    and ') : ''}
), clas as (
  select b.*,
    (${somaPontos}) as pontos,
    ${EVIDENCIA_FROTA} as evidencia_frota,
    ${ic ? ic.score : 'null::int'} as icp_score
  from base b cross join lateral (select b.segmento as nome, b.segmento_prioridade as prioridade) s
), fin as (
  select clas.*,
    case when pontos >= ${LIMIARES.alto} and evidencia_frota then 'alto'
         when pontos >= ${LIMIARES.medio} then 'medio' else 'verificar' end as nivel,
    ${ic ? faixaSql('icp_score') : 'null::text'} as icp_faixa
  from clas
), sel as (
  ${f.umPorEmpresa
    // Um lead por empresa: o estabelecimento de melhor score de cada CNPJ raiz (matriz no empate).
    ? `select distinct on (cnpj_basico) fin.* from fin ${filtroPotencial}
       order by cnpj_basico, icp_score desc nulls last, pontos desc, matriz desc, cnpj`
    : `select fin.* from fin ${filtroPotencial}`}
), pag as (
  select sel.*, count(*) over () as total from sel
  order by ${orderBy}
  limit ${limite} offset ${pagina * limite}
)
select pag.*,
  -- Motivos só para as linhas da página (os mesmos critérios da soma de pontos).
  (select ${motivos} from (select pag.*) b, (select pag.segmento as nome, pag.segmento_prioridade as prioridade) s) as motivos,
  ${ic ? `(select ${ic.detalhe} from (select pag.*) b)` : `'{}'::text[]`} as icp_detalhe,${ic && f.comAderencias ? `
  (select array[${ic.aderencias.map((a) => `(${a.expr})::float8`).join(', ') || 'null::float8'}] from (select pag.*) b) as icp_aderencias,` : ''}
  (select coalesce(json_agg(json_build_object('id', l.id, 'nome', l.nome) order by l.nome), '[]')
     from lista_itens li join listas l on l.id = li.lista_id where li.cnpj = pag.cnpj) as listas,
  (select coalesce(json_agg(json_build_object('tipo', c.tipo, 'valor', c.valor, 'fonte', c.fonte, 'verificado', c.verificado)), '[]')
     from contatos c where c.cnpj = pag.cnpj) as contatos_extra,
  exists (select 1 from prospeccao p2 join empresas e2 on e2.cnpj = p2.cnpj
          where e2.cnpj_basico = pag.cnpj_basico and p2.cnpj <> pag.cnpj) as outro_estab_prospectado
from pag
order by ${orderBy}`;

  return { sql, params: p.valores };
}
