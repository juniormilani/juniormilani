'use client';
import { useEffect, useState } from 'react';
import { CRITERIOS_VAZIOS, FAIXAS_ICP, type CriteriosIcp } from '@/lib/icp';
import { PORTE } from '@/lib/status';
import { api } from './util';

interface IcpRow { id: number; nome: string; descricao: string | null; padrao: boolean; criterios: CriteriosIcp }
interface Seg { id: number; nome: string; grupo: string }
interface Reg { id: number; nome: string }
type Form = { id?: number; nome: string; descricao: string; padrao: boolean; criterios: CriteriosIcp };

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function Peso({ valor, onChange }: { valor: number; onChange: (n: number) => void }) {
  return (
    <span className="linha" style={{ gap: 6 }}>
      <input type="range" min={0} max={10} value={valor} onChange={(e) => onChange(Number(e.target.value))} aria-label="Peso" style={{ width: 110 }} />
      <strong className="mono" style={{ width: 18 }}>{valor}</strong>
    </span>
  );
}

export function EditorIcp({ onMensagem }: { onMensagem: (m: string) => void }) {
  const [icps, setIcps] = useState<IcpRow[]>([]);
  const [segs, setSegs] = useState<Seg[]>([]);
  const [regs, setRegs] = useState<Reg[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = () => api<{ icps: IcpRow[] }>('/api/icps').then((d) => setIcps(d.icps)).catch((e) => setErro(e.message));
  useEffect(() => {
    carregar();
    api<{ segmentos: Seg[] }>('/api/segmentos').then((d) => setSegs(d.segmentos));
    api<{ regioes: Reg[] }>('/api/regioes').then((d) => setRegs(d.regioes));
  }, []);

  const c = form?.criterios;
  const setC = (fn: (c: CriteriosIcp) => void) => setForm((f) => { if (!f) return f; const n = clone(f); fn(n.criterios); return n; });
  const alternar = (xs: number[], v: number, on: boolean) => (on ? [...new Set([...xs, v])] : xs.filter((x) => x !== v));
  const somaPesos = c ? c.segmentos.peso + c.porte.peso + c.capital.peso + c.idade.peso + c.estabelecimentos.peso + c.rntrc.peso + c.localizacao.peso + c.contato.peso : 0;
  const pct = (p: number) => (somaPesos ? `${Math.round((100 * p) / somaPesos)}%` : '—');

  const salvar = async () => {
    if (!form) return;
    setErro(null);
    try {
      const body = { nome: form.nome, descricao: form.descricao, padrao: form.padrao, criterios: form.criterios };
      if (form.id) await api(`/api/icps/${form.id}`, { method: 'PUT', body });
      else await api('/api/icps', { body });
      setForm(null);
      onMensagem('Perfil ICP salvo. Os scores são recalculados na próxima busca.');
      carregar();
    } catch (e) { setErro((e as Error).message); }
  };
  const excluir = async (i: IcpRow) => {
    if (!confirm(`Excluir o perfil "${i.nome}"?`)) return;
    try { await api(`/api/icps/${i.id}`, { method: 'DELETE' }); carregar(); } catch (e) { setErro((e as Error).message); }
  };

  const linha = (titulo: string, ajuda: string, pesoAtual: number, onPeso: (n: number) => void, extra?: React.ReactNode) => (
    <tr>
      <td data-label="Critério"><strong>{titulo}</strong><div className="mudo">{ajuda}</div></td>
      <td data-label="Peso"><Peso valor={pesoAtual} onChange={onPeso} /></td>
      <td data-label="Influência" className="mudo">{pct(pesoAtual)}</td>
      <td data-label="Ideal">{extra}</td>
    </tr>
  );

  return (
    <>
      {erro && <div className="erro-box">{erro}</div>}
      {form && c && (
        <section className="cartao pad" style={{ marginBottom: 16 }}>
          <h2>{form.id ? 'Editar perfil ICP' : 'Novo perfil ICP'}</h2>
          <div className="dois">
            <div><label htmlFor="in">Nome</label><input id="in" type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div><label htmlFor="id">Descrição</label><input id="id" type="text" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
          </div>
          <label className="check"><input type="checkbox" checked={form.padrao} onChange={(e) => setForm({ ...form, padrao: e.target.checked })} /> Perfil padrão das buscas</label>
          <p className="mudo">Score = média ponderada da aderência de cada critério (0 a 100). Faixas: A ≥ {FAIXAS_ICP.A}, B ≥ {FAIXAS_ICP.B}, C ≥ {FAIXAS_ICP.C}, D abaixo. Peso 0 desliga o critério.</p>
          <table className="tab responsiva">
            <thead><tr><th>Critério</th><th>Peso</th><th>Influência</th><th>Ideal</th></tr></thead>
            <tbody>
              {linha('Segmento', 'CNAE principal = 100%, secundário ou nome = 50%', c.segmentos.peso, (n) => setC((x) => { x.segmentos.peso = n; }),
                <details><summary>{c.segmentos.ids.length} segmentos</summary>
                  <div className="lista-municipios" style={{ maxHeight: 220 }}>
                    {segs.map((s) => (
                      <label key={s.id} className="check"><input type="checkbox" checked={c.segmentos.ids.includes(s.id)}
                        onChange={(e) => setC((x) => { x.segmentos.ids = alternar(x.segmentos.ids, s.id, e.target.checked); })} /> {s.nome} <span className="mudo">({s.grupo})</span></label>
                    ))}
                  </div>
                </details>)}
              {linha('Porte', 'Porte dentro da lista = 100%', c.porte.peso, (n) => setC((x) => { x.porte.peso = n; }),
                <div className="chips">{['01', '03', '05'].map((p) => (
                  <label key={p} className="check" style={{ margin: 0 }}><input type="checkbox" checked={c.porte.valores.includes(p)}
                    onChange={(e) => setC((x) => { x.porte.valores = e.target.checked ? [...x.porte.valores, p] : x.porte.valores.filter((v) => v !== p); })} /> {PORTE[p]}</label>
                ))}</div>)}
              {linha('Capital social', 'Proporcional até o mínimo ideal', c.capital.peso, (n) => setC((x) => { x.capital.peso = n; }),
                <span className="linha">R$ <input type="number" min={0} step={10000} value={c.capital.minimo} style={{ width: 140 }}
                  onChange={(e) => setC((x) => { x.capital.minimo = Number(e.target.value); })} /></span>)}
              {linha('Tempo de atividade', 'Proporcional até os anos mínimos', c.idade.peso, (n) => setC((x) => { x.idade.peso = n; }),
                <span className="linha"><input type="number" min={0} value={c.idade.anosMinimo} style={{ width: 80 }}
                  onChange={(e) => setC((x) => { x.idade.anosMinimo = Number(e.target.value); })} /> anos</span>)}
              {linha('Estrutura', 'Nº de estabelecimentos ativos da empresa', c.estabelecimentos.peso, (n) => setC((x) => { x.estabelecimentos.peso = n; }),
                <span className="linha"><input type="number" min={1} value={c.estabelecimentos.minimo} style={{ width: 80 }}
                  onChange={(e) => setC((x) => { x.estabelecimentos.minimo = Number(e.target.value); })} /> ou mais</span>)}
              {linha('Frota (RNTRC)', 'Ativo = 100%, outra situação = 30%', c.rntrc.peso, (n) => setC((x) => { x.rntrc.peso = n; }), <span className="mudo">Registro na ANTT</span>)}
              {linha('Localização', 'Dentro das regiões = 100%', c.localizacao.peso, (n) => setC((x) => { x.localizacao.peso = n; }),
                <div className="chips">{regs.map((r) => (
                  <label key={r.id} className="check" style={{ margin: 0 }}><input type="checkbox" checked={c.localizacao.regioes.includes(r.id)}
                    onChange={(e) => setC((x) => { x.localizacao.regioes = alternar(x.localizacao.regioes, r.id, e.target.checked); })} /> {r.nome}</label>
                ))}</div>)}
              {linha('Contato', 'Telefone 50%, celular 25%, e-mail corporativo 25%', c.contato.peso, (n) => setC((x) => { x.contato.peso = n; }), null)}
            </tbody>
          </table>
          <h3>Eliminatórios (zeram o score)</h3>
          <div className="linha">
            <label className="check"><input type="checkbox" checked={c.eliminatorios.mei} onChange={(e) => setC((x) => { x.eliminatorios.mei = e.target.checked; })} /> MEI</label>
            <label className="check"><input type="checkbox" checked={c.eliminatorios.inativa} onChange={(e) => setC((x) => { x.eliminatorios.inativa = e.target.checked; })} /> Situação não ativa</label>
            <label className="check"><input type="checkbox" checked={c.eliminatorios.semTelefone} onChange={(e) => setC((x) => { x.eliminatorios.semTelefone = e.target.checked; })} /> Sem telefone</label>
          </div>
          <div className="linha" style={{ marginTop: 12 }}>
            <button className="btn primario" onClick={salvar} disabled={!form.nome.trim() || somaPesos === 0}>Salvar perfil</button>
            <button className="btn" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </section>
      )}
      <section className="cartao" style={{ marginBottom: 24 }}>
        <div className="barra-acoes" style={{ position: 'static' }}>
          <span className="info-res"><strong>{icps.length}</strong> perfis de cliente ideal</span>
          <button className="btn primario" onClick={() => setForm({ nome: '', descricao: '', padrao: false, criterios: clone(CRITERIOS_VAZIOS) })}>Novo perfil</button>
        </div>
        <table className="tab responsiva">
          <thead><tr><th>Perfil</th><th>Critérios com peso</th><th></th></tr></thead>
          <tbody>{icps.map((i) => {
            const k = i.criterios;
            const ativos = ([['Segmento', k.segmentos.peso], ['Porte', k.porte.peso], ['Capital', k.capital.peso], ['Atividade', k.idade.peso],
              ['Estrutura', k.estabelecimentos.peso], ['RNTRC', k.rntrc.peso], ['Localização', k.localizacao.peso], ['Contato', k.contato.peso]] as [string, number][])
              .filter(([, p]) => p > 0).map(([n, p]) => `${n} ${p}`).join(' · ');
            return (
              <tr key={i.id}>
                <td data-label="Perfil"><strong>{i.nome}</strong> {i.padrao && <span className="pilula ok">padrão</span>}{i.descricao && <div className="mudo">{i.descricao}</div>}</td>
                <td data-label="Critérios com peso" className="mudo">{ativos}</td>
                <td className="linha">
                  <button className="btn pequeno" onClick={() => setForm({ id: i.id, nome: i.nome, descricao: i.descricao ?? '', padrao: i.padrao, criterios: clone(i.criterios) })}>Editar</button>
                  <button className="btn pequeno" onClick={() => setForm({ nome: `${i.nome} (cópia)`, descricao: i.descricao ?? '', padrao: false, criterios: clone(i.criterios) })}>Duplicar</button>
                  <button className="btn pequeno perigo" onClick={() => excluir(i)}>Excluir</button>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </section>
    </>
  );
}
