import { ok, rota, corpo, ErroValidacao } from '@/lib/api';
import { query } from '@/lib/db';
import { validarRegiao } from '@/lib/config';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const idDe = async (ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) throw new ErroValidacao('Região inválida.');
  return id;
};

export const PUT = rota(async (req: Request, ctx: Ctx) => {
  const id = await idDe(ctx);
  const r = await validarRegiao(await corpo(req));
  await query('update regioes set nome = $2, uf = $3, municipios = $4 where id = $1', [id, r.nome, r.uf, r.municipios]);
  return ok({ ok: true });
});

export const DELETE = rota(async (_req: Request, ctx: Ctx) => {
  await query('delete from regioes where id = $1', [await idDe(ctx)]);
  return ok({ ok: true });
});
