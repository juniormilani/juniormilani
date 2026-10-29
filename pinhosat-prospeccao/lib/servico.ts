// Funções de acesso a dados usadas pelas rotas de API.
import { query } from './db';
import { montarConsulta } from './busca';
import { LIMITE_MAXIMO, type FiltrosBusca } from './filtros';
import { linhaParaEmpresa, type Empresa } from './empresa';
import { validarCriterios, type IcpCarregado } from './icp';

let cacheCnaes: Map<string, string> | null = null;
async function descricoesCnae(): Promise<Map<string, string>> {
  if (!cacheCnaes) {
    const rows = await query<{ codigo: string; descricao: string }>('select codigo, descricao from cnaes');
    cacheCnaes = new Map(rows.map((r) => [r.codigo, r.descricao]));
  }
  return cacheCnaes;
}

async function municipiosDasRegioes(ids: number[] | undefined): Promise<string[]> {
  if (!ids?.length) return [];
  const rows = await query<{ m: string }>('select distinct unnest(municipios) as m from regioes where id = any($1::int[])', [ids]);
  return rows.map((r) => r.m);
}

/** Carrega o perfil de ICP pedido (ou o padrão), com os municípios das regiões do critério de localização. */
export async function carregarIcp(id?: number): Promise<IcpCarregado | null> {
  const [row] = await query<{ id: number; nome: string; descricao: string | null; padrao: boolean; criterios: unknown }>(
    id ? 'select id, nome, descricao, padrao, criterios from icps where id = $1'
       : 'select id, nome, descricao, padrao, criterios from icps where padrao', id ? [id] : []);
  if (!row) return null;
  const criterios = validarCriterios(row.criterios);
  return { ...row, criterios, municipiosIdeais: await municipiosDasRegioes(criterios.localizacao.regioes) };
}

export async function buscarEmpresas(f: FiltrosBusca): Promise<{ total: number; empresas: Empresa[]; icp: { id: number; nome: string } | null }> {
  const [munis, cnaes, icp] = await Promise.all([municipiosDasRegioes(f.regioes), descricoesCnae(), carregarIcp(f.icpId)]);
  const { sql, params } = montarConsulta(f, munis, icp);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await query<any>(sql, params);
  return {
    total: rows.length ? Number(rows[0].total) : 0,
    empresas: rows.map((r) => linhaParaEmpresa(r, cnaes, icp?.nome ?? null)),
    icp: icp ? { id: icp.id, nome: icp.nome } : null,
  };
}

/** Carrega empresas específicas (para listas, detalhe e exportação), sem filtros de situação/MEI. */
export async function empresasPorCnpj(cnpjs: string[], ordenarPor?: FiltrosBusca['ordenarPor'], icpId?: number) {
  const saida: Empresa[] = [];
  for (let i = 0; i < cnpjs.length; i += LIMITE_MAXIMO) {
    const lote = cnpjs.slice(i, i + LIMITE_MAXIMO);
    saida.push(...(await buscarEmpresas({ cnpjs: lote, ordenarPor, icpId, limite: lote.length })).empresas);
  }
  return saida;
}
