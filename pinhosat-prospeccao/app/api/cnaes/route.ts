import { ok, rota } from '@/lib/api';
import { query } from '@/lib/db';
import { normalizar } from '@/lib/texto';

export const dynamic = 'force-dynamic';

/** Pesquisa na tabela oficial de CNAEs (por código ou descrição) — ajuda a montar segmentos. */
export const GET = rota(async (req: Request) => {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q.length < 2) return ok({ cnaes: [] });
  const dig = q.replace(/\D/g, '');
  const cnaes = dig.length >= 2 && dig.length === q.replace(/[\s./-]/g, '').length
    ? await query('select codigo, descricao from cnaes where codigo like $1 order by codigo limit 30', [dig + '%'])
    : await query('select codigo, descricao from cnaes where descricao_busca like $1 order by codigo limit 30',
        [`%${normalizar(q).replace(/[\\%_]/g, '\\$&')}%`]);
  return ok({ cnaes });
});
