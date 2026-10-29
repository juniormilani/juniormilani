import { ok, rota } from '@/lib/api';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = rota(async (req: Request) => {
  const uf = new URL(req.url).searchParams.get('uf');
  const [segmentos, regioes, ufs, base, icps] = await Promise.all([
    query(`select id, nome, grupo, prioridade from segmentos where ativo
           order by case grupo when 'Transporte e logística' then 0 when 'Transporte de passageiros' then 1
           when 'Operações em campo' then 2 when 'Locação' then 3 else 4 end, nome`),
    query('select id, nome, uf, cardinality(municipios) as qtd from regioes order by uf, nome'),
    query(`select uf from municipios where uf is not null group by uf order by uf`),
    query(`select distinct on (fonte) fonte, referencia, escopo, registros, concluido_em
           from importacoes order by fonte, concluido_em desc`),
    query('select id, nome, padrao from icps order by padrao desc, nome'),
  ]);
  const municipios = uf
    ? await query('select codigo, nome from municipios where uf = $1 order by nome', [uf.toUpperCase().slice(0, 2)])
    : [];
  return ok({ segmentos, regioes, ufs: ufs.map((u) => u.uf), municipios, importacoes: base, icps });
});
