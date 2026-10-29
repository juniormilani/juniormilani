import { NextResponse, type NextRequest } from 'next/server';
import { CABECALHO_USUARIO, autenticarBasic, usuariosConfigurados } from './lib/auth';
import { COOKIE_SESSAO, lerToken } from './lib/sessao';

const PUBLICAS = ['/login', '/api/login', '/api/logout'];

export async function proxy(req: NextRequest) {
  const usuarios = usuariosConfigurados();
  if (usuarios.size === 0) {
    return new NextResponse('Configure APP_USERS para liberar o acesso.', { status: 503 });
  }
  const { pathname, search } = req.nextUrl;
  const usuario = (await lerToken(req.cookies.get(COOKIE_SESSAO)?.value, new Set(usuarios.keys())))
    ?? autenticarBasic(req.headers.get('authorization'));

  if (PUBLICAS.includes(pathname)) {
    // Quem já está logado e abre /login volta para o início.
    if (usuario && pathname === '/login') return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.next();
  }
  if (!usuario) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ erro: 'Sessão expirada. Entre novamente.' }, { status: 401 });
    }
    const destino = new URL('/login', req.url);
    if (pathname !== '/') destino.searchParams.set('volta', pathname + search);
    return NextResponse.redirect(destino);
  }
  // Repassa o usuário às rotas; descarta qualquer valor que o cliente tenha enviado nesse cabeçalho.
  const cabecalhos = new Headers(req.headers);
  cabecalhos.set(CABECALHO_USUARIO, usuario);
  return NextResponse.next({ request: { headers: cabecalhos } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
