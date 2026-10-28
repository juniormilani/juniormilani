// Parsers dos arquivos de Dados Abertos do CNPJ (Receita Federal).
// Layout: https://www.gov.br/receitafederal/dados/cnpj-metadados.pdf
// Arquivos CSV em ISO-8859-1, separador ";", todos os campos entre aspas.

import { normalizar, soDigitos } from '../lib/texto';

/** Divide uma linha do CSV da RF em campos. Rápido para o caso comum, robusto para aspas internas. */
export function dividirLinha(linha: string): string[] {
  if (linha.endsWith('\r')) linha = linha.slice(0, -1);
  if (linha.startsWith('"') && linha.endsWith('"')) {
    const partes = linha.slice(1, -1).split('";"');
    if (!partes.some((p) => p.includes('"'))) return partes;
  }
  // Caminho lento: parser caractere a caractere.
  const campos: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (aspas) {
      if (ch === '"') {
        if (linha[i + 1] === '"') { atual += '"'; i++; }
        else if (linha[i + 1] === ';' || i + 1 === linha.length) aspas = false;
        else atual += '"'; // aspas soltas no meio do campo
      } else atual += ch;
    } else if (ch === ';') {
      campos.push(atual);
      atual = '';
    } else if (ch === '"' && atual === '') aspas = true;
    else atual += ch;
  }
  campos.push(atual);
  return campos;
}

export function dataRf(s: string): string | null {
  if (!/^\d{8}$/.test(s)) return null;
  const a = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
  if (a < 1900 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export function telefoneRf(ddd: string, tel: string): string | null {
  const d = soDigitos(ddd).replace(/^0+/, '');
  const t = soDigitos(tel);
  if (d.length !== 2 || (t.length !== 8 && t.length !== 9)) return null;
  if (/^(\d)\1+$/.test(t)) return null; // 00000000, 99999999...
  // Celulares cadastrados antes do 9º dígito (começam com 6-9): normaliza para 9 + número.
  if (t.length === 8 && /^[6-9]/.test(t)) return d + '9' + t;
  return d + t;
}

export function emailRf(s: string): string | null {
  const e = s.trim().toLowerCase();
  return /^[^@\s;]+@[^@\s;]+\.[a-z]{2,}$/.test(e) ? e : null;
}

/** Remove CPF que o MEI/empresário individual carrega no fim da razão social (minimização — LGPD). */
export function razaoSemCpf(s: string): string {
  return s.replace(/\s*\d{11}\s*$/, '').trim();
}

const vazio = (s: string | undefined) => {
  const t = (s ?? '').trim();
  return t === '' ? null : t;
};

export interface Estab {
  cnpj: string; cnpj_basico: string; matriz: boolean; nome_fantasia: string | null; fantasia_busca: string;
  situacao: string; data_situacao: string | null; data_inicio: string | null;
  cnae_principal: string | null; cnaes_secundarios: string[];
  tipo_logradouro: string | null; logradouro: string | null; numero: string | null; complemento: string | null;
  bairro: string | null; cep: string | null; uf: string; municipio_codigo: string | null;
  telefone1: string | null; telefone2: string | null; email: string | null;
}

export function parseEstabelecimento(c: string[]): Estab | null {
  if (c.length < 28) return null;
  const basico = c[0].padStart(8, '0');
  const cnpj = basico + c[1].padStart(4, '0') + c[2].padStart(2, '0');
  if (!/^\d{14}$/.test(cnpj)) return null;
  const tel1 = telefoneRf(c[21], c[22]);
  let tel2 = telefoneRf(c[23], c[24]);
  if (tel2 === tel1) tel2 = null;
  const cep = soDigitos(c[18]);
  return {
    cnpj,
    cnpj_basico: basico,
    matriz: c[3] === '1',
    nome_fantasia: vazio(c[4]),
    fantasia_busca: normalizar(c[4]),
    situacao: c[5].padStart(2, '0'),
    data_situacao: dataRf(c[6]),
    data_inicio: dataRf(c[10]),
    cnae_principal: /^\d{7}$/.test(c[11]) ? c[11] : null,
    cnaes_secundarios: c[12] ? c[12].split(',').map((x) => x.trim()).filter((x) => /^\d{7}$/.test(x)) : [],
    tipo_logradouro: vazio(c[13]),
    logradouro: vazio(c[14]),
    numero: vazio(c[15]),
    complemento: vazio(c[16]),
    bairro: vazio(c[17]),
    cep: cep.length === 8 ? cep : null,
    uf: c[19].trim().toUpperCase(),
    municipio_codigo: /^\d{1,4}$/.test(c[20].trim()) ? c[20].trim().padStart(4, '0') : null,
    telefone1: tel1,
    telefone2: tel2,
    email: emailRf(c[27]),
  };
}

export interface EmpresaRf {
  cnpj_basico: string; razao_social: string; razao_busca: string; natureza_juridica: string | null;
  capital_social: string | null; porte: string | null;
}

export function parseEmpresa(c: string[]): EmpresaRf | null {
  if (c.length < 6) return null;
  const razao = razaoSemCpf(c[1] ?? '');
  const cap = (c[4] ?? '').replace(/\./g, '').replace(',', '.');
  return {
    cnpj_basico: c[0].padStart(8, '0'),
    razao_social: razao,
    razao_busca: normalizar(razao),
    natureza_juridica: /^\d{4}$/.test(c[2]) ? c[2] : null,
    capital_social: /^\d+(\.\d+)?$/.test(cap) ? cap : null,
    porte: /^\d{1,2}$/.test(c[5]) ? c[5].padStart(2, '0') : null,
  };
}

/** Linha no formato texto do COPY do PostgreSQL. */
export function linhaCopy(valores: (string | boolean | null | string[])[]): string {
  return valores
    .map((v) => {
      if (v === null || v === undefined) return '\\N';
      if (typeof v === 'boolean') return v ? 't' : 'f';
      if (Array.isArray(v)) return esc(`{${v.join(',')}}`);
      return esc(v);
    })
    .join('\t') + '\n';
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\t/g, ' ').replace(/\r?\n|\r/g, ' ');
}
