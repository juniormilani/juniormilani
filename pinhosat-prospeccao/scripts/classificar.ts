// Recalcula a classificação de todas as empresas em todos os segmentos.
import { pool } from '../lib/db';
import { reclassificarTodos } from '../lib/classificacao';

async function main() {
  const db = pool();
  const cli = await db.connect();
  try {
    await reclassificarTodos(cli, console.log);
  } finally {
    cli.release();
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
