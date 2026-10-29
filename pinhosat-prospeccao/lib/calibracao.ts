// Calibração do ICP com resultados reais.
//
// Compara a aderência média de cada critério entre os CLIENTES (carteira importada + leads convertidos) e uma
// REFERÊNCIA: os leads marcados como "Sem interesse" (quando há casos suficientes) ou, na falta deles, uma amostra
// da base de prospecção do próprio ICP. Critérios em que os clientes se destacam mais da referência recebem peso
// maior. É uma heurística transparente (diferença de médias), não um modelo estatístico: com poucos clientes a
// sugestão é só indicativa, e a tela avisa.

import { query } from './db';
import { montarConsulta } from './busca';
import { CHAVES_CRITERIOS, FAIXAS_ICP, type ChaveCriterio, type CriteriosIcp, type IcpCarregado } from './icp';
import { carregarIcp, empresasPorCnpj } from './servico';

export const MINIMO_CLIENTES = 10;
export const MINIMO_NEGATIVOS = 15;
const AMOSTRA_BASE = 2000;

const NOMES: Record<ChaveCriterio, string> = {
  segmentos: 'Segmento', porte: 'Porte', capital: 'Capital social', idade: 'Tempo de atividade',
  estabelecimentos: 'Estrutura', rntrc: 'Frota (RNTRC)', localizacao: 'Localização', contato: 'Contato',
};

/** Cópia do perfil com todos os critérios ligados (peso 1), para medir a aderência de cada um. */
function perfilDeMedicao(icp: IcpCarregado): IcpCarregado {
  const c: CriteriosIcp = JSON.parse(JSON.stringify(icp.criterios));
  for (const k of CHAVES_CRITERIOS) c[k].peso = 1;
  return { ...icp, criterios: c };
}

/** Aderência por critério (0–1) de um conjunto de empresas: por CNPJ ou por amostra da base do ICP. */
async function aderencias(icp: IcpCarregado, alvo: { cnpjs: string[] } | { amostra: true }) {
  const medicao = perfilDeMedicao(icp);
  const f = 'cnpjs' in alvo
    ? { cnpjs: alvo.cnpjs, limite: alvo.cnpjs.length || 1, comAderencias: true }
    : {
        segmentos: icp.criterios.segmentos.ids.length ? icp.criterios.segmentos.ids : undefined,
        excluirMei: icp.criterios.eliminatorios.mei,
        ordenarPor: 'amostra' as const, limite: AMOSTRA_BASE, comAderencias: true,
      };
  const chaves = CHAVES_CRITERIOS.filter((k) => temParametros(medicao.criterios, k, medicao));
  if ('cnpjs' in alvo && !alvo.cnpjs.length) return { chaves, linhas: [] as number[][], eliminado: [] as boolean[] };
  const { sql, params } = montarConsulta(f, [], medicao);
  // A ordem das colunas de aderência segue a ordem dos critérios com parâmetros definidos (CHAVES_CRITERIOS).
  const rows = await query<{ icp_aderencias: number[]; icp_detalhe: string[] }>(sql, params);
  return {
    chaves,
    linhas: rows.map((r) => (r.icp_aderencias ?? []).map(Number)),
    eliminado: rows.map((r) => (r.icp_detalhe ?? []).some((d) => d.startsWith('Eliminatório'))),
  };
}

function temParametros(c: CriteriosIcp, k: ChaveCriterio, icp: IcpCarregado): boolean {
  if (k === 'segmentos') return c.segmentos.ids.length > 0;
  if (k === 'porte') return c.porte.valores.length > 0;
  if (k === 'capital') return c.capital.minimo > 0;
  if (k === 'idade') return c.idade.anosMinimo > 0;
  if (k === 'localizacao') return icp.municipiosIdeais.length > 0;
  return true;
}

const media = (linhas: number[][], i: number) =>
  linhas.length ? linhas.reduce((s, l) => s + (l[i] ?? 0), 0) / linhas.length : null;

const faixaDe = (score: number) => (score >= FAIXAS_ICP.A ? 'A' : score >= FAIXAS_ICP.B ? 'B' : score >= FAIXAS_ICP.C ? 'C' : 'D');

function scorePonderado(linha: number[], chaves: ChaveCriterio[], pesos: Record<ChaveCriterio, number>) {
  let soma = 0, total = 0;
  chaves.forEach((k, i) => { soma += pesos[k] * (linha[i] ?? 0); total += pesos[k]; });
  return total ? (100 * soma) / total : 0;
}

