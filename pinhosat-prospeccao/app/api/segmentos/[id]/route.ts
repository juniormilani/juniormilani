import { ok, rota, corpo, ErroValidacao } from '@/lib/api';
import { pool, query } from '@/lib/db';
import { reclassificarSegmento } from '@/lib/classificacao';
import { validarSegmento } from '@/lib/config';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const idDe = async (ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) throw new ErroValidacao('Segmento inválido.');
  return id;
};

export const PUT = rota(async (req: Request, ctx: Ctx) => {
  const id = await idDe(ctx);
  const s = await validarSegmento(await corpo(req));
  const cli = await pool().connect();
  try {
    await cli.query('begin');
    await cli.query(`update segmentos set nome = $2, grupo = $3, prioridade = $4, cnaes = $5, palavras_chave = $6,
      descricao = $7, ativo = $8 where id = $1`, [id, s.nome, s.grupo, s.prioridade, s.cnaes, s.palavras_chave, s.descricao, s.ativo]);
    const empresas = await reclassificarSegmento(cli, id);
    await cli.query('commit');
    return ok({ ok: true, empresas });
  } catch (e) {
    await cli.query('rollback');
    throw e;
  } finally {
    cli.release();
  }
});

export const DELETE = rota(async (_req: Request, ctx: Ctx) => {
  await query('delete from segmentos where id = $1', [await idDe(ctx)]);
  return ok({ ok: true });
});
