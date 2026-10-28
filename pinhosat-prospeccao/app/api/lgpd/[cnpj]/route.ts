import { ok, rota, ErroValidacao } from '@/lib/api';
import { pool } from '@/lib/db';
import { usuarioDe } from '@/lib/auth';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ cnpj: string }> };

/**
 * Atende pedido de exclusão / oposição (LGPD art. 18): apaga contatos complementares e anotações,
 * remove a empresa das listas e a marca como "Não prospectar" para que não volte a aparecer nas buscas.
 * Os dados cadastrais públicos da RF permanecem (são reimportados a cada atualização), mas ficam bloqueados.
 */
export const POST = rota(async (req: Request, ctx: Ctx) => {
  const cnpj = (await ctx.params).cnpj.replace(/\D/g, '');
  if (cnpj.length !== 14) throw new ErroValidacao('CNPJ inválido.');
  const usuario = usuarioDe(req);
  const cli = await pool().connect();
  try {
    await cli.query('begin');
    await cli.query('delete from contatos where cnpj = $1', [cnpj]);
    await cli.query('delete from lista_itens where cnpj = $1', [cnpj]);
    await cli.query('delete from prospeccao_historico where cnpj = $1', [cnpj]);
    await cli.query(`insert into prospeccao (cnpj, status, observacoes, atualizado_por) values ($1, 'nao_prospectar', null, $2)
      on conflict (cnpj) do update set status = 'nao_prospectar', observacoes = null, ultimo_contato = null,
        proximo_contato = null, responsavel = null, atualizado_por = $2, atualizado_em = now()`, [cnpj, usuario]);
    await cli.query(`insert into prospeccao_historico (cnpj, status, nota, usuario)
      values ($1, 'nao_prospectar', 'Dados complementares excluídos a pedido (LGPD). Não contatar.', $2)`, [cnpj, usuario]);
    await cli.query('commit');
    return ok({ ok: true });
  } catch (e) {
    await cli.query('rollback');
    throw e;
  } finally {
    cli.release();
  }
});
