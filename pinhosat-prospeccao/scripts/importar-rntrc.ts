// Importa o cadastro de transportadores do RNTRC (ANTT — dados abertos) para a tabela "rntrc".
// Fonte: https://dados.antt.gov.br/dataset/rntrc  (arquivo mensal transportadores_rntrc_MM_AAAA.csv)
//
// Uso: npm run importar:rntrc -- --arquivo ./dados-rf/rntrc.csv --ref 2026-09
//
// Só registros com CNPJ são importados: transportadores autônomos (TAC, pessoa física/CPF) são
// descartados por minimização de dados (LGPD) e por não serem o público-alvo.

import { createReadStream } from 'node:fs';
import { once } from 'node:events';
import iconv from 'iconv-lite';
import { parse } from 'csv-parse';
import { from as copyFrom } from 'pg-copy-streams';
import { pool } from '../lib/db';
import { soDigitos } from '../lib/texto';
import { linhaCopy } from './rf-parse';

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const ARQ = arg('arquivo');
const REF = arg('ref');
if (!ARQ || !REF) {
  console.error('Uso: --arquivo transportadores_rntrc.csv --ref AAAA-MM');
  process.exit(1);
}

const data = (s: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

async function main() {
  const db = pool();
  const cli = await db.connect();
  try {
    await cli.query('begin');
    await cli.query(`create temp table stg_rntrc (cnpj char(14), numero_rntrc text, categoria text, situacao text,
      data_cadastro date, data_situacao date, uf char(2), referencia text) on commit drop`);
    const copia = cli.query(copyFrom('copy stg_rntrc (cnpj, numero_rntrc, categoria, situacao, data_cadastro, data_situacao, uf, referencia) from stdin'));
    const fim = new Promise<void>((ok, erro) => { copia.on('finish', ok); copia.on('error', erro); });
    const leitor = createReadStream(ARQ!)
      .pipe(iconv.decodeStream('latin1'))
      .pipe(parse({ delimiter: ';', columns: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true }));
    let total = 0, aceitos = 0;
    const vistos = new Set<string>();
    for await (const r of leitor as AsyncIterable<Record<string, string>>) {
      total++;
      const cnpj = soDigitos(r.cpfcnpjtransportador);
      if (cnpj.length !== 14 || vistos.has(cnpj)) continue;
      vistos.add(cnpj);
      aceitos++;
      const ok = copia.write(linhaCopy([cnpj, r.numero_rntrc?.trim() || null, (r.categoria_transportador ?? '').trim() || null,
        (r.situacao_rntrc ?? '').trim().toUpperCase() || null, data(r.data_primeiro_cadastro ?? ''),
        data(r.data_situacao_rntrc ?? ''), (r.uf ?? '').trim().toUpperCase().slice(0, 2) || null, REF!]));
      if (!ok) await once(copia, 'drain');
    }
    copia.end();
    await fim;
    await cli.query('delete from rntrc');
    await cli.query(`insert into rntrc (cnpj, numero_rntrc, categoria, situacao, data_cadastro, data_situacao, uf, referencia)
      select cnpj, numero_rntrc, categoria, situacao, data_cadastro, data_situacao, uf, referencia from stg_rntrc`);
    await cli.query('delete from rntrc_empresa');
    await cli.query(`insert into rntrc_empresa (cnpj_basico, numero_rntrc, categoria, situacao)
      select distinct on (cnpj_basico) cnpj_basico, numero_rntrc, categoria, situacao from rntrc
      order by cnpj_basico, (situacao = 'ATIVO') desc, (substr(cnpj, 9, 4) = '0001') desc`);
    await cli.query(`insert into importacoes (fonte, referencia, escopo, registros) values ('rntrc', $1, 'Brasil (somente CNPJ)', $2)`,
      [REF, aceitos]);
    await cli.query('commit');
    console.log(`RNTRC: ${total.toLocaleString('pt-BR')} linhas lidas, ${aceitos.toLocaleString('pt-BR')} transportadores com CNPJ gravados`);
  } catch (e) {
    await cli.query('rollback');
    throw e;
  } finally {
    cli.release();
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
