import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dominioCorporativo, ehCelular, formatarCnpj, formatarTelefone, normalizar, palavraParaRegex } from './texto';
import { dataRf, dividirLinha, parseEmpresa, parseEstabelecimento, razaoSemCpf, telefoneRf } from '../scripts/rf-parse';
import { montarConsulta } from './busca';
import { sanitizarFiltros } from './filtros';
import { gerarCsv } from './exportar';
import { CAMPOS } from './campos';

test('normalizar remove acentos e padroniza', () => {
  assert.equal(normalizar('  São   Leopoldo '), 'SAO LEOPOLDO');
  assert.equal(normalizar('Hidrojateamento Ágil'), 'HIDROJATEAMENTO AGIL');
});

test('palavraParaRegex: palavra inteira x prefixo', () => {
  const inteira = new RegExp(palavraParaRegex('gás')!.replace(/\\m/g, '\\b').replace(/\\M/g, '\\b'));
  assert.ok(inteira.test('REVENDA DE GAS SILVA'));
  assert.ok(!inteira.test('GASTRONOMIA SILVA'));
  const prefixo = new RegExp(palavraParaRegex('desentup*')!.replace(/\\m/g, '\\b'));
  assert.ok(prefixo.test('DESENTUPIDORA CANOAS'));
  assert.equal(palavraParaRegex('ab'), null);
});

test('telefones e celulares', () => {
  assert.equal(telefoneRf('51', '99998888'), '51999998888', 'celular antigo recebe o 9º dígito');
  assert.equal(telefoneRf('51', '34567890'), '5134567890', 'fixo mantém 8 dígitos');
  assert.equal(telefoneRf('', '34567890'), null);
  assert.equal(telefoneRf('51', '00000000'), null);
  assert.ok(ehCelular('51999998888'));
  assert.ok(!ehCelular('5134567890'));
  assert.equal(formatarTelefone('51999998888'), '(51) 99999-8888');
  assert.equal(formatarCnpj('12345678000190'), '12.345.678/0001-90');
});

test('e-mail corporativo', () => {
  assert.equal(dominioCorporativo('contato@transportesx.com.br'), 'transportesx.com.br');
  assert.equal(dominioCorporativo('fulano@gmail.com'), null);
  assert.equal(dominioCorporativo('fiscal@contabilidadeabc.com.br'), null);
});

test('parser da Receita Federal', () => {
  assert.deepEqual(dividirLinha('"a";"b;c";"d"'), ['a', 'b;c', 'd']);
  assert.deepEqual(dividirLinha('"a";"diz ""oi""";"d"'), ['a', 'diz "oi"', 'd']);
  assert.equal(dataRf('20200115'), '2020-01-15');
  assert.equal(dataRf('00000000'), null);
  const linha = ['12345678', '0001', '90', '1', 'TRANSX', '02', '20200101', '00', '', '', '20100505', '4930202', '5211799,4930201',
    'RUA', 'DAS FLORES', '100', 'SALA 2', 'CENTRO', '93200000', 'RS', '8589', '51', '99998888', '51', '32223333', '', '', 'CONTATO@TRANSX.COM.BR', '', ''];
  const e = parseEstabelecimento(linha)!;
  assert.equal(e.cnpj, '12345678000190');
  assert.equal(e.matriz, true);
  assert.deepEqual(e.cnaes_secundarios, ['5211799', '4930201']);
  assert.equal(e.telefone1, '51999998888');
  assert.equal(e.email, 'contato@transx.com.br');
  assert.equal(razaoSemCpf('JOAO DA SILVA 12345678901'), 'JOAO DA SILVA');
  const emp = parseEmpresa(['12345678', 'TRANSX LTDA', '2062', '49', '150000,00', '03', ''])!;
  assert.equal(emp.capital_social, '150000.00');
  assert.equal(emp.porte, '03');
});

