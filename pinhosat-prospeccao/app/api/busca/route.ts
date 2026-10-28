import { ok, rota, corpo } from '@/lib/api';
import { sanitizarFiltros } from '@/lib/filtros';
import { buscarEmpresas } from '@/lib/servico';

export const dynamic = 'force-dynamic';

export const POST = rota(async (req: Request) => {
  const filtros = sanitizarFiltros(await corpo(req));
  delete filtros.cnpjs;
  const inicio = Date.now();
  const r = await buscarEmpresas(filtros);
  return ok({ ...r, filtros, ms: Date.now() - inicio });
});
