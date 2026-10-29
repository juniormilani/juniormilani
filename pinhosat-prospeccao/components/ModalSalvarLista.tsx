'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Empresa } from '@/lib/empresa';
import { api } from './util';

interface ListaResumo { id: number; nome: string; quantidade: number }

export function ModalSalvarLista({ cnpjs: todos, empresas = [], filtros, nomeSugerido, onFechar, onSalvo }: {
  cnpjs: string[]; empresas?: Empresa[]; filtros: unknown; nomeSugerido: string; onFechar: () => void; onSalvo: (msg: string) => void;
}) {
  const [modo, setModo] = useState<'nova' | 'existente'>('nova');
  const [nome, setNome] = useState(nomeSugerido);
  const [descricao, setDescricao] = useState('');
  const [listas, setListas] = useState<ListaResumo[]>([]);
  const [destino, setDestino] = useState<number | ''>('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [umPorEmpresa, setUmPorEmpresa] = useState(true);

  // Estabelecimentos repetidos da mesma empresa (raiz do CNPJ) entre os selecionados: mantém o de maior score.
  const melhores = useMemo(() => {
    const porRaiz = new Map<string, Empresa>();
    for (const e of empresas) {
      const atual = porRaiz.get(e.cnpj.slice(0, 8));
      const nota = (x: Empresa) => (x.icp?.score ?? 0) * 1000 + x.pontos + (x.matriz ? 0.5 : 0);
      if (!atual || nota(e) > nota(atual)) porRaiz.set(e.cnpj.slice(0, 8), e);
    }
    return new Set([...porRaiz.values()].map((e) => e.cnpj));
  }, [empresas]);
  const repetidos = empresas.length - melhores.size;
  const cnpjs = umPorEmpresa && repetidos > 0 ? todos.filter((c) => melhores.has(c) || !empresas.some((e) => e.cnpj === c)) : todos;

  useEffect(() => {
    api<{ listas: ListaResumo[] }>('/api/listas').then((d) => setListas(d.listas)).catch(() => {});
  }, []);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      if (modo === 'nova') {
        const r = await api<{ id: number; adicionadas: number }>('/api/listas', { body: { nome, descricao, filtros, cnpjs } });
        onSalvo(`Lista "${nome}" criada com ${r.adicionadas} empresas.`);
      } else {
        if (destino === '') throw new Error('Escolha a lista.');
        const r = await api<{ adicionadas: number; jaEmOutrasListas: number }>(`/api/listas/${destino}/itens`, { body: { cnpjs } });
        onSalvo(`${r.adicionadas} empresas adicionadas${r.adicionadas < cnpjs.length ? ` (${cnpjs.length - r.adicionadas} já estavam na lista)` : ''}.`);
      }
      onFechar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Salvar lista">
        <h2>Salvar {cnpjs.length} empresa{cnpjs.length === 1 ? '' : 's'} em lista</h2>
        <div className="linha">
          <label className="check"><input type="radio" checked={modo === 'nova'} onChange={() => setModo('nova')} /> Nova lista</label>
          <label className="check"><input type="radio" checked={modo === 'existente'} onChange={() => setModo('existente')} disabled={!listas.length} /> Adicionar a lista existente</label>
        </div>
        {modo === 'nova' ? (
          <>
            <label htmlFor="nl">Nome da lista</label>
            <input id="nl" type="text" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
            <label htmlFor="dl">Descrição / campanha (opcional)</label>
            <textarea id="dl" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Campanha câmeras de baú — outubro" />
          </>
        ) : (
          <>
            <label htmlFor="le">Lista</label>
            <select id="le" value={destino} onChange={(e) => setDestino(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Selecione…</option>
              {listas.map((l) => <option key={l.id} value={l.id}>{l.nome} ({l.quantidade})</option>)}
            </select>
          </>
        )}
        {repetidos > 0 && (
          <label className="check" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={umPorEmpresa} onChange={(e) => setUmPorEmpresa(e.target.checked)} />
            Manter só um estabelecimento por empresa ({repetidos} filia{repetidos === 1 ? 'l' : 'is'}/matriz da mesma empresa {repetidos === 1 ? 'seria removida' : 'seriam removidas'})
          </label>
        )}
        <p className="mudo">As empresas salvas entram na base de prospecção com status “Novo lead” e passam a ser sinalizadas como já existentes em novas buscas.</p>
        {erro && <div className="erro-box">{erro}</div>}
        <div className="rodape">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn primario" disabled={salvando || (modo === 'nova' && !nome.trim())} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}