test('consulta parametrizada: nenhum valor do usuário entra no SQL', () => {
  const f = sanitizarFiltros({ texto: "x'; drop table empresas; --", segmentos: [1], ufs: ['RS'], comTelefone: true, limite: 999999 });
  const { sql, params } = montarConsulta(f);
  assert.ok(!sql.includes('drop table'));
  assert.ok(params.includes("%X'; DROP TABLE EMPRESAS; --%"));
  assert.match(sql, /limit 5000/);
});

test('modo restrito considera só o CNAE principal', () => {
  assert.match(montarConsulta({ segmentos: [2], modoSegmento: 'principal' }).sql, /es\.tipo <= 1/);
  assert.match(montarConsulta({ segmentos: [2] }).sql, /es\.tipo <= 3/);
});

test('CSV: BOM, separador ; e proteção contra fórmulas', () => {
  const campos = CAMPOS.filter((c) => ['razao_social', 'pontos'].includes(c.chave));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const csv = gerarCsv([{ razaoSocial: '=HYPERLINK("x");1', pontos: -5 } as any], campos);
  assert.ok(csv.startsWith('﻿Razão social;Pontuação'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"");1";-5`));
});

test('ICP: validação completa padrões e recusa pesos inválidos', async () => {
  const { validarCriterios } = await import('./icp');
  const c = validarCriterios({ segmentos: { peso: 4, ids: [1, '2', 'x'] }, porte: { valores: ['05', '99'] } });
  assert.deepEqual(c.segmentos.ids, [1, 2]);
  assert.deepEqual(c.porte.valores, ['05']);
  assert.equal(c.eliminatorios.mei, true);
  assert.throws(() => validarCriterios({ rntrc: { peso: 11 } }));
  assert.throws(() => validarCriterios({ segmentos: { peso: 0 }, porte: { peso: 0 }, capital: { peso: 0 }, idade: { peso: 0 },
    estabelecimentos: { peso: 0 }, rntrc: { peso: 0 }, localizacao: { peso: 0 }, contato: { peso: 0 } }));
});

test('ICP: score ponderado, eliminatórios e filtros por faixa entram na consulta', async () => {
  const { validarCriterios } = await import('./icp');
  const icp = { id: 1, nome: 'Teste', descricao: null, padrao: true, municipiosIdeais: ['8589'],
    criterios: validarCriterios({ segmentos: { peso: 3, ids: [1] }, localizacao: { peso: 2, regioes: [1] } }) };
  const { sql, params } = montarConsulta({ icpFaixas: ['A', 'B'] }, [], icp);
  assert.match(sql, /icp_seg_tipo/);
  assert.match(sql, /coalesce\(b\.opcao_mei, false\)/);
  assert.match(sql, /icp_faixa = any/);
  assert.match(sql, /order by icp_score desc/);
  assert.ok(params.some((p) => Array.isArray(p) && p.includes('8589')));
  // Soma dos pesos padrão + os definidos: segmento 3, porte 2, capital 1, idade 1, rntrc 2, localização 2, contato 1 = 12
  assert.match(sql, /\* 100\.0 \/ 12/);
});

test('CNPJ: dígito verificador e extração de texto livre', async () => {
  const { cnpjValido, extrairCnpjs } = await import('./cnpj');
  assert.ok(cnpjValido('11222333000181'));
  assert.ok(!cnpjValido('11222333000182'));
  assert.ok(!cnpjValido('11111111111111'));
  const r = extrairCnpjs('Cliente;CNPJ\nTransX;11.222.333/0001-81\nErrado;11.222.333/0001-82\nDup;11222333000181');
  assert.deepEqual(r.validos, ['11222333000181']);
  assert.deepEqual(r.invalidos, ['11222333000182']);
});

test('um lead por empresa usa distinct on pela raiz do CNPJ', () => {
  assert.match(montarConsulta({ umPorEmpresa: true }).sql, /distinct on \(cnpj_basico\)/);
  assert.doesNotMatch(montarConsulta({}).sql, /distinct on/);
});
