// Funções de acesso a dados usadas pelas rotas de API.
import { query } from './db';
import { montarConsulta } from './busca';
import { LIMITE_MAXIMO, type FiltrosBusca } from './filtros';
import { linhaParaEmpresa, type Empresa } from './empresa';

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

export async function buscarEmpresas(f: FiltrosBusca): Promise<{ total: number; empresas: Empresa[] }> {
  const [munis, cnaes] = await Promise.all([municipiosDasRegioes(f.regioes), descricoesCnae()]);
  const { sql, params } = montarConsulta(f, munis);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await query<any>(sql, params);
  return { total: rows.length ? Number(rows[0].total) : 0, empresas: rows.map((r) => linhaParaEmpresa(r, cnaes)) };
}

/** Carrega empresas específicas (para listas, detalhe e exportação), sem filtros de situação/MEI. */
export async function empresasPorCnpj(cnpjs: string[], ordenarPor: FiltrosBusca['ordenarPor'] = 'potencial') {
  const saida: Empresa[] = [];
  for (let i = 0; i < cnpjs.length; i += LIMITE_MAXIMO) {
    const lote = cnpjs.slice(i, i + LIMITE_MAXIMO);
    saida.push(...(await buscarEmpresas({ cnpjs: lote, ordenarPor, limite: lote.length })).empresas);
  }
  return saida;
}
