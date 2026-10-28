import { ok, rota, corpo, texto, ErroValidacao } from '@/lib/api';
import { query } from '@/lib/db';
import { usuarioDe } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const TIPOS = ['telefone', 'whatsapp', 'email', 'site'];

function normalizarValor(tipo: string, v: string): string {
  if (tipo === 'telefone' || tipo === 'whatsapp') {
    const d = v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    if (d.length < 10 || d.length > 11) throw new ErroValidacao('Telefone deve ter DDD + número.');
    return d;
  }
  if (tipo === 'email') {
    const e = v.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)) throw new ErroValidacao('E-mail inválido.');
    return e;
  }
  const u = v.trim().replace(/^(?!https?:\/\/)/i, 'https://');
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) throw new Error();
    return url.origin + (url.pathname === '/' ? '' : url.pathname);
  } catch {
    throw new ErroValidacao('Site inválido.');
  }
}

/** Contato complementar — sempre com a fonte de onde foi obtido (LGPD: origem dos dados). */
export const POST = rota(async (req: Request) => {
  const b = await corpo(req);
  const cnpj = String(b.cnpj ?? '').replace(/\D/g, '');
  if (cnpj.length !== 14) throw new ErroValidacao('CNPJ inválido.');
  const tipo = String(b.tipo);
  if (!TIPOS.includes(tipo)) throw new ErroValidacao('Tipo de contato inválido.');
  const valor = normalizarValor(tipo, texto(b.valor, 'valor', 300)!);
  const fonte = texto(b.fonte, 'fonte', 200)!;
  const [r] = await query(`insert into contatos (cnpj, tipo, valor, fonte, verificado, observacao, criado_por)
    values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [cnpj, tipo, valor, fonte, b.verificado === true, texto(b.observacao, 'observação', 500, false), usuarioDe(req)]);
  return ok(r, 201);
});

export const DELETE = rota(async (req: Request) => {
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id)) throw new ErroValidacao('Contato inválido.');
  await query('delete from contatos where id = $1', [id]);
  return ok({ ok: true });
});
