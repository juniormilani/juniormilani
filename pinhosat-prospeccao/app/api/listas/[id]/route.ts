import { ok, rota, corpo, texto, ErroValidacao } from '@/lib/api';
import { query } from '@/lib/db';
import { empresasPorCnpj } from '@/lib/servico';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

async function idDe(ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) throw new ErroValidacao('Lista inválida.');
  return id;
}

export const GET = rota(async (req: Request, ctx: Ctx) => {
  const id = await idDe(ctx);
  const [lista] = await query('select * from listas where id = $1', [id]);
  if (!lista) return ok({ erro: 'Lista não encontrada.' }, 404);
  const itens = await query<{ cnpj: string }>('select cnpj from lista_itens where lista_id = $1', [id]);
  const icp = Number(new URL(req.url).searchParams.get('icp')) || undefined;
  const empresas = await empresasPorCnpj(itens.map((i) => i.cnpj), undefined, icp);
  const exportacoes = await query(
    'select formato, quantidade, usuario, criado_em from exportacoes where lista_id = $1 order by criado_em desc limit 20', [id]);
  return ok({ lista, empresas, exportacoes });
});

export const PATCH = rota(async (req: Request, ctx: Ctx) => {
  const id = await idDe(ctx);
  const b = await corpo(req);
  await query('update listas set nome = coalesce($2, nome), descricao = $3, atualizado_em = now() where id = $1',
    [id, texto(b.nome, 'nome', 120, false), texto(b.descricao, 'descrição', 1000, false)]);
  return ok({ ok: true });
});

export const DELETE = rota(async (_req: Request, ctx: Ctx) => {
  await query('delete from listas where id = $1', [await idDe(ctx)]);
  return ok({ ok: true });
});
