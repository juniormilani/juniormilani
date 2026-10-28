// Importa os Dados Abertos do CNPJ (Receita Federal) para a tabela "empresas".
//
// Uso:
//   npm run importar:rf -- --dir ./dados-rf --ref 2026-10 --ufs RS [--situacoes 02,03,04 | --situacoes todas]
//
// O diretório deve conter os .zip baixados de https://arquivos.receitafederal.gov.br
// (Cnaes, Municipios, Estabelecimentos0..9, Empresas0..9, Simples). Os arquivos são lidos
// em streaming, sem descompactar no disco. Reexecutar com uma nova competência atualiza
// os registros existentes (upsert por CNPJ) sem tocar em listas e histórico comercial.

import { createInterface } from 'node:readline';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { once } from 'node:events';
import iconv from 'iconv-lite';
import yauzl from 'yauzl';
import { from as copyFrom } from 'pg-copy-streams';
import type { PoolClient } from 'pg';
import { pool } from '../lib/db';
import { normalizar } from '../lib/texto';
import { reclassificarTodos } from '../lib/classificacao';
import { dividirLinha, linhaCopy, parseEmpresa, parseEstabelecimento } from './rf-parse';

function arg(nome: string, padrao?: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : padrao;
}

const DIR = arg('dir', './dados-rf')!;
const REF = arg('ref');
const UFS = new Set((arg('ufs', 'RS') ?? 'RS').toUpperCase().split(',').map((s) => s.trim()));
const TODAS_UFS = UFS.has('TODAS') || UFS.has('BR');
const SIT_ARG = arg('situacoes', '02,03,04')!;
const SITUACOES = SIT_ARG === 'todas' ? null : new Set(SIT_ARG.split(',').map((s) => s.padStart(2, '0')));

if (!REF || !/^\d{4}-\d{2}$/.test(REF)) {
  console.error('Informe a competência da base: --ref AAAA-MM');
  process.exit(1);
}

function arquivos(prefixo: string): string[] {
  return readdirSync(DIR)
    .filter((f) => f.toLowerCase().startsWith(prefixo.toLowerCase()) && f.toLowerCase().endsWith('.zip'))
    .sort()
    .map((f) => join(DIR, f));
}

/** Lê as linhas (já decodificadas de ISO-8859-1) de todos os arquivos dentro de um .zip. */
async function* linhasDoZip(caminho: string): AsyncGenerator<string> {
  const zip = await new Promise<yauzl.ZipFile>((ok, erro) =>
    yauzl.open(caminho, { lazyEntries: true, autoClose: true }, (e, z) => (e ? erro(e) : ok(z!))));
  const entradas: yauzl.Entry[] = [];
  await new Promise<void>((ok, erro) => {
    zip.on('entry', (en: yauzl.Entry) => { entradas.push(en); zip.readEntry(); });
    zip.on('end', ok);
    zip.on('error', erro);
    zip.readEntry();
  });
  // Reabre para ler as entradas (lazyEntries + autoClose fecha ao fim da listagem).
  for (const en of entradas) {
    if (en.fileName.endsWith('/')) continue;
    const z2 = await new Promise<yauzl.ZipFile>((ok, erro) =>
      yauzl.open(caminho, { lazyEntries: true, autoClose: false }, (e, z) => (e ? erro(e) : ok(z!))));
    const stream = await new Promise<Readable>((ok, erro) =>
      z2.openReadStream(en, (e, s) => (e ? erro(e) : ok(s!))));
    const rl = createInterface({ input: stream.pipe(iconv.decodeStream('latin1')), crlfDelay: Infinity });
    for await (const linha of rl) yield linha;
    z2.close();
  }
}

async function escrever(dest: Writable, dado: string) {
  if (!dest.write(dado)) await once(dest, 'drain');
}

async function copiar(cli: PoolClient, sql: string, produzir: (w: Writable) => Promise<void>) {
  const stream = cli.query(copyFrom(sql));
  const fim = new Promise<void>((ok, erro) => { stream.on('finish', ok); stream.on('error', erro); });
  await produzir(stream);
  stream.end();
  await fim;
}

