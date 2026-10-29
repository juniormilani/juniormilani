'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Empresa } from '@/lib/empresa';
import { STATUS_PROSPECCAO } from '@/lib/status';
import { AcoesContato } from './AcoesContato';
import { Contatos, PilulaIcp, PilulaPotencial } from './TabelaEmpresas';
import { Icone } from './Icone';
import { api, dataBr } from './util';

interface Detalhe {
  empresa: Empresa;
  prospeccao: { status: string; observacoes: string | null; proximo_contato: string | null; ultimo_contato: string | null; responsavel: string | null } | null;
  historico: { status: string; nota: string | null; usuario: string; criado_em: string }[];
}

const iso = (v: string | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : '');

/** Painel lateral com o resumo da empresa e registro rápido de contato, sem sair da lista. */
export function EmpresaGaveta({ cnpj, icpId, onFechar, onAtualizado }: {
  cnpj: string; icpId?: number; onFechar: () => void; onAtualizado: (msg: string) => void;
}) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState({ status: 'novo', proximoContato: '', ultimoContato: '', responsavel: '', nota: '', observacoes: '' });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setD(null);
    api<Detalhe>(`/api/empresas/${cnpj}${icpId ? `?icp=${icpId}` : ''}`).then((x) => {
      setD(x);
      setForm({
        status: x.prospeccao?.status ?? 'novo', proximoContato: iso(x.prospeccao?.proximo_contato),
        ultimoContato: iso(x.prospeccao?.ultimo_contato), responsavel: x.prospeccao?.responsavel ?? '',
        nota: '', observacoes: x.prospeccao?.observacoes ?? '',
      });
    }).catch((e) => setErro(e.message));
  }, [cnpj, icpId]);

  useEffect(() => {
    const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && onFechar();
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [onFechar]);

  const salvar = async () => {
    setSalvando(true);
    try {
      await api(`/api/prospeccao/${cnpj}`, {
        method: 'PUT',
        // Registrar uma nota conta como contato feito hoje; os demais campos são preservados.
        body: { ...form, ultimoContato: form.nota ? new Date().toISOString().slice(0, 10) : form.ultimoContato || null },
      });
      onAtualizado('Prospecção atualizada.');
      onFechar();
    } catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
  };

  const e = d?.empresa;
  return (
    <>
      <div className="fundo" onClick={onFechar} />
      <aside className="gaveta" role="dialog" aria-modal="true" aria-label="Detalhes da empresa">
        <div className="cab">
          <div style={{ flex: 1, minWidth: 0 }}>
            {e ? (<>
              <h2>{e.razaoSocial}</h2>
              <div className="mudo">{e.nomeFantasia && `${e.nomeFantasia} · `}<span className="mono">{e.cnpjFormatado}</span> · {e.matriz ? 'Matriz' : 'Filial'} · {e.cidade}/{e.uf}</div>
            </>) : <h2>Carregando…</h2>}
          </div>
          <button className="btn icone fantasma" onClick={onFechar} aria-label="Fechar"><Icone nome="fechar" /></button>
        </div>
        <div className="corpo">
          {erro && <div className="erro-box">{erro}</div>}
          {!e ? <div className="esqueleto"><div /><div /><div /></div> : (<>
            <section className="linha" style={{ gap: 12 }}>
              <PilulaIcp e={e} />
              <PilulaPotencial e={e} />
              {e.rntrc && <span className={`pilula ${e.rntrc.situacao === 'ATIVO' ? 'ok' : 'aviso'}`}>RNTRC {e.rntrc.situacao.toLowerCase()}</span>}
              {e.prospeccaoStatus && <span className="pilula">{e.prospeccaoStatusTexto}</span>}
            </section>
            <section>
              <h3>Contato</h3>
              <AcoesContato e={e} />
              <div style={{ marginTop: 8 }}><Contatos e={e} /></div>
            </section>
            <section>
              <h3>Empresa</h3>
              <dl className="campos">
                <dt>Atividade</dt><dd><span className="mono">{e.cnae}</span> {e.cnaeDescricao}</dd>
                <dt>Segmento</dt><dd>{e.segmento || '—'} {e.tipoCorrespondencia && <span className="mudo">(por {e.tipoCorrespondencia.toLowerCase()})</span>}</dd>
                <dt>Porte / capital</dt><dd>{e.porte}{e.capitalSocial !== null && ` · ${e.capitalSocial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}`}</dd>
                <dt>Abertura</dt><dd>{dataBr(e.dataInicio) || '—'}</dd>
                <dt>Endereço</dt><dd>{e.endereco || 'Não encontrado'}{e.cep && ` — ${e.cep}`}</dd>
              </dl>
            </section>
            {e.icp && (
              <section>
                <h3>Score ICP {e.icp.score} · faixa {e.icp.faixa}</h3>
                <ul className="motivos">{e.icp.detalhe.map((m) => <li key={m}>{m}</li>)}</ul>
              </section>
            )}
            <details>
              <summary className="mudo" style={{ cursor: 'pointer', marginBottom: 8 }}>Por que o potencial de frota é “{e.nivelTexto.toLowerCase()}”?</summary>
              <ul className="motivos">{e.motivos.map((m) => <li key={m}>{m}</li>)}</ul>
            </details>
            <section>
              <h3>Registrar contato</h3>
              <div className="dois">
                <div>
                  <label htmlFor="g-st" style={{ marginTop: 0 }}>Status</label>
                  <select id="g-st" value={form.status} onChange={(ev) => setForm({ ...form, status: ev.target.value })}>
                    {Object.entries(STATUS_PROSPECCAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="g-pc" style={{ marginTop: 0 }}>Próximo retorno</label>
                  <input id="g-pc" type="date" value={form.proximoContato} onChange={(ev) => setForm({ ...form, proximoContato: ev.target.value })} />
                </div>
              </div>
              <label htmlFor="g-nota">O que aconteceu (vai para o histórico)</label>
              <input id="g-nota" type="text" value={form.nota} placeholder="Ex.: falei com o responsável pela frota" onChange={(ev) => setForm({ ...form, nota: ev.target.value })} />
              {d!.historico.length > 0 && (
                <ul className="motivos mudo" style={{ marginTop: 10 }}>
                  {d!.historico.slice(0, 4).map((h, i) => <li key={i}>{dataBr(h.criado_em)} — {STATUS_PROSPECCAO[h.status as keyof typeof STATUS_PROSPECCAO] ?? h.status}{h.nota && `: ${h.nota}`}</li>)}
                </ul>
              )}
            </section>
          </>)}
        </div>
        <div className="rodape">
          <Link className="btn" href={`/empresa/${cnpj}`}><Icone nome="externo" tamanho={16} />Ficha completa</Link>
          <button className="btn primario cresce" style={{ flex: 1 }} onClick={salvar} disabled={!e || salvando}>{salvando ? 'Salvando…' : 'Salvar contato'}</button>
        </div>
      </aside>
    </>
  );
}
