import { Pool, type QueryResultRow } from 'pg';

declare global {
  // Reaproveita o pool entre recarregamentos do Next em desenvolvimento.
  var __pinhosatPool: Pool | undefined;
}

export function pool(): Pool {
  if (!globalThis.__pinhosatPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL não configurada');
    const pooler = process.env.DATABASE_POOLER === 'true';
    globalThis.__pinhosatPool = new Pool({
      connectionString,
      // Em funções serverless (Vercel) cada instância abre poucas conexões; o pooler do Supabase multiplexa.
      max: pooler ? 3 : 10,
      // A consulta de busca tem muitas expressões (pontuação); o JIT do PostgreSQL gasta segundos
      // compilando-as e não compensa. Atrás de um pooler (que não repassa "options"), configure no
      // papel do banco: alter role <usuario> set jit = off.
      options: pooler ? undefined : '-c jit=off',
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalThis.__pinhosatPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
  const r = await pool().query<T>(sql, params);
  return r.rows;
}
