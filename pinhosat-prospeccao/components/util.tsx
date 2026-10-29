'use client';
import { useCallback, useState } from 'react';

/** Sessão expirada: volta para o login e retorna à página atual depois de entrar. */
function irParaLogin() {
  window.location.replace(`/login?volta=${encodeURIComponent(location.pathname + location.search)}`);
}

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (r.status === 401) irParaLogin();
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
  return j as T;
}

/** Faz POST e dispara o download do arquivo retornado. */
export async function baixar(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 401) irParaLogin();
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.erro ?? `Erro ${r.status}`);
  }
  const nome = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? 'leads';
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const mostrar = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((atual) => (atual === m ? null : atual)), 4500);
  }, []);
  const Toast = () => (msg ? <div className="toast" role="status">{msg}</div> : null);
  return { mostrar, Toast };
}

export const dataBr = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR') : '';