export async function analisarIcp(icpId?: number) {
  const icp = await carregarIcp(icpId);
  if (!icp) return null;

  // Resultados registrados pela equipe
  const status = await query<{ cnpj: string; status: string }>(
    `select cnpj, status from prospeccao where status not in ('novo', 'nao_contatado', 'nao_prospectar')`);
  const clientes = status.filter((s) => s.status === 'cliente').map((s) => s.cnpj);
  const negativos = status.filter((s) => s.status === 'sem_interesse').map((s) => s.cnpj);

  // 1) Funil por faixa do ICP atual (todas as empresas já contatadas)
  const contatadas = await empresasPorCnpj(status.map((s) => s.cnpj), undefined, icp.id);
  const funil = (['A', 'B', 'C', 'D'] as const).map((faixa) => {
    const xs = contatadas.filter((e) => e.icp?.faixa === faixa);
    const cli = xs.filter((e) => e.prospeccaoStatus === 'cliente').length;
    const sem = xs.filter((e) => e.prospeccaoStatus === 'sem_interesse').length;
    return { faixa, contatadas: xs.length, clientes: cli, semInteresse: sem, conversao: cli + sem ? cli / (cli + sem) : null };
  });

  // 2) Aderência por critério: clientes × referência
  const [pos, neg, base] = await Promise.all([
    aderencias(icp, { cnpjs: clientes }),
    aderencias(icp, { cnpjs: negativos }),
    aderencias(icp, { amostra: true }),
  ]);
  const usarNegativos = neg.linhas.length >= MINIMO_NEGATIVOS;
  const ref = usarNegativos ? neg : base;
  const chaves = base.chaves;
  const diffs = chaves.map((_, i) => Math.max(0, (media(pos.linhas, i) ?? 0) - (media(ref.linhas, i) ?? 0)));
  const maior = Math.max(...diffs, 0);
  const suficiente = pos.linhas.length >= MINIMO_CLIENTES && maior > 0.02;

  const pesosAtuais = Object.fromEntries(CHAVES_CRITERIOS.map((k) => [k, icp.criterios[k].peso])) as Record<ChaveCriterio, number>;
  const pesosSugeridos = { ...pesosAtuais };
  const criterios = chaves.map((k, i) => {
    const sugerido = suficiente ? (diffs[i] <= 0.02 ? 0 : Math.max(1, Math.round((10 * diffs[i]) / maior))) : null;
    if (sugerido !== null) pesosSugeridos[k] = sugerido;
    return {
      chave: k, nome: NOMES[k], pesoAtual: icp.criterios[k].peso, pesoSugerido: sugerido,
      clientes: media(pos.linhas, i), semInteresse: media(neg.linhas, i), base: media(base.linhas, i), diferenca: diffs[i],
    };
  });
  const semParametros = CHAVES_CRITERIOS.filter((k) => !chaves.includes(k)).map((k) => NOMES[k]);

  // 3) Cobertura: % de clientes e da base que cairiam em A/B, hoje e com os pesos sugeridos
  type Grupo = { linhas: number[][]; eliminado: boolean[] };
  const cobertura = (g: Grupo, pesos: Record<ChaveCriterio, number>) => {
    if (!g.linhas.length) return null;
    const ab = g.linhas.filter((l, i) => !g.eliminado[i] && ['A', 'B'].includes(faixaDe(scorePonderado(l, chaves, pesos)))).length;
    return ab / g.linhas.length;
  };
  const coberturaAtual = { clientes: cobertura(pos, pesosAtuais), base: cobertura(base, pesosAtuais) };
  const coberturaSugerida = suficiente ? { clientes: cobertura(pos, pesosSugeridos), base: cobertura(base, pesosSugeridos) } : null;

  // 4) Segmentos dos clientes (para descobrir segmentos que faltam no ICP)
  const segmentosClientes = clientes.length ? await query<{ id: number | null; nome: string | null; qtd: number }>(
    `select sg.id, sg.nome, count(*)::int as qtd
     from unnest($1::char(14)[]) c(cnpj)
     left join empresa_segmento es on es.cnpj = c.cnpj and es.melhor
     left join segmentos sg on sg.id = es.segmento_id
     group by sg.id, sg.nome order by qtd desc`, [clientes]) : [];

  return {
    icp: { id: icp.id, nome: icp.nome },
    amostras: {
      clientes: clientes.length, clientesNaBase: pos.linhas.length,
      semInteresse: neg.linhas.length, base: base.linhas.length,
      referencia: usarNegativos ? 'sem_interesse' as const : 'base' as const,
    },
    suficiente, minimoClientes: MINIMO_CLIENTES, minimoNegativos: MINIMO_NEGATIVOS,
    criterios, semParametros, pesosSugeridos: suficiente ? pesosSugeridos : null,
    coberturaAtual, coberturaSugerida, funil,
    segmentosClientes: segmentosClientes.map((s) => ({
      ...s, noIcp: s.id !== null && icp.criterios.segmentos.ids.includes(s.id),
    })),
  };
}

export type AnaliseIcp = NonNullable<Awaited<ReturnType<typeof analisarIcp>>>;
