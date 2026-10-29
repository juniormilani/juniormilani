// Cria as regiões iniciais do RS a partir dos nomes dos municípios (rodar após a importação da RF,
// que preenche a UF de cada município). Regiões existentes com o mesmo nome são atualizadas.
import { pool } from '../lib/db';
import { normalizar } from '../lib/texto';

const REGIOES: { nome: string; uf: string; municipios: string[] }[] = [
  {
    nome: 'Eixo prioritário PinhoSat (Sapucaia–POA)',
    uf: 'RS',
    municipios: ['Sapucaia do Sul', 'Esteio', 'Canoas', 'São Leopoldo', 'Novo Hamburgo', 'Porto Alegre'],
  },
  {
    // COREDE Vale do Rio dos Sinos
    nome: 'Vale dos Sinos',
    uf: 'RS',
    municipios: ['Araricá', 'Campo Bom', 'Canoas', 'Dois Irmãos', 'Estância Velha', 'Esteio', 'Ivoti', 'Nova Hartz',
      'Nova Santa Rita', 'Novo Hamburgo', 'Portão', 'São Leopoldo', 'Sapiranga', 'Sapucaia do Sul'],
  },
  {
    // Região Metropolitana de Porto Alegre (34 municípios)
    nome: 'Grande Porto Alegre (RMPA)',
    uf: 'RS',
    municipios: ['Alvorada', 'Araricá', 'Arroio dos Ratos', 'Cachoeirinha', 'Campo Bom', 'Canoas', 'Capela de Santana',
      'Charqueadas', 'Dois Irmãos', 'Eldorado do Sul', 'Estância Velha', 'Esteio', 'Glorinha', 'Gravataí', 'Guaíba',
      'Igrejinha', 'Ivoti', 'Montenegro', 'Nova Hartz', 'Nova Santa Rita', 'Novo Hamburgo', 'Parobé', 'Portão',
      'Porto Alegre', 'Rolante', 'Santo Antônio da Patrulha', 'São Jerônimo', 'São Leopoldo', 'São Sebastião do Caí',
      'Sapiranga', 'Sapucaia do Sul', 'Taquara', 'Triunfo', 'Viamão'],
  },
];

async function main() {
  const db = pool();
  for (const r of REGIOES) {
    const nomes = r.municipios.map(normalizar);
    const { rows } = await db.query<{ codigo: string; nome_busca: string }>(
      'select codigo, nome_busca from municipios where uf = $1 and nome_busca = any($2::text[])', [r.uf, nomes]);
    const faltando = nomes.filter((n) => !rows.some((x) => x.nome_busca === n));
    if (faltando.length) console.warn(`${r.nome}: municípios não encontrados: ${faltando.join(', ')}`);
    await db.query(`insert into regioes (nome, uf, municipios) values ($1, $2, $3)
      on conflict (nome) do update set municipios = excluded.municipios, uf = excluded.uf`,
      [r.nome, r.uf, rows.map((x) => x.codigo)]);
    console.log(`${r.nome}: ${rows.length} municípios`);
  }
  // ICPs iniciais sem região definida passam a usar a Grande Porto Alegre e o Vale dos Sinos.
  const icps = await db.query(`update icps set criterios = jsonb_set(criterios, '{localizacao,regioes}',
      (select coalesce(jsonb_agg(id), '[]') from regioes where nome in ('Grande Porto Alegre (RMPA)', 'Vale dos Sinos')))
    where coalesce(jsonb_array_length(criterios -> 'localizacao' -> 'regioes'), 0) = 0`);
  if (icps.rowCount) console.log(`${icps.rowCount} perfis de ICP associados às regiões iniciais`);
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