const t0 = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(5)}s] ${msg}`);

async function main() {
  if (!existsSync(DIR)) throw new Error(`Diretório não encontrado: ${DIR}`);
  const db = pool();
  const cli = await db.connect();
  try {
    // 1) Tabelas de referência --------------------------------------------------
    for (const [arq, tabela] of [['Cnaes', 'cnaes'], ['Municipios', 'municipios']] as const) {
      for (const z of arquivos(arq)) {
        const linhas: [string, string][] = [];
        for await (const l of linhasDoZip(z)) {
          const c = dividirLinha(l);
          if (c.length >= 2 && c[0]) linhas.push([c[0].trim(), c[1].trim()]);
        }
        await cli.query('begin');
        for (const [cod, desc] of linhas) {
          if (tabela === 'cnaes') {
            await cli.query(`insert into cnaes (codigo, descricao, descricao_busca) values ($1,$2,$3)
              on conflict (codigo) do update set descricao = excluded.descricao, descricao_busca = excluded.descricao_busca`,
              [cod.padStart(7, '0'), desc, normalizar(desc)]);
          } else {
            await cli.query(`insert into municipios (codigo, nome, nome_busca) values ($1,$2,$3)
              on conflict (codigo) do update set nome = excluded.nome, nome_busca = excluded.nome_busca`,
              [cod.padStart(4, '0'), desc, normalizar(desc)]);
          }
        }
        await cli.query('commit');
        log(`${tabela}: ${linhas.length} registros`);
      }
    }

    // 2) Estabelecimentos ---------------------------------------------------------
    await cli.query(`drop table if exists stg_estab, stg_emp, stg_simples`);
    await cli.query(`create unlogged table stg_estab (
      cnpj char(14), cnpj_basico char(8), matriz boolean, nome_fantasia text, fantasia_busca text,
      situacao char(2), data_situacao date, data_inicio date, cnae_principal char(7), cnaes_secundarios char(7)[],
      tipo_logradouro text, logradouro text, numero text, complemento text, bairro text, cep char(8), uf char(2),
      municipio_codigo char(4), telefone1 text, telefone2 text, email text)`);
    const basicos = new Set<string>();
    let lidas = 0, aceitas = 0, invalidas = 0;
    for (const z of arquivos('Estabelecimentos')) {
      await copiar(cli, 'copy stg_estab from stdin', async (w) => {
        for await (const l of linhasDoZip(z)) {
          lidas++;
          if (!TODAS_UFS) {
            // Filtro rápido antes de dividir a linha: a UF aparece como "XX" entre ponto-e-vírgulas.
            let achou = false;
            for (const uf of UFS) if (l.includes(`";"${uf}";"`)) { achou = true; break; }
            if (!achou) continue;
          }
          const e = parseEstabelecimento(dividirLinha(l));
          if (!e) { invalidas++; continue; }
          if (!TODAS_UFS && !UFS.has(e.uf)) continue;
          if (SITUACOES && !SITUACOES.has(e.situacao)) continue;
          aceitas++;
          basicos.add(e.cnpj_basico);
          await escrever(w, linhaCopy([e.cnpj, e.cnpj_basico, e.matriz, e.nome_fantasia, e.fantasia_busca, e.situacao,
            e.data_situacao, e.data_inicio, e.cnae_principal, e.cnaes_secundarios, e.tipo_logradouro, e.logradouro,
            e.numero, e.complemento, e.bairro, e.cep, e.uf, e.municipio_codigo, e.telefone1, e.telefone2, e.email]));
        }
      });
      log(`${z}: ${lidas.toLocaleString('pt-BR')} lidas, ${aceitas.toLocaleString('pt-BR')} aceitas, ${invalidas} inválidas`);
    }

    // 3) Empresas (razão social, porte, capital) ---------------------------------------
    await cli.query(`create unlogged table stg_emp (cnpj_basico char(8), razao_social text, razao_busca text,
      natureza_juridica char(4), capital_social numeric(18,2), porte char(2))`);
    let emp = 0;
    for (const z of arquivos('Empresas')) {
      await copiar(cli, 'copy stg_emp from stdin', async (w) => {
        for await (const l of linhasDoZip(z)) {
          const basico = l.slice(1, 9);
          if (!basicos.has(basico)) continue;
          const e = parseEmpresa(dividirLinha(l));
          if (!e) continue;
          emp++;
          await escrever(w, linhaCopy([e.cnpj_basico, e.razao_social, e.razao_busca, e.natureza_juridica, e.capital_social, e.porte]));
        }
      });
      log(`${z}: ${emp.toLocaleString('pt-BR')} empresas`);
    }

    // 4) Simples / MEI ---------------------------------------------------------------
    await cli.query(`create unlogged table stg_simples (cnpj_basico char(8), opcao_simples boolean, opcao_mei boolean)`);
    let simp = 0;
    for (const z of arquivos('Simples')) {
      await copiar(cli, 'copy stg_simples from stdin', async (w) => {
        for await (const l of linhasDoZip(z)) {
          const basico = l.slice(1, 9);
          if (!basicos.has(basico)) continue;
          const c = dividirLinha(l);
          simp++;
          await escrever(w, linhaCopy([c[0], c[1] === 'S', c[4] === 'S']));
        }
      });
      log(`${z}: ${simp.toLocaleString('pt-BR')} registros do Simples`);
    }

    // 5) Consolidação (upsert) ---------------------------------------------------------
    log('consolidando na tabela empresas...');
    await cli.query('create index on stg_emp (cnpj_basico)');
    await cli.query('create index on stg_simples (cnpj_basico)');
    await cli.query('analyze stg_estab; analyze stg_emp; analyze stg_simples');
    const r = await cli.query(`
      insert into empresas (cnpj, cnpj_basico, matriz, razao_social, nome_fantasia, nomes_busca, situacao, data_situacao,
        data_inicio, cnae_principal, cnaes_secundarios, tipo_logradouro, logradouro, numero, complemento, bairro, cep, uf,
        municipio_codigo, telefone1, telefone2, email, natureza_juridica, porte, capital_social, opcao_simples, opcao_mei,
        referencia, importado_em)
      select distinct on (s.cnpj) s.cnpj, s.cnpj_basico, s.matriz, m.razao_social, s.nome_fantasia,
        trim(coalesce(m.razao_busca, '') || ' ' || coalesce(s.fantasia_busca, '')), s.situacao, s.data_situacao,
        s.data_inicio, s.cnae_principal, s.cnaes_secundarios, s.tipo_logradouro, s.logradouro, s.numero, s.complemento,
        s.bairro, s.cep, s.uf, s.municipio_codigo, s.telefone1, s.telefone2, s.email, m.natureza_juridica, m.porte,
        m.capital_social, si.opcao_simples, si.opcao_mei, $1, now()
      from stg_estab s
      left join stg_emp m on m.cnpj_basico = s.cnpj_basico
      left join stg_simples si on si.cnpj_basico = s.cnpj_basico
      order by s.cnpj
      on conflict (cnpj) do update set
        matriz = excluded.matriz, razao_social = excluded.razao_social, nome_fantasia = excluded.nome_fantasia,
        nomes_busca = excluded.nomes_busca, situacao = excluded.situacao, data_situacao = excluded.data_situacao,
        data_inicio = excluded.data_inicio, cnae_principal = excluded.cnae_principal,
        cnaes_secundarios = excluded.cnaes_secundarios, tipo_logradouro = excluded.tipo_logradouro,
        logradouro = excluded.logradouro, numero = excluded.numero, complemento = excluded.complemento,
        bairro = excluded.bairro, cep = excluded.cep, uf = excluded.uf, municipio_codigo = excluded.municipio_codigo,
        telefone1 = excluded.telefone1, telefone2 = excluded.telefone2, email = excluded.email,
        natureza_juridica = excluded.natureza_juridica, porte = excluded.porte, capital_social = excluded.capital_social,
        opcao_simples = excluded.opcao_simples, opcao_mei = excluded.opcao_mei, referencia = excluded.referencia,
        importado_em = excluded.importado_em`, [REF]);
    log(`empresas: ${r.rowCount?.toLocaleString('pt-BR')} estabelecimentos gravados`);

    // Estabelecimentos que deixaram de constar no filtro (ex.: foram baixados) ficam com a
    // competência antiga; marcamos a situação como baixada se não vieram nesta importação.
    if (SITUACOES && !SITUACOES.has('08')) {
      const ufs = TODAS_UFS ? null : [...UFS];
      const b = await cli.query(`update empresas e set situacao = '08', referencia = $1, importado_em = now()
        where e.referencia <> $1 and ($2::char(2)[] is null or e.uf = any($2::char(2)[]))
          and not exists (select 1 from stg_estab s where s.cnpj = e.cnpj)`, [REF, ufs]);
      if (b.rowCount) log(`${b.rowCount} estabelecimentos ausentes nesta competência marcados como baixados`);
    }

    await cli.query('begin');
    await cli.query('delete from empresas_grupo');
    await cli.query(`insert into empresas_grupo (cnpj_basico, estabelecimentos)
      select cnpj_basico, count(*) from empresas where situacao = '02' group by cnpj_basico having count(*) > 1`);
    await cli.query('commit');
    await cli.query(`update municipios m set uf = x.uf from (
      select municipio_codigo, min(uf) uf from empresas group by municipio_codigo) x
      where x.municipio_codigo = m.codigo and m.uf is distinct from x.uf`);
    await cli.query('drop table stg_estab, stg_emp, stg_simples');
    await cli.query(`insert into importacoes (fonte, referencia, escopo, registros) values ('receita_federal', $1, $2, $3)`,
      [REF, `UF: ${TODAS_UFS ? 'todas' : [...UFS].join(',')}; situações: ${SIT_ARG}`, r.rowCount]);
    await cli.query('analyze empresas');
    log('classificando nos segmentos...');
    await reclassificarTodos(cli, log);
    log('concluído');
  } finally {
    cli.release();
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
