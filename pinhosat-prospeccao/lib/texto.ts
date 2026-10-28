// Utilitários de texto e formatação compartilhados entre importador, API e interface.

/** Remove acentos, converte para maiúsculas e compacta espaços. */
export function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function soDigitos(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

/**
 * Converte uma palavra-chave de segmento em expressão regular do PostgreSQL.
 * "TRANSPORTES"  -> palavra inteira (\mTRANSPORTES\M)
 * "DESENTUP*"    -> prefixo        (\mDESENTUP)
 */
export function palavraParaRegex(palavra: string): string | null {
  const p = normalizar(palavra);
  if (!p) return null;
  const prefixo = p.endsWith('*');
  const base = (prefixo ? p.slice(0, -1) : p).trim();
  if (base.length < 3) return null;
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  return `\\m${esc}${prefixo ? '' : '\\M'}`;
}

export function formatarCnpj(c: string): string {
  const d = soDigitos(c).padStart(14, '0');
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatarCnae(c: string | null | undefined): string {
  const d = soDigitos(c);
  if (d.length !== 7) return c ?? '';
  return `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}`;
}

export function formatarCep(c: string | null | undefined): string {
  const d = soDigitos(c);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Telefone vindo da RF: DDD + número (8 ou 9 dígitos). */
export function formatarTelefone(t: string | null | undefined): string {
  const d = soDigitos(t);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

/** Número móvel brasileiro (DDD + 9 + 8 dígitos). Não confirma WhatsApp — só indica que pode ter. */
export function ehCelular(t: string | null | undefined): boolean {
  const d = soDigitos(t);
  return d.length === 11 && d[2] === '9';
}

const PROVEDORES_GRATUITOS = new Set([
  'GMAIL.COM', 'HOTMAIL.COM', 'HOTMAIL.COM.BR', 'OUTLOOK.COM', 'OUTLOOK.COM.BR', 'LIVE.COM', 'YAHOO.COM',
  'YAHOO.COM.BR', 'BOL.COM.BR', 'UOL.COM.BR', 'TERRA.COM.BR', 'IG.COM.BR', 'MSN.COM', 'ICLOUD.COM',
  'GLOBO.COM', 'R7.COM', 'ZIPMAIL.COM.BR', 'POP.COM.BR', 'TERRA.COM', 'GMAIL.COM.BR', 'ME.COM',
  'PROTONMAIL.COM', 'YMAIL.COM', 'IBEST.COM.BR', 'OI.COM.BR', 'BRTURBO.COM.BR',
]);

/** Domínio do e-mail quando é corporativo (não é provedor gratuito); senão null. */
export function dominioCorporativo(email: string | null | undefined): string | null {
  const m = /@([A-Z0-9.-]+\.[A-Z]{2,})$/i.exec((email ?? '').trim());
  if (!m) return null;
  const dom = m[1].toUpperCase();
  if (PROVEDORES_GRATUITOS.has(dom)) return null;
  // Escritórios de contabilidade costumam cadastrar o próprio e-mail na RF.
  if (/CONTAB|CONTADOR|ESCRITORIO/.test(dom)) return null;
  return dom.toLowerCase();
}

/** Contadores costumam registrar o próprio e-mail; sinalizamos para não tratar como contato da empresa. */
export function emailProvavelContador(email: string | null | undefined): boolean {
  return /contab|contador|escritorio|assessoria|consultoria|^fiscal@|^dp@/i.test(email ?? '');
}
