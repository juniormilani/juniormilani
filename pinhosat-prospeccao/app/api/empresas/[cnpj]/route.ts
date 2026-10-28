import { ok, rota } from '@/lib/api';
import { query } from '@/lib/db';
import { empresasPorCnpj } from '@/lib/servico';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ cnpj: string }> };

export const GET = rota(async (_req: Request, ctx: Ctx) => {
  const cnpj = (await ctx.params).cnpj.replace(/\D/g, '');
  const [empresa] = await empresasPorCnpj([cnpj]);
  if (!empresa) return ok({ erro: 'Empresa não encontrada na base.' }, 404);
  const [prospeccao] = await query('select * from prospeccao where cnpj = $1', [cnpj]);
  const historico = await query(
    'select status, nota, usuario, criado_em from prospeccao_historico where cnpj = $1 order by criado_em desc limit 100', [cnpj]);
  const contatos = await query('select id, tipo, valor, fonte, verificado, observacao, criado_por, criado_em from contatos where cnpj = $1 order by criado_em', [cnpj]);
  const outrosEstabelecimentos = await query(
    `select e.cnpj, e.matriz, e.nome_fantasia, m.nome as cidade, e.uf, e.situacao, p.status
     from empresas e left join municipios m on m.codigo = e.municipio_codigo left join prospeccao p on p.cnpj = e.cnpj
     where e.cnpj_basico = $1 and e.cnpj <> $2 order by e.matriz desc, e.cnpj limit 50`, [cnpj.slice(0, 8), cnpj]);
  return ok({ empresa, prospeccao: prospeccao ?? null, historico, contatos, outrosEstabelecimentos });
});
