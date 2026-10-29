// Score de aderência ao ICP (Ideal Customer Profile).
//
// Cada perfil de ICP (ex.: "Rastreamento — frotas médias", "Câmeras de baú — distribuidoras") define critérios
// com peso de 0 a 10. Para cada empresa, cada critério recebe uma aderência entre 0 e 1:
//   score = 100 × Σ(peso × aderência) / Σ(peso)          → faixa A (≥75), B (≥50), C (≥25) ou D
// Critérios eliminatórios (ex.: MEI) zeram o score. Tudo é calculado no SQL para ordenar o resultado inteiro,
// e o detalhamento de cada critério é exibido na tela e na exportação.

import { ErroValidacao } from './erros';
import { Params, txt } from './sql';

export interface CriteriosIcp {
  segmentos: { peso: number; ids: number[] };
  porte: { peso: number; valores: string[] };
  capital: { peso: number; minimo: number };
  idade: { peso: number; anosMinimo: number };
  estabelecimentos: { peso: number; minimo: number };
  rntrc: { peso: number };
  localizacao: { peso: number; regioes: number[] };
  contato: { peso: number };
  eliminatorios: { mei: boolean; inativa: boolean; semTelefone: boolean };
}

export interface Icp {
  id: number;
  nome: string;
  descricao: string | null;
  padrao: boolean;
  criterios: CriteriosIcp;
}

export const FAIXAS_ICP = { A: 75, B: 50, C: 25 } as const;
export const DESCRICAO_FAIXA: Record<string, string> = {
  A: 'Aderência muito alta ao ICP',
  B: 'Boa aderência',
  C: 'Aderência parcial',
  D: 'Baixa aderência ou eliminado',
};

export const CRITERIOS_VAZIOS: CriteriosIcp = {
  segmentos: { peso: 3, ids: [] },
  porte: { peso: 2, valores: ['03', '05'] },
  capital: { peso: 1, minimo: 100000 },
  idade: { peso: 1, anosMinimo: 3 },
  estabelecimentos: { peso: 0, minimo: 2 },
  rntrc: { peso: 2 },
  localizacao: { peso: 1, regioes: [] },
  contato: { peso: 1 },
  eliminatorios: { mei: true, inativa: true, semTelefone: false },
};

const peso = (v: unknown) => {
  const n = Math.round(Number(v ?? 0));
  if (!Number.isFinite(n) || n < 0 || n > 10) throw new ErroValidacao('Os pesos devem ficar entre 0 e 10.');
  return n;
};
const positivo = (v: unknown, campo: string) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0) throw new ErroValidacao(`Valor inválido: ${campo}.`);
  return n;
};
const ints = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(Number).filter(Number.isInteger))] : []);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** Valida critérios vindos da interface ou do banco (completa campos ausentes com o padrão). */
export function validarCriterios(raw: unknown): CriteriosIcp {
  const r = obj(raw);
  const d = CRITERIOS_VAZIOS;
  const seg = obj(r.segmentos), por = obj(r.porte), cap = obj(r.capital), ida = obj(r.idade), est = obj(r.estabelecimentos);
  const loc = obj(r.localizacao), eli = obj(r.eliminatorios);
  const c: CriteriosIcp = {
    segmentos: { peso: peso(seg.peso ?? d.segmentos.peso), ids: ints(seg.ids) },
    porte: {
      peso: peso(por.peso ?? d.porte.peso),
      valores: (Array.isArray(por.valores) ? por.valores : d.porte.valores).filter((x): x is string => ['00', '01', '03', '05'].includes(String(x))).map(String),
    },
    capital: { peso: peso(cap.peso ?? d.capital.peso), minimo: positivo(cap.minimo ?? d.capital.minimo, 'capital mínimo') },
    idade: { peso: peso(ida.peso ?? d.idade.peso), anosMinimo: positivo(ida.anosMinimo ?? d.idade.anosMinimo, 'anos de atividade') },
    estabelecimentos: { peso: peso(est.peso ?? d.estabelecimentos.peso), minimo: Math.max(1, Math.round(positivo(est.minimo ?? d.estabelecimentos.minimo, 'estabelecimentos'))) },
    rntrc: { peso: peso(obj(r.rntrc).peso ?? d.rntrc.peso) },
    localizacao: { peso: peso(loc.peso ?? d.localizacao.peso), regioes: ints(loc.regioes) },
    contato: { peso: peso(obj(r.contato).peso ?? d.contato.peso) },
    eliminatorios: {
      mei: eli.mei === undefined ? d.eliminatorios.mei : eli.mei === true,
      inativa: eli.inativa === undefined ? d.eliminatorios.inativa : eli.inativa === true,
      semTelefone: eli.semTelefone === true,
    },
  };
  const total = c.segmentos.peso + c.porte.peso + c.capital.peso + c.idade.peso + c.estabelecimentos.peso +
    c.rntrc.peso + c.localizacao.peso + c.contato.peso;
  if (total === 0) throw new ErroValidacao('Defina peso maior que zero em pelo menos um critério.');
  return c;
}

