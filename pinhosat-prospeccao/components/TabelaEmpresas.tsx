'use client';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import type { Empresa } from '@/lib/empresa';
import { formatarTelefone } from '@/lib/texto';
import { AcoesContato } from './AcoesContato';
import { Icone } from './Icone';
import { dataBr } from './util';

export type ColunaOrdem = 'icp' | 'potencial' | 'razao_social' | 'segmento' | 'cidade' | 'porte' | 'abertura';

interface Props {
  empresas: Empresa[];
  selecionados: Set<string>;
  onSelecionar: (cnpj: string, marcado: boolean) => void;
  onSelecionarTodos: (marcado: boolean) => void;
  ordem?: ColunaOrdem;
  onOrdenar?: (c: ColunaOrdem) => void;
  listaAtualId?: number;            // ao exibir uma lista, não sinaliza "duplicado" para ela mesma
  acaoLinha?: (e: Empresa) => React.ReactNode;
  onAbrir?: (cnpj: string) => void; // abre o painel de detalhe rápido (sem sair da página)
  aberta?: string | null;
}

export function PilulaPotencial({ e }: { e: Empresa }) {
  return (
    <span className={`pilula ${e.nivel}`} title={`Potencial de frota\n${e.motivos.join('\n')}`}>
      {e.nivelTexto} · {e.pontos}
    </span>
  );
}

export function PilulaIcp({ e }: { e: Empresa }) {
  if (!e.icp) return <span className="vazio">—</span>;
  return (
    <div title={`${e.icp.perfil}\n${e.icp.detalhe.join('\n')}`}>
      <span className="icp"><span className={`letra ${e.icp.faixa}`}>{e.icp.faixa}</span><span className="num">{e.icp.score}</span></span>
      <div className="barra-icp"><span style={{ width: `${e.icp.score}%` }} /></div>
    </div>
  );
}

export function Contatos({ e }: { e: Empresa }) {
  const nada = !e.telefones.length && !e.emails.length && !e.sites.length && !e.whatsapp.length;
  return (
    <div className="contatos">
      {e.telefones.map((t) => (
        <span key={t.numero} title={`Fonte: ${t.fonte}`}>
          <a href={`tel:+55${t.numero}`} onClick={(ev) => ev.stopPropagation()}><Icone nome="telefone" tamanho={13} />{t.formatado}</a>
          {t.celular && (
            <a href={`https://wa.me/55${t.numero}`} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()}
              className="pilula info" title="Número móvel: pode ter WhatsApp, mas não está confirmado">celular</a>
          )}
        </span>
      ))}
      {e.whatsapp.map((w) => (
        <a key={w.numero} href={`https://wa.me/55${w.numero}`} target="_blank" rel="noopener noreferrer" title={`Fonte: ${w.fonte}`} onClick={(ev) => ev.stopPropagation()}>
          <span className="pilula ok">WhatsApp</span> {formatarTelefone(w.numero)}
        </a>
      ))}
      {e.emails.map((m) => (
        <span key={m.email} title={`Fonte: ${m.fonte}`}>
          <a href={`mailto:${m.email}`} onClick={(ev) => ev.stopPropagation()} className="trunca"><Icone nome="email" tamanho={13} />{m.email}</a>
          {m.possivelContador && <span className="pilula aviso" title="Parece e-mail de contabilidade/assessoria">contador?</span>}
        </span>
      ))}
      {e.sites.map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" title={`Fonte: ${s.fonte}`} onClick={(ev) => ev.stopPropagation()}>
          <Icone nome="site" tamanho={13} />{s.url.replace(/^https?:\/\//, '')}
        </a>
      ))}
      {e.siteProvavel && (
        <span className="mudo" title="Domínio do e-mail corporativo — site não verificado"><Icone nome="site" tamanho={13} />{e.siteProvavel}?</span>
      )}
      {nada && <span className="vazio">Não encontrado</span>}
    </div>
  );
}

