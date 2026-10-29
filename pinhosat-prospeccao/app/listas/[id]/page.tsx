'use client';
import { use, useEffect, useMemo, useState } from 'react';
import type { Empresa } from '@/lib/empresa';
import { STATUS_PROSPECCAO } from '@/lib/status';
import { api, dataBr, useToast } from '@/components/util';
import { TabelaEmpresas, type ColunaOrdem } from '@/components/TabelaEmpresas';
import { ModalExportar } from '@/components/ModalExportar';

interface Detalhe {
  lista: { id: number; nome: string; descricao: string | null; criado_em: string; criado_por: string; filtros: unknown };
  empresas: Empresa[];
  exportacoes: { formato: string; quantidade: number; usuario: string; criado_em: string }[];
}

const ORDEM_PORTE: Record<string, number> = { '05': 0, '03': 1, '01': 2, '00': 3 };
const ORDEM_NIVEL: Record<string, number> = { alto: 0, medio: 1, verificar: 2 };

export default function ListaDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detalhe | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ordem, setOrdem] = useState<ColunaOrdem>('icp');
  const [icps, setIcps] = useState<{ id: number; nome: string; padrao: boolean }[]>([]);
  const [icpId, setIcpId] = useState<number | ''>('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [exportar, setExportar] = useState(false);
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const { mostrar, Toast } = useToast();

  const carregar = () => api<Detalhe>(`/api/listas/${id}${icpId ? `?icp=${icpId}` : ''}`).then((x) => { setD(x); setNome(x.lista.nome); setDescricao(x.lista.descricao ?? ''); })
    .catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, [id, icpId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api<{ icps: typeof icps }>('/api/opcoes').then((o) => setIcps(o.icps)).catch(() => {}); }, []);

  const empresas = useMemo(() => {
    const xs = (d?.empresas ?? []).filter((e) => !filtroStatus || (e.prospeccaoStatus ?? 'novo') === filtroStatus);
    const cmp: Record<ColunaOrdem, (a: Empresa, b: Empresa) => number> = {
      icp: (a, b) => (b.icp?.score ?? -1) - (a.icp?.score ?? -1) || b.pontos - a.pontos,
      potencial: (a, b) => ORDEM_NIVEL[a.nivel] - ORDEM_NIVEL[b.nivel] || b.pontos - a.pontos,
      razao_social: (a, b) => a.razaoSocial.localeCompare(b.razaoSocial),
      segmento: (a, b) => a.segmento.localeCompare(b.segmento),
      cidade: (a, b) => a.cidade.localeCompare(b.cidade),
      porte: (a, b) => (ORDEM_PORTE[a.porteCodigo ?? '00'] ?? 3) - (ORDEM_PORTE[b.porteCodigo ?? '00'] ?? 3),
      abertura: (a, b) => (a.dataInicio ?? '').localeCompare(b.dataInicio ?? ''),
    };
    return [...xs].sort(cmp[ordem]);
  }, [d, ordem, filtroStatus]);

  const porStatus = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of d?.empresas ?? []) m[e.prospeccaoStatus ?? 'novo'] = (m[e.prospeccaoStatus ?? 'novo'] ?? 0) + 1;
    return m;
  }, [d]);

  const remover = async () => {
    if (!confirm(`Remover ${sel.size} empresa(s) desta lista?`)) return;
    await api(`/api/listas/${id}/itens`, { method: 'DELETE', body: { cnpjs: [...sel] } });
    setSel(new Set());
    mostrar('Empresas removidas da lista.');
    carregar();
  };
  const statusLote = async (status: string) => {
    if (!status) return;
    await api('/api/prospeccao/lote', { body: { cnpjs: [...sel], status } });
    mostrar('Status atualizado.');
    carregar();
  };
  const salvarNome = async () => {
    try {
      await api(`/api/listas/${id}`, { method: 'PATCH', body: { nome, descricao } });
      setEditando(false);
      carregar();
    } catch (e) { mostrar((e as Error).message); }
  };

  if (erro) return <div className="erro-box">{erro}</div>;
  if (!d) return <div className="carregando">Carregando…</div>;
  return (
    <>
      {editando ? (
        <div className="cartao pad" style={{ marginBottom: 16 }}>
          <label htmlFor="n" style={{ marginTop: 0 }}>Nome</label>
          <input id="n" type="text" value={nome} onChange={(e) => setNome(e.target.value)} />
          <label htmlFor="d">Descrição</label>
          <textarea id="d" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          <div className="linha" style={{ marginTop: 8 }}>
            <button className="btn primario" onClick={salvarNome}>Salvar</button>
            <button className="btn" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          <h1>{d.lista.nome} <button className="btn pequeno" onClick={() => setEditando(true)}>Editar</button></h1>
          <p className="sub">{d.lista.descricao ? `${d.lista.descricao} · ` : ''}Criada em {dataBr(d.lista.criado_em)} por {d.lista.criado_por} · {d.empresas.length} empresas</p>
        </>
      )}
      <div className="cards">
        {Object.entries(STATUS_PROSPECCAO).filter(([k]) => porStatus[k]).map(([k, v]) => (
          <button key={k} className={`cartao card-num`} style={{ textAlign: 'left', cursor: 'pointer', outline: filtroStatus === k ? '2px solid var(--brand)' : undefined }}
            onClick={() => setFiltroStatus(filtroStatus === k ? '' : k)}>
            <div className="n">{porStatus[k]}</div><div className="l">{v}</div>
          </button>
        ))}
      </div>
      <section className="cartao">
        <div className="barra-acoes">
          <span className="info-res">{empresas.length} empresas{filtroStatus && ` com status "${STATUS_PROSPECCAO[filtroStatus as keyof typeof STATUS_PROSPECCAO]}"`} · {sel.size} selecionadas</span>
          <select aria-label="Perfil ICP" value={icpId} onChange={(e) => setIcpId(e.target.value ? Number(e.target.value) : '')} style={{ width: 'auto' }}>
            {icps.map((i) => <option key={i.id} value={i.padrao ? '' : i.id}>ICP: {i.nome}</option>)}
          </select>
          <button className="btn primario" onClick={() => setExportar(true)}>{sel.size ? 'Exportar selecionadas' : 'Exportar lista'}</button>
          <select aria-label="Alterar status" disabled={!sel.size} value="" onChange={(e) => statusLote(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Marcar status…</option>
            {Object.entries(STATUS_PROSPECCAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn perigo" disabled={!sel.size} onClick={remover}>Remover da lista</button>
        </div>
        <TabelaEmpresas
          empresas={empresas} selecionados={sel} listaAtualId={d.lista.id} ordem={ordem} onOrdenar={setOrdem}
          onSelecionar={(c, on) => setSel((s) => { const n = new Set(s); if (on) n.add(c); else n.delete(c); return n; })}
          onSelecionarTodos={(on) => setSel(on ? new Set(empresas.map((e) => e.cnpj)) : new Set())}
        />
      </section>
      {d.exportacoes.length > 0 && (
        <section className="cartao pad" style={{ marginTop: 16 }}>
          <h2>Histórico de exportações</h2>
          <ul>{d.exportacoes.map((x, i) => <li key={i}>{dataBr(x.criado_em)} — {x.quantidade} empresas em {x.formato.toUpperCase()} por {x.usuario}</li>)}</ul>
        </section>
      )}
      {exportar && <ModalExportar listaId={d.lista.id} icpId={icpId || undefined} cnpjs={sel.size ? [...sel] : undefined} onFechar={() => { setExportar(false); carregar(); }} />}
      <Toast />
    </>
  );
}