export interface IcpCarregado extends Icp {
  municipiosIdeais: string[]; // municípios das regiões do critério de localização
}

interface CriterioSql {
  nome: string;
  peso: number;
  aderencia: string;  // expressão numérica entre 0 e 1 (colunas da CTE base com alias b)
  descricao: string;  // expressão de texto que explica o resultado
}

const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

function criteriosSql(icp: IcpCarregado, p: Params): CriterioSql[] {
  const c = icp.criterios;
  const lista: CriterioSql[] = [];
  if (c.segmentos.peso && c.segmentos.ids.length) {
    lista.push({
      nome: 'Segmento', peso: c.segmentos.peso,
      aderencia: `case b.icp_seg_tipo when 1 then 1 when 2 then 0.5 when 3 then 0.5 else 0 end`,
      descricao: `case b.icp_seg_tipo when 1 then 'CNAE principal em segmento do ICP' when 2 then 'segmento do ICP só como CNAE secundário'
        when 3 then 'nome indica segmento do ICP' else 'fora dos segmentos do ICP' end`,
    });
  }
  if (c.porte.peso && c.porte.valores.length) {
    lista.push({
      nome: 'Porte', peso: c.porte.peso,
      aderencia: `case when b.porte = any(${p.add(c.porte.valores)}::char(2)[]) then 1 else 0 end`,
      descricao: `'porte ' || case b.porte when '01' then 'ME' when '03' then 'EPP' when '05' then 'Demais' else 'não informado' end`,
    });
  }
  if (c.capital.peso && c.capital.minimo > 0) {
    const min = p.add(c.capital.minimo);
    lista.push({
      nome: 'Capital social', peso: c.capital.peso,
      aderencia: `least(coalesce(b.capital_social, 0) / ${min}::numeric, 1)`,
      descricao: `case when b.capital_social >= ${min}::numeric then ${txt(`a partir de ${brl(c.capital.minimo)}`)}
        else ${txt(`abaixo de ${brl(c.capital.minimo)}`)} end`,
    });
  }
  if (c.idade.peso && c.idade.anosMinimo > 0) {
    const anos = `coalesce(extract(year from age(current_date, b.data_inicio)), 0)`;
    lista.push({
      nome: 'Tempo de atividade', peso: c.idade.peso,
      aderencia: `least(${anos} / ${p.add(c.idade.anosMinimo)}::numeric, 1)`,
      descricao: `${anos}::int || ' anos de atividade'`,
    });
  }
  if (c.estabelecimentos.peso) {
    lista.push({
      nome: 'Estrutura', peso: c.estabelecimentos.peso,
      aderencia: `least((b.filiais + 1) / ${p.add(c.estabelecimentos.minimo)}::numeric, 1)`,
      descricao: `(b.filiais + 1) || case when b.filiais = 0 then ' estabelecimento' else ' estabelecimentos' end`,
    });
  }
  if (c.rntrc.peso) {
    lista.push({
      nome: 'Frota (RNTRC)', peso: c.rntrc.peso,
      aderencia: `case when b.rntrc_situacao = 'ATIVO' then 1 when b.rntrc_situacao is not null then 0.3 else 0 end`,
      descricao: `case when b.rntrc_situacao = 'ATIVO' then 'RNTRC ativo' when b.rntrc_situacao is not null
        then 'RNTRC ' || lower(b.rntrc_situacao) else 'sem RNTRC' end`,
    });
  }
  if (c.localizacao.peso && icp.municipiosIdeais.length) {
    lista.push({
      nome: 'Localização', peso: c.localizacao.peso,
      aderencia: `case when b.municipio_codigo = any(${p.add(icp.municipiosIdeais)}::char(4)[]) then 1 else 0 end`,
      descricao: `case when b.municipio_codigo = any(${p.add(icp.municipiosIdeais)}::char(4)[]) then 'dentro da região do ICP'
        else 'fora da região do ICP' end`,
    });
  }
  if (c.contato.peso) {
    lista.push({
      nome: 'Contato', peso: c.contato.peso,
      aderencia: `(case when b.tem_telefone then 0.5 else 0 end + case when b.tem_celular then 0.25 else 0 end
        + case when b.email_corporativo then 0.25 else 0 end)`,
      descricao: `coalesce(nullif(concat_ws(', ', case when b.tem_telefone then 'telefone' end,
        case when b.tem_celular then 'celular' end, case when b.email_corporativo then 'e-mail corporativo' end), ''), 'sem contato')`,
    });
  }
  return lista;
}

