import type { NivelPotencial } from './status';

export type ModoSegmento = 'principal' | 'amplo';
export type FiltroProspeccao = 'todas' | 'fora_da_base' | 'nao_contatadas' | 'na_base';
export type Ordenacao = 'potencial' | 'cidade' | 'segmento' | 'porte' | 'razao_social' | 'abertura' | 'capital';

export interface FiltrosBusca {
  texto?: string;                 // nome, CNPJ ou atividade (descrição do CNAE)
  segmentos?: number[];
  modoSegmento?: ModoSegmento;    // principal = só CNAE principal; amplo = + secundários + palavras-chave
  cnaes?: string[];               // CNAEs avulsos (7 dígitos), além dos segmentos
  ufs?: string[];
  municipios?: string[];          // códigos de município da RF
  regioes?: number[];
  cep?: string;                   // prefixo de CEP (ex.: 930 ou 93200)
  situacoes?: string[];           // padrão: só ativas (02)
  portes?: string[];              // 01 ME, 03 EPP, 05 demais, 00 não informado
  matrizFilial?: 'todas' | 'matriz' | 'filial';
  idadeMinAnos?: number;
  idadeMaxAnos?: number;
  capitalMin?: number;
  excluirMei?: boolean;           // padrão: true
  comTelefone?: boolean;
  comCelular?: boolean;
  comEmail?: boolean;
  comEmailCorporativo?: boolean;
  comSite?: boolean;
  somenteRntrcAtivo?: boolean;
  prospeccao?: FiltroProspeccao;
  excluirNaoProspectar?: boolean; // padrão: true (respeita pedidos de não contato)
  potencial?: NivelPotencial[];
  ordenarPor?: Ordenacao;
  limite?: number;
  pagina?: number;
  cnpjs?: string[];               // uso interno: carregar empresas específicas (listas, exportação)
}

export const LIMITE_MAXIMO = 5000;

const arr = <T>(v: unknown, f: (x: unknown) => T | null): T[] | undefined =>
  Array.isArray(v) ? v.map(f).filter((x): x is T => x !== null) : undefined;
const str = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : null);
const int = (x: unknown) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const num = (x: unknown) => {
  if (x === '' || x === null || x === undefined) return undefined;
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
};
const bool = (x: unknown) => (typeof x === 'boolean' ? x : undefined);
const oneOf = <T extends string>(x: unknown, opts: readonly T[]): T | undefined =>
  opts.includes(x as T) ? (x as T) : undefined;

/** Valida e normaliza filtros vindos do cliente (nunca confie no corpo da requisição). */
export function sanitizarFiltros(raw: unknown): FiltrosBusca {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const digitos = (x: unknown, n: number) => {
    const s = str(x)?.replace(/\D/g, '');
    return s && s.length === n ? s : null;
  };
  return {
    texto: str(r.texto)?.slice(0, 120),
    segmentos: arr(r.segmentos, int),
    modoSegmento: oneOf(r.modoSegmento, ['principal', 'amplo'] as const),
    cnaes: arr(r.cnaes, (x) => digitos(x, 7)),
    ufs: arr(r.ufs, (x) => (str(x)?.length === 2 ? str(x)!.toUpperCase() : null)),
    municipios: arr(r.municipios, (x) => digitos(x, 4)),
    regioes: arr(r.regioes, int),
    cep: str(r.cep)?.replace(/\D/g, '').slice(0, 8) || undefined,
    situacoes: arr(r.situacoes, (x) => oneOf(x, ['01', '02', '03', '04', '08'] as const) ?? null),
    portes: arr(r.portes, (x) => oneOf(x, ['00', '01', '03', '05'] as const) ?? null),
    matrizFilial: oneOf(r.matrizFilial, ['todas', 'matriz', 'filial'] as const),
    idadeMinAnos: num(r.idadeMinAnos),
    idadeMaxAnos: num(r.idadeMaxAnos),
    capitalMin: num(r.capitalMin),
    excluirMei: bool(r.excluirMei),
    comTelefone: bool(r.comTelefone),
    comCelular: bool(r.comCelular),
    comEmail: bool(r.comEmail),
    comEmailCorporativo: bool(r.comEmailCorporativo),
    comSite: bool(r.comSite),
    somenteRntrcAtivo: bool(r.somenteRntrcAtivo),
    prospeccao: oneOf(r.prospeccao, ['todas', 'fora_da_base', 'nao_contatadas', 'na_base'] as const),
    excluirNaoProspectar: bool(r.excluirNaoProspectar),
    potencial: arr(r.potencial, (x) => oneOf(x, ['alto', 'medio', 'verificar'] as const) ?? null),
    ordenarPor: oneOf(r.ordenarPor, ['potencial', 'cidade', 'segmento', 'porte', 'razao_social', 'abertura', 'capital'] as const),
    limite: num(r.limite),
    pagina: num(r.pagina),
  };
}
