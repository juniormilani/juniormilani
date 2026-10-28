import { ok, rota, corpo, cnpjs, ErroValidacao } from '@/lib/api';
import { pool } from '@/lib/db';
import { usuarioDe } from '@/lib/auth';
import { statusValido } from '@/lib/status';

export const dynamic = 'force-dynamic';

/** Altera o status de várias empresas de uma vez (ex.: marcar "Não prospectar"). */
export const POST = rota(async (req: Request) => {
  const b = await corpo(req);
  if (!statusValido(b.status)) throw new ErroValidacao('Status inválido.');
  const alvo = cnpjs(b.cnpjs);
  const usuario = usuarioDe(req);
  const cli = await pool().connect();
  try {
    await cli.query('begin');
    await cli.query(`insert into prospeccao (cnpj, status, atualizado_por) select c, $2, $3 from unnest($1::char(14)[]) c
      on conflict (cnpj) do update set status = excluded.status, atualizado_por = excluded.atualizado_por, atualizado_em = now()`,
      [alvo, b.status, usuario]);
    await cli.query(`insert into prospeccao_historico (cnpj, status, nota, usuario)
      select c, $2, 'Alteração em lote', $3 from unnest($1::char(14)[]) c`, [alvo, b.status, usuario]);
    await cli.query('commit');
    return ok({ atualizadas: alvo.length });
  } catch (e) {
    await cli.query('rollback');
    throw e;
  } finally {
    cli.release();
  }
});