function eliminatoriosSql(icp: IcpCarregado): { cond: string; texto: string }[] {
  const e = icp.criterios.eliminatorios;
  const r: { cond: string; texto: string }[] = [];
  if (e.mei) r.push({ cond: 'coalesce(b.opcao_mei, false)', texto: 'MEI' });
  if (e.inativa) r.push({ cond: `b.situacao <> '02'`, texto: 'situação cadastral não ativa' });
  if (e.semTelefone) r.push({ cond: 'not b.tem_telefone', texto: 'sem telefone' });
  return r;
}

/** Expressões SQL do score ICP para a CTE de classificação (alias b) e do detalhamento (página). */
export function expressoesIcp(icp: IcpCarregado, p: Params) {
  const crit = criteriosSql(icp, p);
  const somaPesos = crit.reduce((s, c) => s + c.peso, 0) || 1;
  const elim = eliminatoriosSql(icp);
  const eliminado = elim.length ? `(${elim.map((x) => x.cond).join(' or ')})` : 'false';
  const bruto = crit.length ? `(${crit.map((c) => `${c.peso} * (${c.aderencia})`).join(' + ')}) * 100.0 / ${somaPesos}` : '0';
  const score = `case when ${eliminado} then 0 else round(${bruto})::int end`;
  const detalhe = `array_remove(array[
    ${elim.map((x) => `case when ${x.cond} then ${txt(`Eliminatório: ${x.texto} (score zerado)`)} end`).concat(
      crit.map((c) => `${txt(c.nome + ': ')} || (${c.descricao}) || ' — ' || round(100 * (${c.aderencia}))::int || '% × peso ${c.peso}'`),
    ).join(',\n    ')}], null)`;
  return { score, detalhe, segmentosIcp: icp.criterios.segmentos.peso ? icp.criterios.segmentos.ids : [] };
}

export function faixaSql(score: string): string {
  return `case when ${score} >= ${FAIXAS_ICP.A} then 'A' when ${score} >= ${FAIXAS_ICP.B} then 'B'
    when ${score} >= ${FAIXAS_ICP.C} then 'C' else 'D' end`;
}
