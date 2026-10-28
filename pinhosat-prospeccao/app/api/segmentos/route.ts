import { ok, rota, corpo } from '@/lib/api';
import { pool, query } from '@/lib/db';
import { reclassificarSegmento } from '@/lib/classificacao';
import { validarSegmento } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const GET = rota(async () => {
  const segmentos = await query(`select s.*, s.cnaes::text[] as cnaes,
      (select coalesce(json_agg(json_build_object('codigo', c.codigo, 'descricao', c.descricao) order by c.codigo), '[]')
         from cnaes c where c.codigo = any(s.cnaes)) as cnaes_info
    from segmentos s order by s.grupo, s.nome`);
  return ok({ segmentos });
});

export const POST = rota(async (req: Request) => {
  const s = await validarSegmento(await corpo(req));
  const cli = await pool().connect();
  try {
    await cli.query('begin');
    const { rows: [r] } = await cli.query(`insert into segmentos (nome, grupo, prioridade, cnaes, palavras_chave, descricao, ativo)
      values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [s.nome, s.grupo, s.prioridade, s.cnaes, s.palavras_chave, s.descricao, s.ativo]);
    const empresas = await reclassificarSegmento(cli, r.id);
    await cli.query('commit');
    return ok({ id: r.id, empresas }, 201);
  } catch (e) {
    await cli.query('rollback');
    throw e;
  } finally {
    cli.release();
  }
});
