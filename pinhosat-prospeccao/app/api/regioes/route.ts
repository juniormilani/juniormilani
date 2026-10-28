import { ok, rota, corpo } from '@/lib/api';
import { query } from '@/lib/db';
import { validarRegiao } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const GET = rota(async () => {
  const regioes = await query(`select r.id, r.nome, r.uf, r.municipios::text[] as municipios,
      (select coalesce(json_agg(json_build_object('codigo', m.codigo, 'nome', m.nome) order by m.nome), '[]')
         from municipios m where m.codigo = any(r.municipios)) as municipios_info
    from regioes r order by r.uf, r.nome`);
  return ok({ regioes });
});

export const POST = rota(async (req: Request) => {
  const r = await validarRegiao(await corpo(req));
  const [n] = await query('insert into regioes (nome, uf, municipios) values ($1, $2, $3) returning id', [r.nome, r.uf, r.municipios]);
  return ok(n, 201);
});
