import { ok, rota, corpo, texto, ErroValidacao } from '@/lib/api';
import { pool, query } from '@/lib/db';
import { validarCriterios } from '@/lib/icp';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const idDe = async (ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) throw new ErroValidacao('Perfil inválido.');
  return id;
};

export const PUT = rota(async (req: Request, ctx: Ctx) => {
  const id = await idDe(ctx);
  const b = await corpo(req);
  const nome = texto(b.nome, 'nome', 120)!;
  const criterios = validarCriterios(b.criterios);
  const cli = await pool().connect();
  try {
    await cli.query('begin');
    if (b.padrao === true) await cli.query('update icps set padrao = false where padrao and id <> $1', [id]);
    await cli.query(`update icps set nome = $2, descricao = $3, criterios = $4, padrao = $5, atualizado_em = now() where id = $1`,
      [id, nome, texto(b.descricao, 'descrição', 1000, false), JSON.stringify(criterios), b.padrao === true]);
    await cli.query('commit');
    return ok({ ok: true });
  } catch (e) {
    await cli.query('rollback');
    throw e;
  } finally {
    cli.release();
  }
});

export const DELETE = rota(async (_req: Request, ctx: Ctx) => {
  const id = await idDe(ctx);
  const [icp] = await query<{ padrao: boolean }>('select padrao from icps where id = $1', [id]);
  if (icp?.padrao) throw new ErroValidacao('Defina outro perfil como padrão antes de excluir este.');
  await query('delete from icps where id = $1', [id]);
  return ok({ ok: true });
});
