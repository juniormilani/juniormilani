import { ok, rota, corpo, texto } from '@/lib/api';
import { pool, query } from '@/lib/db';
import { validarCriterios } from '@/lib/icp';

export const dynamic = 'force-dynamic';

export const GET = rota(async () => {
  const icps = await query('select id, nome, descricao, padrao, criterios, atualizado_em from icps order by padrao desc, nome');
  return ok({ icps });
});

export const POST = rota(async (req: Request) => {
  const b = await corpo(req);
  const nome = texto(b.nome, 'nome', 120)!;
  const criterios = validarCriterios(b.criterios);
  const cli = await pool().connect();
  try {
    await cli.query('begin');
    if (b.padrao === true) await cli.query('update icps set padrao = false where padrao');
    const { rows: [r] } = await cli.query(
      'insert into icps (nome, descricao, criterios, padrao) values ($1, $2, $3, $4) returning id',
      [nome, texto(b.descricao, 'descrição', 1000, false), JSON.stringify(criterios), b.padrao === true]);
    await cli.query('commit');
    return ok(r, 201);
  } catch (e) {
    await cli.query('rollback');
    throw e;
  } finally {
    cli.release();
  }
});
