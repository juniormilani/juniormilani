import { ok, rota, corpo, ErroValidacao } from '@/lib/api';
import { pool } from '@/lib/db';
import { usuarioDe } from '@/lib/auth';
import { extrairCnpjs } from '@/lib/cnpj';

export const dynamic = 'force-dynamic';

/**
 * Importa a carteira de clientes atual (texto com CNPJs, de qualquer planilha ou sistema).
 * As empresas encontradas na base passam ao status "Cliente": saem das buscas de prospecção e servem
 * de referência para calibrar o ICP. Os demais estabelecimentos da mesma empresa ficam sinalizados como "grupo já na base".
 */
export const POST = rota(async (req: Request) => {
  const b = await corpo(req);
  if (typeof b.texto !== 'string' || !b.texto.trim()) throw new ErroValidacao('Cole ou envie a lista de CNPJs.');
  if (b.texto.length > 2_000_000) throw new ErroValidacao('Arquivo muito grande (máx. 2 MB).');
  const { validos, invalidos } = extrairCnpjs(b.texto);
  if (validos.length > 20000) throw new ErroValidacao('Máximo de 20.000 CNPJs por importação.');
  const usuario = usuarioDe(req);
  const cli = await pool().connect();
  try {
    await cli.query('begin');
    const { rows: naBase } = await cli.query<{ cnpj: string; status: string | null }>(
      `select e.cnpj, p.status from empresas e left join prospeccao p on p.cnpj = e.cnpj where e.cnpj = any($1::char(14)[])`, [validos]);
    const jaClientes = naBase.filter((r) => r.status === 'cliente').map((r) => r.cnpj);
    const novos = naBase.filter((r) => r.status !== 'cliente').map((r) => r.cnpj);
    if (novos.length) {
      await cli.query(`insert into prospeccao (cnpj, status, atualizado_por) select c, 'cliente', $2 from unnest($1::char(14)[]) c
        on conflict (cnpj) do update set status = 'cliente', atualizado_por = excluded.atualizado_por, atualizado_em = now()`, [novos, usuario]);
      await cli.query(`insert into prospeccao_historico (cnpj, status, nota, usuario)
        select c, 'cliente', 'Importado da carteira de clientes', $2 from unnest($1::char(14)[]) c`, [novos, usuario]);
    }
    await cli.query('commit');
    const encontrados = new Set(naBase.map((r) => r.cnpj));
    const foraDaBase = validos.filter((c) => !encontrados.has(c));
    return ok({
      lidos: validos.length + invalidos.length, validos: validos.length, invalidos: invalidos.slice(0, 50),
      marcadosComoCliente: novos.length, jaEramClientes: jaClientes.length,
      foraDaBase: foraDaBase.length, foraDaBaseExemplos: foraDaBase.slice(0, 50),
    });
  } catch (e) {
    await cli.query('rollback');
    throw e;
  } finally {
    cli.release();
  }
});
