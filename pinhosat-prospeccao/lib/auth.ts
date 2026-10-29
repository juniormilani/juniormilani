// Autenticação do MVP: usuários definidos em APP_USERS ("usuario:senha,usuario2:senha2").
// O navegador entra pela tela /login, que grava um cookie de sessão assinado (ver lib/sessao.ts).
// Scripts e integrações podem usar HTTP Basic no cabeçalho Authorization.
// Para multiusuário com papéis, migrar para Supabase Auth.

export const CABECALHO_USUARIO = 'x-pinhosat-usuario';

export function usuariosConfigurados(): Map<string, string> {
  const m = new Map<string, string>();
  for (const par of (process.env.APP_USERS ?? '').split(',')) {
    const i = par.indexOf(':');
    if (i > 0) m.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
  }
  return m;
}

export function comparar(a: string, b: string): boolean {
  // Comparação em tempo constante (evita timing attack trivial).
  let dif = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) dif |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return dif === 0;
}

/** Confere usuário e senha contra APP_USERS. */
export function credenciaisValidas(usuario: string, senha: string): boolean {
  const esperado = usuariosConfigurados().get(usuario);
  return esperado !== undefined && comparar(senha, esperado);
}

/** Usuário a partir de HTTP Basic (scripts/integrações), ou null. */
export function autenticarBasic(authorization: string | null): string | null {
  if (!authorization?.startsWith('Basic ')) return null;
  let dec: string;
  try {
    dec = atob(authorization.slice(6));
  } catch {
    return null;
  }
  const i = dec.indexOf(':');
  if (i < 0) return null;
  const usuario = dec.slice(0, i);
  return credenciaisValidas(usuario, dec.slice(i + 1)) ? usuario : null;
}

/** Usuário autenticado da requisição — definido pelo proxy, que descarta qualquer valor enviado pelo cliente. */
export function usuarioDe(req: Request): string {
  return req.headers.get(CABECALHO_USUARIO) ?? 'desconhecido';
}
