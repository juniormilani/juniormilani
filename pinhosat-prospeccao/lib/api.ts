import { NextResponse } from 'next/server';

export class ErroValidacao extends Error {}

export function ok(dados: unknown, status = 200) {
  return NextResponse.json(dados, { status });
}

/** Envolve um handler de rota: erros de validação viram 400; o resto, 500 sem vazar detalhes. */
export function rota<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ErroValidacao) return NextResponse.json({ erro: e.message }, { status: 400 });
      // Violação de unicidade do PostgreSQL
      if ((e as { code?: string }).code === '23505') return NextResponse.json({ erro: 'Registro já existe.' }, { status: 409 });
      console.error(e);
      return NextResponse.json({ erro: 'Erro interno.' }, { status: 500 });
    }
  };
}

export async function corpo(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    return j && typeof j === 'object' ? j : {};
  } catch {
    throw new ErroValidacao('JSON inválido.');
  }
}

export function texto(v: unknown, campo: string, max = 200, obrigatorio = true): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) {
    if (obrigatorio) throw new ErroValidacao(`Campo obrigatório: ${campo}.`);
    return null;
  }
  if (s.length > max) throw new ErroValidacao(`${campo} excede ${max} caracteres.`);
  return s;
}

export function cnpjs(v: unknown, max = 20000): string[] {
  if (!Array.isArray(v)) throw new ErroValidacao('Informe a lista de CNPJs.');
  const lista = [...new Set(v.map((x) => String(x).replace(/\D/g, '')).filter((x) => x.length === 14))];
  if (lista.length > max) throw new ErroValidacao(`Máximo de ${max} empresas por operação.`);
  return lista;
}

export function data(v: unknown, campo: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ErroValidacao(`Data inválida: ${campo}.`);
  return v;
}
