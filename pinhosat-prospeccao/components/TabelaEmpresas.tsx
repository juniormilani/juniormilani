'use client';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import type { Empresa } from '@/lib/empresa';
import { formatarTelefone } from '@/lib/texto';
import { dataBr } from './util';

export type ColunaOrdem = 'potencial' | 'razao_social' | 'segmento' | 'cidade' | 'porte' | 'abertura';

interface Props {
  empresas: Empresa[];
  selecionados: Set<string>;
  onSelecionar: (cnpj: string, marcado: boolean) => void;
  onSelecionarTodos: (marcado: boolean) => void;
  ordem?: ColunaOrdem;
  onOrdenar?: (c: ColunaOrdem) => void;
  listaAtualId?: number;          // ao exibir uma lista, não sinaliza "duplicado" para ela mesma
  acaoLinha?: (e: Empresa) => React.ReactNode;
}

export function PilulaPotencial({ e }: { e: Empresa }) {
  return (
    <span className={`pilula ${e.nivel}`} title={e.motivos.join('\n')}>
      {e.nivelTexto} · {e.pontos}
    </span>
  );
}

export function Contatos({ e }: { e: Empresa }) {
  const nada = !e.telefones.length && !e.emails.length && !e.sites.length && !e.whatsapp.length;
  return (
    <div className="contatos">
      {e.telefones.map((t) => (
        <span key={t.numero} title={`Fonte: ${t.fonte}`}>
          <a href={`tel:+55${t.numero}`}>☎ {t.formatado}</a>
          {t.celular && (
            <> {' '}<a href={`https://wa.me/55${t.numero}`} target="_blank" rel="noopener noreferrer"
              className="pilula info" title="Número móvel: pode ter WhatsApp, mas não está confirmado">celular</a></>
          )}
        </span>
      ))}
      {e.whatsapp.map((w) => (
        <a key={w.numero} href={`https://wa.me/55${w.numero}`} target="_blank" rel="noopener noreferrer" title={`Fonte: ${w.fonte}`}>
          <span className="pilula ok">WhatsApp</span> {formatarTelefone(w.numero)}
        </a>
      ))}
      {e.emails.map((m) => (
        <span key={m.email} title={`Fonte: ${m.fonte}`}>
          <a href={`mailto:${m.email}`}>✉ {m.email}</a>
          {m.possivelContador && <span className="pilula aviso" title="Parece e-mail de contabilidade/assessoria">contador?</span>}
        </span>
      ))}
      {e.sites.map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" title={`Fonte: ${s.fonte}`}>🌐 {s.url.replace(/^https?:\/\//, '')}</a>
      ))}
      {e.siteProvavel && (
        <span className="mudo" title="Domínio do e-mail corporativo — site não verificado">🌐 {e.siteProvavel}?</span>
      )}
      {nada && <span className="vazio">Não encontrado</span>}
    </div>
  );
}

