import { ok, rota, corpo, cnpjs, ErroValidacao } from '@/lib/api';
import { pool, query } from '@/lib/db';
import { usuarioDe } from '@/lib/auth';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

async function idDe(ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) throw new ErroValidacao('Lista inválida.');
  return id;
}

/** Adiciona empresas; informa quais já estavam em outras listas (duplicados). */
export const POST = rota(async (req: Request, ctx: Ctx) => {
  const id = await idDe(ctx);
  const itens = cnpjs((await corpo(req)).cnpjs);
  const usuario = usuarioDe(req);
  const cli = await pool().connect();
  try {
    await cli.query('begin');
    const dup = await cli.query(`select i.cnpj, l.nome from lista_itens i join listas l on l.id = i.lista_id
      where i.cnpj = any($1::char(14)[]) and i.lista_id <> $2`, [itens, id]);
    const r = await cli.query(`insert into lista_itens (lista_id, cnpj, adicionado_por)
      select $1, c, $3 from unnest($2::char(14)[]) c on conflict do nothing`, [id, itens, usuario]);
    await cli.query(`insert into prospeccao (cnpj, status, atualizado_por)
      select c, 'novo', $2 from unnest($1::char(14)[]) c on conflict do nothing`, [itens, usuario]);
    await cli.query('update listas set atualizado_em = now() where id = $1', [id]);
    await cli.query('commit');
    return ok({ adicionadas: r.rowCount, jaEmOutrasListas: dup.rows.length });
  } catch (e) {
    await cli.query('rollback');
    throw e;
  } finally {
    cli.release();
  }
});

export const DELETE = rota(async (req: Request, ctx: Ctx) => {
  const id = await idDe(ctx);
  const itens = cnpjs((await corpo(req)).cnpjs);
  const r = await pool().query('delete from lista_itens where lista_id = $1 and cnpj = any($2::char(14)[])', [id, itens]);
  await query('update listas set atualizado_em = now() where id = $1', [id]);
  return ok({ removidas: r.rowCount });
});
