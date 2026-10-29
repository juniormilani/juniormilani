import { ok, rota } from '@/lib/api';
import { analisarIcp } from '@/lib/calibracao';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = rota(async (req: Request) => {
  const id = Number(new URL(req.url).searchParams.get('icp')) || undefined;
  const analise = await analisarIcp(id);
  if (!analise) return ok({ erro: 'Perfil ICP não encontrado.' }, 404);
  return ok(analise);
});