export function TabelaEmpresas({ empresas, selecionados, onSelecionar, onSelecionarTodos, ordem, onOrdenar, listaAtualId, acaoLinha }: Props) {
  const [aberta, setAberta] = useState<string | null>(null);
  const todos = empresas.length > 0 && empresas.every((e) => selecionados.has(e.cnpj));
  const th = (c: ColunaOrdem, rotulo: string) => (
    <th className={onOrdenar ? 'ordenavel' : ''} onClick={() => onOrdenar?.(c)} aria-sort={ordem === c ? 'descending' : undefined}>
      {rotulo}{ordem === c ? ' ▾' : ''}
    </th>
  );
  return (
    <div className="tabela-wrap">
      <table className="tab">
        <thead>
          <tr>
            <th><input type="checkbox" aria-label="Selecionar todas" checked={todos} onChange={(ev) => onSelecionarTodos(ev.target.checked)} /></th>
            {th('potencial', 'Potencial')}
            {th('razao_social', 'Empresa')}
            {th('segmento', 'Segmento / CNAE')}
            {th('cidade', 'Cidade/UF')}
            <th>Contatos</th>
            {th('porte', 'Porte')}
            <th>Prospecção</th>
            {acaoLinha && <th></th>}
          </tr>
        </thead>
        <tbody>
          {empresas.map((e) => {
            const outrasListas = e.listas.filter((l) => l.id !== listaAtualId);
            const sel = selecionados.has(e.cnpj);
            return (
              <Fragment key={e.cnpj}>
                <tr className={sel ? 'sel' : ''}>
                  <td><input type="checkbox" aria-label={`Selecionar ${e.razaoSocial}`} checked={sel} onChange={(ev) => onSelecionar(e.cnpj, ev.target.checked)} /></td>
                  <td>
                    <PilulaPotencial e={e} />
                    <div><button className="btn pequeno" style={{ marginTop: 4 }} onClick={() => setAberta(aberta === e.cnpj ? null : e.cnpj)}>
                      {aberta === e.cnpj ? 'ocultar' : 'por quê?'}
                    </button></div>
                  </td>
                  <td style={{ minWidth: 220 }}>
                    <Link href={`/empresa/${e.cnpj}`} className="nome">{e.razaoSocial || '(sem razão social)'}</Link>
                    {e.nomeFantasia && <div>{e.nomeFantasia}</div>}
                    <div className="mudo mono">{e.cnpjFormatado} · {e.matriz ? 'Matriz' : 'Filial'}
                      {e.situacaoCodigo !== '02' && <> · <span className="pilula aviso">{e.situacao}</span></>}
                    </div>
                    {e.rntrc && <span className={`pilula ${e.rntrc.situacao === 'ATIVO' ? 'ok' : 'aviso'}`} title="Registro Nacional de Transportadores Rodoviários de Cargas (ANTT)">
                      RNTRC {e.rntrc.situacao.toLowerCase()}</span>}
                  </td>
                  <td style={{ minWidth: 170, maxWidth: 220 }}>
                    {e.segmento ? <div>{e.segmento}</div> : <span className="vazio">Sem segmento</span>}
                    {e.tipoCorrespondencia && <div className="mudo">por {e.tipoCorrespondencia.toLowerCase()}</div>}
                    <div className="mudo" title={e.cnaeDescricao}><span className="mono">{e.cnae}</span> {e.cnaeDescricao.slice(0, 42)}{e.cnaeDescricao.length > 42 ? '…' : ''}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{e.cidade}/{e.uf}</td>
                  <td><Contatos e={e} /></td>
                  <td>{e.porte}{e.mei && <div><span className="pilula aviso">MEI</span></div>}</td>
                  <td style={{ minWidth: 130 }}>
                    {e.prospeccaoStatus && <div><span className="pilula">{e.prospeccaoStatusTexto}</span></div>}
                    {outrasListas.length > 0 && (
                      <div title={outrasListas.map((l) => l.nome).join('\n')}>
                        <span className="pilula aviso">em {outrasListas.length} lista{outrasListas.length > 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {e.outroEstabelecimentoProspectado && <div><span className="pilula aviso" title="Outro CNPJ da mesma empresa (matriz/filial) já está na base">grupo já na base</span></div>}
                    {e.proximoContato && <div className="mudo">retorno {dataBr(e.proximoContato)}</div>}
                    {!e.prospeccaoStatus && !outrasListas.length && <span className="mudo">Nunca prospectada</span>}
                  </td>
                  {acaoLinha && <td>{acaoLinha(e)}</td>}
                </tr>
                {aberta === e.cnpj && (
                  <tr className="detalhe">
                    <td></td>
                    <td colSpan={acaoLinha ? 8 : 7}>
                      <div className="dois">
                        <div>
                          <strong>Como a pontuação foi calculada</strong>
                          <ul className="motivos">{e.motivos.map((m) => <li key={m}>{m}</li>)}</ul>
                          {e.nivel !== 'alto' && e.pontos >= 60 && (
                            <div className="mudo">Pontuação alta, mas sem evidência de frota (RNTRC ativo ou CNAE principal de segmento prioritário com porte/capital relevante).</div>
                          )}
                        </div>
                        <div>
                          <div><strong>Endereço:</strong> {e.endereco || 'Não encontrado'} {e.cep && `— CEP ${e.cep}`}</div>
                          <div><strong>Abertura:</strong> {dataBr(e.dataInicio) || '—'} · <strong>Capital:</strong> {e.capitalSocial !== null ? e.capitalSocial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</div>
                          {e.cnaesSecundarios.length > 0 && <div className="mudo">CNAEs secundários: {e.cnaesSecundarios.join(', ')}</div>}
                          <div className="mudo">Fonte: {e.fonte} · atualizado em {dataBr(e.dataConsulta)}</div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
