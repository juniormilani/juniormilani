'use client';
import { useEffect, useState } from 'react';
import { formatarCnae } from '@/lib/texto';
import { api, useToast } from '@/components/util';
import { EditorIcp } from '@/components/EditorIcp';

interface Segmento {
  id: number; nome: string; grupo: string; prioridade: 'alta' | 'media' | 'baixa'; cnaes: string[]; palavras_chave: string[];
  descricao: string | null; ativo: boolean; cnaes_info: { codigo: string; descricao: string }[];
}
interface Regiao { id: number; nome: string; uf: string; municipios: string[]; municipios_info: { codigo: string; nome: string }[] }
type FormSeg = { id?: number; nome: string; grupo: string; prioridade: string; cnaes: string; palavras_chave: string; descricao: string; ativo: boolean };

const VAZIO: FormSeg = { nome: '', grupo: 'Outros', prioridade: 'media', cnaes: '', palavras_chave: '', descricao: '', ativo: true };
const PRIOR = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export default function Configuracoes() {
  const [segs, setSegs] = useState<Segmento[]>([]);
  const [regs, setRegs] = useState<Regiao[]>([]);
  const [form, setForm] = useState<FormSeg | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [achados, setAchados] = useState<{ codigo: string; descricao: string }[]>([]);
  const [reg, setReg] = useState<{ id?: number; nome: string; uf: string; municipios: { codigo: string; nome: string }[] } | null>(null);
  const [munsUf, setMunsUf] = useState<{ codigo: string; nome: string }[]>([]);
  const [buscaMun, setBuscaMun] = useState('');
  const { mostrar, Toast } = useToast();

  const carregar = () => {
    api<{ segmentos: Segmento[] }>('/api/segmentos').then((d) => setSegs(d.segmentos)).catch((e) => setErro(e.message));
    api<{ regioes: Regiao[] }>('/api/regioes').then((d) => setRegs(d.regioes)).catch(() => {});
  };
  useEffect(carregar, []);
  useEffect(() => {
    if (q.trim().length < 2) { setAchados([]); return; }
    const t = setTimeout(() => api<{ cnaes: typeof achados }>(`/api/cnaes?q=${encodeURIComponent(q)}`).then((d) => setAchados(d.cnaes)), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (reg?.uf) api<{ municipios: typeof munsUf }>(`/api/opcoes?uf=${reg.uf}`).then((d) => setMunsUf(d.municipios));
  }, [reg?.uf]);

  const salvarSeg = async () => {
    if (!form) return;
    setErro(null);
    try {
      const body = { ...form, cnaes: form.cnaes, palavras_chave: form.palavras_chave };
      if (form.id) await api(`/api/segmentos/${form.id}`, { method: 'PUT', body });
      else await api('/api/segmentos', { body });
      setForm(null);
      mostrar('Segmento salvo. Já vale para as próximas buscas.');
      carregar();
    } catch (e) { setErro((e as Error).message); }
  };
  const excluirSeg = async (s: Segmento) => {
    if (!confirm(`Excluir o segmento "${s.nome}"?`)) return;
    await api(`/api/segmentos/${s.id}`, { method: 'DELETE' });
    carregar();
  };
  const salvarReg = async () => {
    if (!reg) return;
    setErro(null);
    try {
      const body = { nome: reg.nome, uf: reg.uf, municipios: reg.municipios.map((m) => m.codigo) };
      if (reg.id) await api(`/api/regioes/${reg.id}`, { method: 'PUT', body });
      else await api('/api/regioes', { body });
      setReg(null);
      mostrar('Região salva.');
      carregar();
    } catch (e) { setErro((e as Error).message); }
  };
  const termo = buscaMun.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

  return (
    <>
      <h1>ICP, segmentos e regiões</h1>
      <p className="sub">Defina os perfis de cliente ideal, cadastre segmentos (por CNAE e/ou palavras-chave no nome) e regiões personalizadas sem alterar o sistema.</p>
      <h2>Perfis de cliente ideal (ICP)</h2>
      <EditorIcp onMensagem={mostrar} />
      <h2>Segmentos</h2>
      {erro && <div className="erro-box">{erro}</div>}

      {form && (
        <section className="cartao pad" style={{ marginBottom: 16 }}>
          <h2>{form.id ? 'Editar segmento' : 'Novo segmento'}</h2>
          <div className="dois">
            <div><label htmlFor="sn">Nome</label><input id="sn" type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="dois">
              <div><label htmlFor="sg">Grupo</label><input id="sg" type="text" list="grupos" value={form.grupo} onChange={(e) => setForm({ ...form, grupo: e.target.value })} />
                <datalist id="grupos">{[...new Set(segs.map((s) => s.grupo))].map((g) => <option key={g} value={g} />)}</datalist></div>
              <div><label htmlFor="sp">Prioridade</label>
                <select id="sp" value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}>
                  <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></div>
            </div>
          </div>
          <div className="dois">
            <div>
              <label htmlFor="sc">CNAEs (7 dígitos, um por linha ou separados por vírgula)</label>
              <textarea id="sc" rows={5} className="mono" value={form.cnaes} onChange={(e) => setForm({ ...form, cnaes: e.target.value })} />
              <label htmlFor="bq">Pesquisar CNAE</label>
              <input id="bq" type="search" placeholder="Ex.: esgoto, guincho, 4930" value={q} onChange={(e) => setQ(e.target.value)} />
              {achados.length > 0 && (
                <div className="lista-municipios">
                  {achados.map((c) => (
                    <div key={c.codigo}><button className="btn pequeno" onClick={() => setForm({ ...form, cnaes: form.cnaes ? `${form.cnaes}, ${c.codigo}` : c.codigo })}>+</button>{' '}
                      <span className="mono">{formatarCnae(c.codigo)}</span> {c.descricao}</div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label htmlFor="sk">Palavras-chave no nome (uma por linha; termine com * para prefixo)</label>
              <textarea id="sk" rows={5} value={form.palavras_chave} onChange={(e) => setForm({ ...form, palavras_chave: e.target.value })} placeholder={'DESENTUP*\nHIDROJATEAMENTO'} />
              <label htmlFor="sd">Descrição</label>
              <textarea id="sd" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              <label className="check"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo</label>
            </div>
          </div>
          <div className="linha" style={{ marginTop: 10 }}>
            <button className="btn primario" onClick={salvarSeg}>Salvar segmento</button>
            <button className="btn" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </section>
      )}

      <section className="cartao" style={{ marginBottom: 24 }}>
        <div className="barra-acoes" style={{ position: 'static' }}>
          <span className="info-res"><strong>{segs.length}</strong> segmentos</span>
          <button className="btn primario" onClick={() => setForm({ ...VAZIO })}>Novo segmento</button>
        </div>
        <table className="tab responsiva">
          <thead><tr><th>Segmento</th><th>Grupo</th><th>Prioridade</th><th>CNAEs</th><th>Palavras-chave</th><th></th></tr></thead>
          <tbody>{segs.map((s) => (
            <tr key={s.id} style={{ opacity: s.ativo ? 1 : 0.5 }}>
              <td data-label="Segmento"><strong>{s.nome}</strong>{!s.ativo && ' (inativo)'}{s.descricao && <div className="mudo">{s.descricao}</div>}</td>
              <td data-label="Grupo">{s.grupo}</td>
              <td data-label="Prioridade"><span className={`pilula ${s.prioridade === 'alta' ? 'ok' : ''}`}>{PRIOR[s.prioridade]}</span></td>
              <td data-label="CNAEs" className="mudo">{s.cnaes_info.map((c) => <div key={c.codigo} title={c.descricao}><span className="mono">{formatarCnae(c.codigo)}</span> {c.descricao.slice(0, 50)}{c.descricao.length > 50 ? '…' : ''}</div>)}</td>
              <td data-label="Palavras-chave" className="mudo">{s.palavras_chave.join(', ')}</td>
              <td className="linha">
                <button className="btn pequeno" onClick={() => setForm({ id: s.id, nome: s.nome, grupo: s.grupo, prioridade: s.prioridade, cnaes: s.cnaes.join(', '),
                  palavras_chave: s.palavras_chave.join('\n'), descricao: s.descricao ?? '', ativo: s.ativo })}>Editar</button>
                <button className="btn pequeno perigo" onClick={() => excluirSeg(s)}>Excluir</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </section>

      <h2>Regiões</h2>
      {reg && (
        <section className="cartao pad" style={{ marginBottom: 16 }}>
          <div className="dois">
            <div><label htmlFor="rn">Nome da região</label><input id="rn" type="text" value={reg.nome} onChange={(e) => setReg({ ...reg, nome: e.target.value })} /></div>
            <div><label htmlFor="ru">UF</label><input id="ru" type="text" maxLength={2} value={reg.uf} onChange={(e) => setReg({ ...reg, uf: e.target.value.toUpperCase(), municipios: [] })} /></div>
          </div>
          <label htmlFor="rb">Adicionar cidades</label>
          <input id="rb" type="search" value={buscaMun} onChange={(e) => setBuscaMun(e.target.value)} placeholder="Digite o nome da cidade" />
          {termo.length >= 2 && (
            <div className="lista-municipios">
              {munsUf.filter((m) => m.nome.includes(termo) && !reg.municipios.some((x) => x.codigo === m.codigo)).slice(0, 15).map((m) => (
                <button key={m.codigo} className="btn pequeno" style={{ margin: 2 }} onClick={() => { setReg({ ...reg, municipios: [...reg.municipios, m] }); setBuscaMun(''); }}>+ {m.nome}</button>
              ))}
            </div>
          )}
          <div className="chips" style={{ marginTop: 8 }}>
            {reg.municipios.map((m) => <span key={m.codigo} className="chip">{m.nome}<button aria-label="remover" onClick={() => setReg({ ...reg, municipios: reg.municipios.filter((x) => x.codigo !== m.codigo) })}>×</button></span>)}
          </div>
          <div className="linha" style={{ marginTop: 10 }}>
            <button className="btn primario" onClick={salvarReg}>Salvar região</button>
            <button className="btn" onClick={() => setReg(null)}>Cancelar</button>
          </div>
        </section>
      )}
      <section className="cartao">
        <div className="barra-acoes" style={{ position: 'static' }}>
          <span className="info-res"><strong>{regs.length}</strong> regiões</span>
          <button className="btn primario" onClick={() => setReg({ nome: '', uf: 'RS', municipios: [] })}>Nova região</button>
        </div>
        <table className="tab responsiva">
          <thead><tr><th>Região</th><th>UF</th><th>Cidades</th><th></th></tr></thead>
          <tbody>{regs.map((r) => (
            <tr key={r.id}>
              <td data-label="Região"><strong>{r.nome}</strong></td><td data-label="UF">{r.uf}</td>
              <td data-label="Cidades" className="mudo">{r.municipios_info.map((m) => m.nome).join(', ')}</td>
              <td className="linha">
                <button className="btn pequeno" onClick={() => setReg({ id: r.id, nome: r.nome, uf: r.uf, municipios: r.municipios_info })}>Editar</button>
                <button className="btn pequeno perigo" onClick={async () => { if (confirm(`Excluir a região "${r.nome}"?`)) { await api(`/api/regioes/${r.id}`, { method: 'DELETE' }); carregar(); } }}>Excluir</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      <Toast />
    </>
  );
}