function Marcadores({ e, listaAtualId }: { e: Empresa; listaAtualId?: number }) {
  const outras = e.listas.filter((l) => l.id !== listaAtualId);
  return (
    <>
      {e.prospeccaoStatus && <span className="pilula">{e.prospeccaoStatusTexto}</span>}
      {outras.length > 0 && <span className="pilula aviso" title={outras.map((l) => l.nome).join('\n')}>em {outras.length} lista{outras.length > 1 ? 's' : ''}</span>}
      {e.outroEstabelecimentoProspectado && <span className="pilula aviso" title="Outro CNPJ da mesma empresa (matriz/filial) já está na base">grupo já na base</span>}
      {e.proximoContato && <span className="mudo">retorno {dataBr(e.proximoContato)}</span>}
    </>
  );
}

/** Lista em cartões (celular). */
function Cartoes({ empresas, selecionados, onSelecionar, onAbrir, listaAtualId, acaoLinha }: Props) {
  return (
    <div className="cartoes-empresa">
      {empresas.map((e) => {
        const sel = selecionados.has(e.cnpj);
        return (
          <article key={e.cnpj} className={`cartao-empresa ${sel ? 'sel' : ''}`}>
            <div className="topo-cartao">
              <input type="checkbox" aria-label={`Selecionar ${e.razaoSocial}`} checked={sel} onChange={(ev) => onSelecionar(e.cnpj, ev.target.checked)} style={{ marginTop: 3 }} />
              <div style={{ flex: 1, minWidth: 0 }} onClick={() => onAbrir?.(e.cnpj)} role={onAbrir ? 'button' : undefined}>
                {onAbrir ? <div className="nome">{e.razaoSocial}</div> : <Link href={`/empresa/${e.cnpj}`} className="nome">{e.razaoSocial}</Link>}
                <div className="mudo">{e.nomeFantasia && `${e.nomeFantasia} · `}{e.cidade}/{e.uf} · {e.matriz ? 'Matriz' : 'Filial'}</div>
              </div>
              <PilulaIcp e={e} />
            </div>
            <div className="linha-info">
              {e.segmento && <span>{e.segmento}</span>}
              <PilulaPotencial e={e} />
              {e.rntrc?.situacao === 'ATIVO' && <span className="pilula ok">RNTRC ativo</span>}
              <span className="pilula">{e.porte}</span>
            </div>
            <div className="linha-info"><Marcadores e={e} listaAtualId={listaAtualId} /></div>
            <AcoesContato e={e} />
            {(onAbrir || acaoLinha) && (
              <div className="linha" style={{ justifyContent: 'space-between' }}>
                {onAbrir && <button className="btn pequeno" onClick={() => onAbrir(e.cnpj)}>Detalhes e registrar contato</button>}
                {acaoLinha?.(e)}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function TabelaEmpresas(props: Props) {
  const { empresas, selecionados, onSelecionar, onSelecionarTodos, ordem, onOrdenar, listaAtualId, acaoLinha, onAbrir, aberta } = props;
  const [expandida, setExpandida] = useState<string | null>(null);
  const todos = empresas.length > 0 && empresas.every((e) => selecionados.has(e.cnpj));
  const th = (c: ColunaOrdem, rotulo: string) => (
    <th className={onOrdenar ? 'ordenavel' : ''} onClick={() => onOrdenar?.(c)} aria-sort={ordem === c ? 'descending' : undefined}>
      {rotulo}{ordem === c ? ' ▾' : ''}
    </th>
  );
  const colunas = acaoLinha ? 7 : 6;
  return (
    <>
      <div className="tabela-wrap tabela-resultados">
        <table className="tab">
          <thead>
            <tr>
              <th style={{ width: 32 }}><input type="checkbox" aria-label="Selecionar todas" checked={todos} onChange={(ev) => onSelecionarTodos(ev.target.checked)} /></th>
              {th('icp', 'ICP')}
              {th('razao_social', 'Empresa')}
              {th('segmento', 'Segmento')}
              <th>Contatos</th>
              <th>Prospecção</th>
              {acaoLinha && <th style={{ width: 40 }}></th>}
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => {
              const sel = selecionados.has(e.cnpj);
              const abrir = () => (onAbrir ? onAbrir(e.cnpj) : setExpandida(expandida === e.cnpj ? null : e.cnpj));
              return (
                <Fragment key={e.cnpj}>
                  <tr className={`clicavel ${sel ? 'sel' : ''} ${aberta === e.cnpj ? 'aberta' : ''}`} onClick={abrir}>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <input type="checkbox" aria-label={`Selecionar ${e.razaoSocial}`} checked={sel} onChange={(ev) => onSelecionar(e.cnpj, ev.target.checked)} />
                    </td>
                    <td><PilulaIcp e={e} /></td>
                    <td style={{ minWidth: 210 }}>
                      {onAbrir
                        ? <button className="nome" style={{ all: 'unset', cursor: 'pointer', fontWeight: 600 }}>{e.razaoSocial || '(sem razão social)'}</button>
                        : <Link href={`/empresa/${e.cnpj}`} className="nome" onClick={(ev) => ev.stopPropagation()}>{e.razaoSocial || '(sem razão social)'}</Link>}
                      {e.nomeFantasia && <div>{e.nomeFantasia}</div>}
                      <div className="mudo"><strong style={{ color: 'var(--text)', fontWeight: 600 }}>{e.cidade}/{e.uf}</strong> · <span className="mono">{e.cnpjFormatado}</span> · {e.matriz ? 'Matriz' : 'Filial'} · {e.porte}
                        {e.situacaoCodigo !== '02' && <> · <span className="pilula aviso">{e.situacao}</span></>}
                      </div>
                      <div className="linha" style={{ gap: 4, marginTop: 4 }}>
                        {e.mei && <span className="pilula aviso">MEI</span>}
                        <PilulaPotencial e={e} />
                        {e.rntrc && <span className={`pilula ${e.rntrc.situacao === 'ATIVO' ? 'ok' : 'aviso'}`} title="Registro Nacional de Transportadores Rodoviários de Cargas (ANTT)">
                          RNTRC {e.rntrc.situacao.toLowerCase()}</span>}
                      </div>
                    </td>
                    <td style={{ minWidth: 130, maxWidth: 190 }}>
                      {e.segmento ? <div>{e.segmento}</div> : <span className="vazio">Sem segmento</span>}
                      {e.tipoCorrespondencia && <div className="mudo">por {e.tipoCorrespondencia.toLowerCase()}</div>}
                      <div className="mudo" title={e.cnaeDescricao}>CNAE <span className="mono">{e.cnae}</span></div>
                    </td>
                    <td><Contatos e={e} /></td>
                    <td style={{ minWidth: 104 }}>
                      <div style={{ display: 'grid', gap: 3, justifyItems: 'start' }}>
                        <Marcadores e={e} listaAtualId={listaAtualId} />
                        {!e.prospeccaoStatus && !e.listas.some((l) => l.id !== listaAtualId) && <span className="mudo">Nova</span>}
                      </div>
                    </td>
                    {acaoLinha && <td onClick={(ev) => ev.stopPropagation()}>{acaoLinha(e)}</td>}
                  </tr>
                  {!onAbrir && expandida === e.cnpj && (
                    <tr className="detalhe">
                      <td></td>
                      <td colSpan={colunas - 1}>
                        <div className="dois">
                          <div>
                            {e.icp && (<>
                              <strong>Score ICP {e.icp.score} ({e.icp.faixa}) — {e.icp.perfil}</strong>
                              <ul className="motivos">{e.icp.detalhe.map((m) => <li key={m}>{m}</li>)}</ul>
                            </>)}
                            <strong>Potencial de frota</strong>
                            <ul className="motivos">{e.motivos.map((m) => <li key={m}>{m}</li>)}</ul>
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
      <Cartoes {...props} />
    </>
  );
}
