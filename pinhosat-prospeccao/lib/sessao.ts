// Sessão do navegador: cookie com {usuário, expiração} assinado com HMAC-SHA256 (Web Crypto: funciona no proxy e nas rotas).

export const COOKIE_SESSAO = 'pinhosat_sessao';
export const DURACAO_LEMBRAR = 30 * 24 * 3600;   // "manter conectado": 30 dias
export const DURACAO_PADRAO = 12 * 3600;         // sem "manter conectado": 12 horas (cookie de sessão)

const enc = new TextEncoder();
const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Segredo de assinatura: AUTH_SECRET; na falta dele, derivado de APP_USERS (trocar a senha invalida as sessões). */
function segredo(): string {
  return process.env.AUTH_SECRET || `pinhosat:${process.env.APP_USERS ?? ''}`;
}

async function chave() {
  return crypto.subtle.importKey('raw', enc.encode(segredo()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function criarToken(usuario: string, segundos: number): Promise<string> {
  const corpo = b64url(enc.encode(JSON.stringify({ u: usuario, exp: Math.floor(Date.now() / 1000) + segundos })));
  const assinatura = await crypto.subtle.sign('HMAC', await chave(), enc.encode(corpo));
  return `${corpo}.${b64url(assinatura)}`;
}

/** Usuário do token se a assinatura confere, não expirou e o usuário ainda existe em APP_USERS. */
export async function lerToken(token: string | undefined, usuariosValidos: Set<string>): Promise<string | null> {
  if (!token) return null;
  const [corpo, assinatura] = token.split('.');
  if (!corpo || !assinatura) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await chave(), deB64url(assinatura), enc.encode(corpo));
    if (!ok) return null;
    const { u, exp } = JSON.parse(new TextDecoder().decode(deB64url(corpo)));
    if (typeof u !== 'string' || typeof exp !== 'number' || exp < Date.now() / 1000) return null;
    return usuariosValidos.has(u) ? u : null;
  } catch {
    return null;
  }
}
