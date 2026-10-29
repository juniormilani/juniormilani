// Representação de uma empresa entregue à interface e à exportação.
import { NIVEL_POTENCIAL, PORTE, SITUACAO_CADASTRAL, STATUS_PROSPECCAO, type NivelPotencial, type StatusProspeccao } from './status';
import { dominioCorporativo, ehCelular, emailProvavelContador, formatarCep, formatarCnae, formatarCnpj, formatarTelefone } from './texto';

export interface ContatoExtra { tipo: 'telefone' | 'whatsapp' | 'email' | 'site'; valor: string; fonte: string; verificado: boolean }

export interface Empresa {
  cnpj: string;
  cnpjFormatado: string;
  matriz: boolean;
  razaoSocial: string;
  nomeFantasia: string;
  situacao: string;
  situacaoCodigo: string;
  dataInicio: string | null;
  cnae: string;
  cnaeDescricao: string;
  cnaesSecundarios: string[];
  segmento: string;
  segmentoPrioridade: string | null;
  tipoCorrespondencia: 'CNAE principal' | 'CNAE secundário' | 'Palavra-chave no nome' | '';
  cidade: string;
  uf: string;
  endereco: string;
  cep: string;
  telefones: { numero: string; formatado: string; celular: boolean; fonte: string }[];
  whatsapp: { numero: string; fonte: string; verificado: boolean }[];
  emails: { email: string; fonte: string; possivelContador: boolean }[];
  sites: { url: string; fonte: string; verificado: boolean }[];
  siteProvavel: string | null;
  porte: string;
  porteCodigo: string | null;
  capitalSocial: number | null;
  mei: boolean;
  rntrc: { numero: string | null; situacao: string; categoria: string | null } | null;
  pontos: number;
  nivel: NivelPotencial;
  nivelTexto: string;
  motivos: string[];
  icp: { perfil: string; score: number; faixa: 'A' | 'B' | 'C' | 'D'; detalhe: string[] } | null;
  prospeccaoStatus: StatusProspeccao | null;
  prospeccaoStatusTexto: string;
  ultimoContato: string | null;
  proximoContato: string | null;
  listas: { id: number; nome: string }[];
  outroEstabelecimentoProspectado: boolean;
  fonte: string;
  referencia: string;
  dataConsulta: string;
}

const FONTE_RF = 'Receita Federal (CNPJ)';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function linhaParaEmpresa(r: any, cnaesDesc: Map<string, string>, icpNome: string | null = null): Empresa {
  const extras: ContatoExtra[] = r.contatos_extra ?? [];
  const telefones = [r.telefone1, r.telefone2].filter(Boolean).map((t: string) => ({
    numero: t, formatado: formatarTelefone(t), celular: ehCelular(t), fonte: `${FONTE_RF} ${r.referencia}`,
  }));
  for (const c of extras.filter((c) => c.tipo === 'telefone')) {
    telefones.push({ numero: c.valor, formatado: formatarTelefone(c.valor), celular: ehCelular(c.valor), fonte: c.fonte });
  }
  const emails = r.email ? [{ email: r.email, fonte: `${FONTE_RF} ${r.referencia}`, possivelContador: emailProvavelContador(r.email) }] : [];
  for (const c of extras.filter((c) => c.tipo === 'email')) emails.push({ email: c.valor, fonte: c.fonte, possivelContador: false });
  const sites = extras.filter((c) => c.tipo === 'site').map((c) => ({ url: c.valor, fonte: c.fonte, verificado: c.verificado }));
  const dominio = dominioCorporativo(r.email);
  const tipo = { 1: 'CNAE principal', 2: 'CNAE secundário', 3: 'Palavra-chave no nome' } as const;
  const endereco = [
    [r.tipo_logradouro, r.logradouro].filter(Boolean).join(' '),
    r.numero, r.complemento, r.bairro,
  ].filter(Boolean).join(', ');
  return {
    cnpj: r.cnpj,
    cnpjFormatado: formatarCnpj(r.cnpj),
    matriz: r.matriz,
    razaoSocial: r.razao_social ?? '',
    nomeFantasia: r.nome_fantasia ?? '',
    situacao: SITUACAO_CADASTRAL[r.situacao] ?? r.situacao,
    situacaoCodigo: r.situacao,
    dataInicio: r.data_inicio ? new Date(r.data_inicio).toISOString().slice(0, 10) : null,
    cnae: formatarCnae(r.cnae_principal),
    cnaeDescricao: cnaesDesc.get(r.cnae_principal) ?? '',
    cnaesSecundarios: (r.cnaes_secundarios ?? []).map((c: string) => formatarCnae(c)),
    segmento: r.segmento ?? '',
    segmentoPrioridade: r.segmento_prioridade ?? null,
    tipoCorrespondencia: r.segmento ? tipo[r.match_tipo as 1 | 2 | 3] ?? '' : '',
    cidade: r.municipio_nome ?? '',
    uf: r.uf,
    endereco,
    cep: formatarCep(r.cep),
    telefones,
    whatsapp: extras.filter((c) => c.tipo === 'whatsapp').map((c) => ({ numero: c.valor, fonte: c.fonte, verificado: c.verificado })),
    emails,
    sites,
    siteProvavel: sites.length === 0 && dominio ? dominio : null,
    porte: PORTE[r.porte] ?? 'Não informado',
    porteCodigo: r.porte,
    capitalSocial: r.capital_social !== null && r.capital_social !== undefined ? Number(r.capital_social) : null,
    mei: !!r.opcao_mei,
    rntrc: r.rntrc_situacao ? { numero: r.numero_rntrc, situacao: r.rntrc_situacao, categoria: r.rntrc_categoria } : null,
    pontos: Number(r.pontos),
    nivel: r.nivel,
    nivelTexto: NIVEL_POTENCIAL[r.nivel as NivelPotencial],
    motivos: r.motivos ?? [],
    icp: icpNome && r.icp_score !== null && r.icp_score !== undefined
      ? { perfil: icpNome, score: Number(r.icp_score), faixa: r.icp_faixa, detalhe: r.icp_detalhe ?? [] }
      : null,
    prospeccaoStatus: r.prospeccao_status ?? null,
    prospeccaoStatusTexto: r.prospeccao_status ? STATUS_PROSPECCAO[r.prospeccao_status as StatusProspeccao] : '',
    ultimoContato: r.ultimo_contato ? new Date(r.ultimo_contato).toISOString().slice(0, 10) : null,
    proximoContato: r.proximo_contato ? new Date(r.proximo_contato).toISOString().slice(0, 10) : null,
    listas: r.listas ?? [],
    outroEstabelecimentoProspectado: !!r.outro_estab_prospectado,
    fonte: r.rntrc_situacao ? `${FONTE_RF} ${r.referencia}; ANTT/RNTRC` : `${FONTE_RF} ${r.referencia}`,
    referencia: r.referencia,
    dataConsulta: new Date(r.importado_em).toISOString().slice(0, 10),
  };
}
