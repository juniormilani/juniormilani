import { ok, rota } from '@/lib/api';
import { query } from '@/lib/db';
import { empresasPorCnpj } from '@/lib/servico';

export const dynamic = 'force-dynamic';

/** Painel de acompanhamento: retornos vencidos/próximos e contagem por status. */
export const GET = rota(async () => {
  const pendentes = await query<{ cnpj: string }>(
    `select cnpj from prospeccao where proximo_contato is not null and proximo_contato <= current_date + 7
       and status not in ('cliente','sem_interesse','nao_prospectar') order by proximo_contato limit 500`);
  const porStatus = await query('select status, count(*)::int as qtd from prospeccao group by status');
  const empresas = await empresasPorCnpj(pendentes.map((p) => p.cnpj));
  empresas.sort((a, b) => (a.proximoContato ?? '').localeCompare(b.proximoContato ?? ''));
  return ok({ empresas, porStatus });
});
