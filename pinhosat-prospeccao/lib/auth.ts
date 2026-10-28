// Autenticação do MVP: HTTP Basic com usuários definidos em APP_USERS ("usuario:senha,usuario2:senha2").
// Simples e suficiente para uso interno atrás de HTTPS; para multiusuário com papéis, migrar para Supabase Auth.

export function usuariosConfigurados(): Map<string, string> {
  const m = new Map<string, string>();
  for (const par of (process.env.APP_USERS ?? '').split(',')) {
    const i = par.indexOf(':');
    if (i > 0) m.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
  }
  return m;
}

function comparar(a: string, b: string): boolean {
  // Comparação em tempo constante (evita timing attack trivial).
  let dif = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) dif |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return dif === 0;
}

/** Retorna o usuário autenticado a partir do cabeçalho Authorization, ou null. */
export function autenticar(authorization: string | null): string | null {
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
  const senha = dec.slice(i + 1);
  const esperado = usuariosConfigurados().get(usuario);
  return esperado !== undefined && comparar(senha, esperado) ? usuario : null;
}

export function usuarioDe(req: Request): string {
  return autenticar(req.headers.get('authorization')) ?? 'desconhecido';
}
