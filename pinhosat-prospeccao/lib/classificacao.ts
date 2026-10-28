// Classificação das empresas nos segmentos comerciais.
// Calculada uma vez por segmento (e não a cada busca): cada condição usa seu próprio índice —
// btree no CNAE principal, GIN nos CNAEs secundários e trigramas no nome (uma regex por palavra-chave).
import type { PoolClient } from 'pg';
import { palavraParaRegex } from './texto';

interface Seg { id: number; cnaes: string[]; palavras_chave: string[] }

export async function reclassificarSegmento(cli: PoolClient, segmentoId: number, atualizarMelhor = true): Promise<number> {
  const { rows } = await cli.query<Seg>('select id, cnaes::text[] as cnaes, palavras_chave from segmentos where id = $1', [segmentoId]);
  await cli.query('delete from empresa_segmento where segmento_id = $1', [segmentoId]);
  const s = rows[0];
  if (!s) return 0;
  const ramos: string[] = [];
  const params: unknown[] = [s.id];
  if (s.cnaes.length) {
    params.push(s.cnaes);
    ramos.push(`select cnpj, 1 as tipo from empresas where cnae_principal = any($${params.length}::char(7)[])`);
    ramos.push(`select cnpj, 2 from empresas where cnaes_secundarios && $${params.length}::char(7)[]`);
  }
  for (const re of new Set(s.palavras_chave.map(palavraParaRegex).filter(Boolean))) {
    params.push(re);
    ramos.push(`select cnpj, 3 from empresas where nomes_busca ~ $${params.length}`);
  }
  if (!ramos.length) return 0;
  const r = await cli.query(`insert into empresa_segmento (cnpj, segmento_id, tipo)
    select cnpj, $1, min(tipo) from (${ramos.join(' union all ')}) x group by cnpj`, params);
  if (atualizarMelhor) await recalcularMelhor(cli, segmentoId);
  return r.rowCount ?? 0;
}

/**
 * Marca o melhor segmento de cada empresa (CNAE principal > secundário > palavra-chave; depois prioridade).
 * Com `segmentoId`, recalcula só as empresas afetadas por aquele segmento.
 */
export async function recalcularMelhor(cli: PoolClient, segmentoId?: number) {
  const alvo = segmentoId === undefined ? '' : 'where es.cnpj in (select cnpj from empresa_segmento where segmento_id = $1)';
  await cli.query(`update empresa_segmento t set melhor = x.melhor from (
      select es.cnpj, es.segmento_id,
        row_number() over (partition by es.cnpj order by (not sg.ativo), es.tipo,
          case sg.prioridade when 'alta' then 0 when 'media' then 1 else 2 end, sg.id) = 1 as melhor
      from empresa_segmento es join segmentos sg on sg.id = es.segmento_id ${alvo}
    ) x
    where t.cnpj = x.cnpj and t.segmento_id = x.segmento_id and t.melhor is distinct from x.melhor`,
    segmentoId === undefined ? [] : [segmentoId]);
}

/** Recalcula todos os segmentos (após importar uma nova competência da Receita). */
export async function reclassificarTodos(cli: PoolClient, log: (m: string) => void = () => {}) {
  const { rows } = await cli.query<{ id: number; nome: string }>('select id, nome from segmentos order by id');
  for (const s of rows) {
    await cli.query('begin');
    const n = await reclassificarSegmento(cli, s.id, false);
    await cli.query('commit');
    log(`segmento "${s.nome}": ${n.toLocaleString('pt-BR')} estabelecimentos`);
  }
  await recalcularMelhor(cli);
  await cli.query('analyze empresa_segmento');
}
