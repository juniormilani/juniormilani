// Validação de segmentos e regiões editados pela interface.
import { ErroValidacao, texto } from './api';
import { query } from './db';
import { normalizar } from './texto';

export async function validarSegmento(b: Record<string, unknown>) {
  const nome = texto(b.nome, 'nome', 120)!;
  const grupo = texto(b.grupo, 'grupo', 80)!;
  const prioridade = String(b.prioridade);
  if (!['alta', 'media', 'baixa'].includes(prioridade)) throw new ErroValidacao('Prioridade inválida.');
  const lista = (v: unknown) =>
    (Array.isArray(v) ? v : String(v ?? '').split(/[,\n;]/)).map((x) => String(x).trim()).filter(Boolean);
  const cnaes = [...new Set(lista(b.cnaes).map((c) => c.replace(/\D/g, '')))];
  const invalidos = cnaes.filter((c) => c.length !== 7);
  if (invalidos.length) throw new ErroValidacao(`CNAE deve ter 7 dígitos: ${invalidos.join(', ')}`);
  if (cnaes.length) {
    const existentes = new Set((await query<{ codigo: string }>('select codigo from cnaes where codigo = any($1::char(7)[])', [cnaes])).map((r) => r.codigo));
    const desconhecidos = cnaes.filter((c) => !existentes.has(c));
    if (desconhecidos.length) throw new ErroValidacao(`CNAE não encontrado na tabela oficial: ${desconhecidos.join(', ')}`);
  }
  const palavras_chave = [...new Set(lista(b.palavras_chave).map(normalizar))].filter((p) => p.replace('*', '').length >= 3);
  if (!cnaes.length && !palavras_chave.length) throw new ErroValidacao('Informe ao menos um CNAE ou uma palavra-chave.');
  return {
    nome, grupo, prioridade, cnaes, palavras_chave,
    descricao: texto(b.descricao, 'descrição', 1000, false),
    ativo: b.ativo !== false,
  };
}

export async function validarRegiao(b: Record<string, unknown>) {
  const nome = texto(b.nome, 'nome', 120)!;
  const uf = String(b.uf ?? '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) throw new ErroValidacao('UF inválida.');
  const municipios = Array.isArray(b.municipios) ? [...new Set(b.municipios.map((m) => String(m).replace(/\D/g, '').padStart(4, '0')))] : [];
  if (!municipios.length) throw new ErroValidacao('Selecione ao menos um município.');
  return { nome, uf, municipios };
}
