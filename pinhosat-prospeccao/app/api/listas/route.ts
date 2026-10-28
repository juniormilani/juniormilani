import { ok, rota, corpo, texto, cnpjs } from '@/lib/api';
import { pool, query } from '@/lib/db';
import { usuarioDe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = rota(async () => {
  const listas = await query(`
    select l.id, l.nome, l.descricao, l.filtros, l.criado_por, l.criado_em, l.atualizado_em,
      (select count(*)::int from lista_itens i where i.lista_id = l.id) as quantidade,
      (select count(*)::int from lista_itens i join prospeccao p on p.cnpj = i.cnpj
         where i.lista_id = l.id and p.status not in ('novo','nao_contatado')) as contatadas,
      (select max(criado_em) from exportacoes x where x.lista_id = l.id) as ultima_exportacao,
      (select count(*)::int from exportacoes x where x.lista_id = l.id) as exportacoes
    from listas l order by l.atualizado_em desc`);
  return ok({ listas });
});

/** Cria uma lista (opcionalmente já com empresas). */
export const POST = rota(async (req: Request) => {
  const b = await corpo(req);
  const nome = texto(b.nome, 'nome', 120)!;
  const descricao = texto(b.descricao, 'descrição', 1000, false);
  const itens = b.cnpjs ? cnpjs(b.cnpjs) : [];
  const usuario = usuarioDe(req);
  const cli = await pool().connect();
  try {
    await cli.query('begin');
    const { rows } = await cli.query(
      'insert into listas (nome, descricao, filtros, criado_por) values ($1, $2, $3, $4) returning id',
      [nome, descricao, b.filtros ? JSON.stringify(b.filtros) : null, usuario]);
    const id = rows[0].id as number;
    if (itens.length) {
      await cli.query(`insert into lista_itens (lista_id, cnpj, adicionado_por)
        select $1, c, $3 from unnest($2::char(14)[]) c on conflict do nothing`, [id, itens, usuario]);
      await cli.query(`insert into prospeccao (cnpj, status, atualizado_por)
        select c, 'novo', $2 from unnest($1::char(14)[]) c on conflict do nothing`, [itens, usuario]);
    }
    await cli.query('commit');
    return ok({ id, adicionadas: itens.length }, 201);
  } catch (e) {
    await cli.query('rollback');
    throw e;
  } finally {
    cli.release();
  }
});
