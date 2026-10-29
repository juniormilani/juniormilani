import { NextResponse } from 'next/server';
import { usuarioDe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Usuário logado (para exibir no topo). */
export function GET(req: Request) {
  return NextResponse.json({ usuario: usuarioDe(req) });
}
