// Aplica, em ordem, os arquivos db/migrations/*.sql ainda não aplicados.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from '../lib/db';

async function main() {
  const db = pool();
  await db.query('create table if not exists schema_migrations (nome text primary key, aplicado_em timestamptz not null default now())');
  const feitas = new Set((await db.query<{ nome: string }>('select nome from schema_migrations')).rows.map((r) => r.nome));
  const dir = join(__dirname, '..', 'db', 'migrations');
  for (const arq of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (feitas.has(arq)) continue;
    const cli = await db.connect();
    try {
      await cli.query('begin');
      await cli.query(readFileSync(join(dir, arq), 'utf8'));
      await cli.query('insert into schema_migrations (nome) values ($1)', [arq]);
      await cli.query('commit');
      console.log(`aplicada: ${arq}`);
    } catch (e) {
      await cli.query('rollback');
      throw e;
    } finally {
      cli.release();
    }
  }
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
