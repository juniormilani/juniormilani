import { NextResponse } from 'next/server';
import { credenciaisValidas } from '@/lib/auth';
import { COOKIE_SESSAO, DURACAO_LEMBRAR, DURACAO_PADRAO, criarToken } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let b: { usuario?: unknown; senha?: unknown; lembrar?: unknown } = {};
  try { b = await req.json(); } catch { /* corpo inválido */ }
  const usuario = typeof b.usuario === 'string' ? b.usuario.trim() : '';
  const senha = typeof b.senha === 'string' ? b.senha : '';
  if (!usuario || !senha || !credenciaisValidas(usuario, senha)) {
    // Atraso fixo: encarece tentativas de adivinhar a senha.
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ erro: 'Usuário ou senha incorretos.' }, { status: 401 });
  }
  const lembrar = b.lembrar === true;
  const res = NextResponse.json({ ok: true, usuario });
  res.cookies.set(COOKIE_SESSAO, await criarToken(usuario, lembrar ? DURACAO_LEMBRAR : DURACAO_PADRAO), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(lembrar ? { maxAge: DURACAO_LEMBRAR } : {}),
  });
  return res;
}
