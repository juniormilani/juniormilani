import { NextResponse, type NextRequest } from 'next/server';
import { autenticar, usuariosConfigurados } from './lib/auth';

export function proxy(req: NextRequest) {
  if (usuariosConfigurados().size === 0) {
    return new NextResponse('Configure APP_USERS para liberar o acesso.', { status: 503 });
  }
  if (!autenticar(req.headers.get('authorization'))) {
    return new NextResponse('Acesso restrito à equipe PinhoSat.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="PinhoSat Prospeccao", charset="UTF-8"' },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
