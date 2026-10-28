export const STATUS_PROSPECCAO = {
  novo: 'Novo lead',
  nao_contatado: 'Ainda não contatado',
  primeiro_contato: 'Primeiro contato realizado',
  aguardando: 'Aguardando resposta',
  negociacao: 'Em negociação',
  futuro: 'Interessado futuramente',
  sem_interesse: 'Sem interesse',
  cliente: 'Cliente',
  nao_prospectar: 'Não prospectar',
} as const;

export type StatusProspeccao = keyof typeof STATUS_PROSPECCAO;

export function statusValido(s: unknown): s is StatusProspeccao {
  return typeof s === 'string' && s in STATUS_PROSPECCAO;
}

export const SITUACAO_CADASTRAL: Record<string, string> = {
  '01': 'Nula',
  '02': 'Ativa',
  '03': 'Suspensa',
  '04': 'Inapta',
  '08': 'Baixada',
};

export const PORTE: Record<string, string> = {
  '00': 'Não informado',
  '01': 'ME',
  '03': 'EPP',
  '05': 'Demais',
};

export const NIVEL_POTENCIAL = {
  alto: 'Alto potencial',
  medio: 'Potencial médio',
  verificar: 'A verificar',
} as const;
export type NivelPotencial = keyof typeof NIVEL_POTENCIAL;
