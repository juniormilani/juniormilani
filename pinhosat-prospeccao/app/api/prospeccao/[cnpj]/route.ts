import { ok, rota, corpo, texto, data, ErroValidacao } from '@/lib/api';
import { pool } from '@/lib/db';
import { usuarioDe } from '@/lib/auth';
import { statusValido, STATUS_PROSPECCAO } from '@/lib/status';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ cnpj: string }> };

export const PUT = rota(async (req: Request, ctx: Ctx) => {
  const cnpj = (await ctx.params).cnpj.replace(/\D/g, '');
  if (cnpj.length !== 14) throw new ErroValidacao('CNPJ inválido.');
  const b = await corpo(req);
  if (!statusValido(b.status)) throw new ErroValidacao('Status inválido.');
  const observacoes = texto(b.observacoes, 'observações', 5000, false);
  const nota = texto(b.nota, 'nota', 2000, false);
  const ultimo = data(b.ultimoContato, 'último contato');
  const proximo = data(b.proximoContato, 'próximo acompanhamento');
  const responsavel = texto(b.responsavel, 'responsável', 80, false);
  const usuario = usuarioDe(req);
  const cli = await pool().connect();
  try {
    await cli.query('begin');
    const { rows: [antes] } = await cli.query('select status from prospeccao where cnpj = $1 for update', [cnpj]);
    await cli.query(`insert into prospeccao (cnpj, status, observacoes, ultimo_contato, proximo_contato, responsavel, atualizado_por, atualizado_em)
      values ($1, $2, $3, $4, $5, $6, $7, now())
      on conflict (cnpj) do update set status = excluded.status, observacoes = excluded.observacoes,
        ultimo_contato = excluded.ultimo_contato, proximo_contato = excluded.proximo_contato,
        responsavel = excluded.responsavel, atualizado_por = excluded.atualizado_por, atualizado_em = now()`,
      [cnpj, b.status, observacoes, ultimo, proximo, responsavel, usuario]);
    if (!antes || antes.status !== b.status || nota) {
      await cli.query('insert into prospeccao_historico (cnpj, status, nota, usuario) values ($1, $2, $3, $4)',
        [cnpj, b.status, nota ?? (antes ? `Status: ${STATUS_PROSPECCAO[antes.status as keyof typeof STATUS_PROSPECCAO]} → ${STATUS_PROSPECCAO[b.status]}` : null), usuario]);
    }
    await cli.query('commit');
    return ok({ ok: true });
  } catch (e) {
    await cli.query('rollback');
    throw e;
  } finally {
    cli.release();
  }
});
