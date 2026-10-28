// Campos exportáveis (compartilhado entre a interface e a geração de arquivos).
import type { Empresa } from './empresa';
import { formatarTelefone } from './texto';

export interface CampoExportacao {
  chave: string;
  rotulo: string;
  largura: number;
  valor: (e: Empresa) => string | number | null;
}

const juntar = (xs: string[]) => xs.filter(Boolean).join(' | ');
const NAO = 'Não encontrado';

export const CAMPOS: CampoExportacao[] = [
  { chave: 'razao_social', rotulo: 'Razão social', largura: 40, valor: (e) => e.razaoSocial },
  { chave: 'nome_fantasia', rotulo: 'Nome fantasia', largura: 28, valor: (e) => e.nomeFantasia },
  { chave: 'cnpj', rotulo: 'CNPJ', largura: 20, valor: (e) => e.cnpjFormatado },
  { chave: 'matriz', rotulo: 'Matriz/Filial', largura: 12, valor: (e) => (e.matriz ? 'Matriz' : 'Filial') },
  { chave: 'situacao', rotulo: 'Situação cadastral', largura: 14, valor: (e) => e.situacao },
  { chave: 'cnae', rotulo: 'CNAE principal', largura: 12, valor: (e) => e.cnae },
  { chave: 'cnae_descricao', rotulo: 'Atividade principal', largura: 45, valor: (e) => e.cnaeDescricao },
  { chave: 'segmento', rotulo: 'Segmento', largura: 30, valor: (e) => e.segmento },
  { chave: 'cidade', rotulo: 'Cidade', largura: 22, valor: (e) => e.cidade },
  { chave: 'uf', rotulo: 'UF', largura: 5, valor: (e) => e.uf },
  { chave: 'endereco', rotulo: 'Endereço', largura: 45, valor: (e) => e.endereco },
  { chave: 'cep', rotulo: 'CEP', largura: 10, valor: (e) => e.cep },
  { chave: 'telefone', rotulo: 'Telefone', largura: 30, valor: (e) => juntar(e.telefones.map((t) => t.formatado)) || NAO },
  { chave: 'celular', rotulo: 'Celular (possível WhatsApp, não confirmado)', largura: 22,
    valor: (e) => juntar(e.telefones.filter((t) => t.celular).map((t) => t.formatado)) },
  { chave: 'whatsapp', rotulo: 'WhatsApp confirmado', largura: 20, valor: (e) => juntar(e.whatsapp.map((w) => formatarTelefone(w.numero))) || NAO },
  { chave: 'email', rotulo: 'E-mail', largura: 32, valor: (e) => juntar(e.emails.map((m) => m.email)) || NAO },
  { chave: 'site', rotulo: 'Site', largura: 28, valor: (e) => juntar(e.sites.map((s) => s.url)) || NAO },
  { chave: 'site_provavel', rotulo: 'Site provável (domínio do e-mail, não verificado)', largura: 28, valor: (e) => e.siteProvavel ?? '' },
  { chave: 'porte', rotulo: 'Porte', largura: 14, valor: (e) => e.porte },
  { chave: 'capital_social', rotulo: 'Capital social (R$)', largura: 16, valor: (e) => e.capitalSocial },
  { chave: 'data_inicio', rotulo: 'Data de abertura', largura: 12, valor: (e) => e.dataInicio },
  { chave: 'rntrc', rotulo: 'RNTRC (ANTT)', largura: 20, valor: (e) => (e.rntrc ? `${e.rntrc.numero ?? ''} ${e.rntrc.situacao}`.trim() : '') },
  { chave: 'potencial', rotulo: 'Potencial', largura: 16, valor: (e) => e.nivelTexto },
  { chave: 'pontos', rotulo: 'Pontuação', largura: 10, valor: (e) => e.pontos },
  { chave: 'motivos', rotulo: 'Motivos da classificação', largura: 60, valor: (e) => juntar(e.motivos) },
  { chave: 'status', rotulo: 'Status de prospecção', largura: 22, valor: (e) => e.prospeccaoStatusTexto },
  { chave: 'ultimo_contato', rotulo: 'Último contato', largura: 12, valor: (e) => e.ultimoContato },
  { chave: 'proximo_contato', rotulo: 'Próximo acompanhamento', largura: 12, valor: (e) => e.proximoContato },
  { chave: 'listas', rotulo: 'Listas', largura: 30, valor: (e) => juntar(e.listas.map((l) => l.nome)) },
  { chave: 'fonte', rotulo: 'Fonte dos dados', largura: 30, valor: (e) => e.fonte },
  { chave: 'data_consulta', rotulo: 'Data de consulta', largura: 12, valor: (e) => e.dataConsulta },
];

export const CAMPOS_PADRAO = [
  'razao_social', 'nome_fantasia', 'cnpj', 'situacao', 'cnae', 'segmento', 'cidade', 'uf', 'endereco',
  'telefone', 'whatsapp', 'email', 'site', 'porte', 'potencial', 'fonte', 'data_consulta',
];

export function camposSelecionados(chaves: unknown): CampoExportacao[] {
  const pedidas = Array.isArray(chaves) && chaves.length ? chaves : CAMPOS_PADRAO;
  return CAMPOS.filter((c) => pedidas.includes(c.chave));
}
