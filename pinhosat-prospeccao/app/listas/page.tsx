'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, dataBr } from '@/components/util';
import { ModalExportar } from '@/components/ModalExportar';

interface Lista {
  id: number; nome: string; descricao: string | null; criado_por: string; criado_em: string; atualizado_em: string;
  quantidade: number; contatadas: number; ultima_exportacao: string | null; exportacoes: number;
  filtros: { segmentos?: number[]; regioes?: number[]; ufs?: string[] } | null;
}

export default function Listas() {
  const [listas, setListas] = useState<Lista[] | null>(null);
  const [exportar, setExportar] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = () => api<{ listas: Lista[] }>('/api/listas').then((d) => setListas(d.listas)).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, []);

  const excluir = async (l: Lista) => {
    if (!confirm(`Excluir a lista "${l.nome}"? O histórico de prospecção das empresas é mantido.`)) return;
    await api(`/api/listas/${l.id}`, { method: 'DELETE' });
    carregar();
  };

  return (
    <>
      <h1>Listas salvas</h1>
      <p className="sub">Cada lista representa uma campanha. Uma empresa pode estar em mais de uma lista — o sistema avisa quando isso acontece.</p>
      {erro && <div className="erro-box">{erro}</div>}
      <div className="cartao">
        {!listas ? <div className="carregando">Carregando…</div> : listas.length === 0 ? (
          <div className="carregando">Nenhuma lista ainda. Gere uma busca, selecione as empresas e clique em “Salvar em lista”.</div>
        ) : (
          <table className="tab responsiva">
            <thead><tr><th>Nome</th><th>Empresas</th><th>Contatadas</th><th>Criada</th><th>Atualizada</th><th>Exportações</th><th></th></tr></thead>
            <tbody>
              {listas.map((l) => (
                <tr key={l.id}>
                  <td data-label="Nome"><Link href={`/listas/${l.id}`} className="nome">{l.nome}</Link>{l.descricao && <div className="mudo">{l.descricao}</div>}</td>
                  <td data-label="Empresas">{l.quantidade}</td>
                  <td data-label="Contatadas">{l.contatadas} <span className="mudo">({l.quantidade ? Math.round((100 * l.contatadas) / l.quantidade) : 0}%)</span></td>
                  <td data-label="Criada">{dataBr(l.criado_em)}<div className="mudo">{l.criado_por}</div></td>
                  <td data-label="Atualizada">{dataBr(l.atualizado_em)}</td>
                  <td data-label="Exportações">{l.exportacoes}{l.ultima_exportacao && <div className="mudo">última {dataBr(l.ultima_exportacao)}</div>}</td>
                  <td className="linha">
                    <Link className="btn pequeno" href={`/listas/${l.id}`}>Abrir</Link>
                    <button className="btn pequeno" onClick={() => setExportar(l.id)}>Exportar</button>
                    <button className="btn pequeno perigo" onClick={() => excluir(l)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {exportar !== null && <ModalExportar listaId={exportar} onFechar={() => { setExportar(null); carregar(); }} />}
    </>
  );
}
