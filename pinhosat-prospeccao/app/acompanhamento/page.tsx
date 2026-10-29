'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Empresa } from '@/lib/empresa';
import { STATUS_PROSPECCAO } from '@/lib/status';
import { api, dataBr } from '@/components/util';
import { Contatos } from '@/components/TabelaEmpresas';

export default function Acompanhamento() {
  const [d, setD] = useState<{ empresas: Empresa[]; porStatus: { status: string; qtd: number }[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { api<typeof d>('/api/acompanhamento').then(setD).catch((e) => setErro(e.message)); }, []);
  const hoje = new Date().toISOString().slice(0, 10);
  if (erro) return <div className="erro-box">{erro}</div>;
  if (!d) return <div className="carregando">Carregando…</div>;
  const qtd = (s: string) => d.porStatus.find((x) => x.status === s)?.qtd ?? 0;
  return (
    <>
      <h1>Acompanhamento</h1>
      <p className="sub">Retornos vencidos e dos próximos 7 dias, e o funil da base de prospecção.</p>
      <div className="cards">
        {Object.entries(STATUS_PROSPECCAO).map(([k, v]) => (
          <div key={k} className="cartao card-num"><div className="n">{qtd(k)}</div><div className="l">{v}</div></div>
        ))}
      </div>
      <section className="cartao">
        {d.empresas.length === 0 ? <div className="carregando">Nenhum retorno agendado para os próximos 7 dias.</div> : (
          <table className="tab responsiva">
            <thead><tr><th>Retorno</th><th>Empresa</th><th>Status</th><th>Contatos</th><th>Cidade</th></tr></thead>
            <tbody>{d.empresas.map((e) => (
              <tr key={e.cnpj}>
                <td data-label="Retorno">{e.proximoContato! < hoje ? <span className="pilula aviso">{dataBr(e.proximoContato)} — vencido</span> : dataBr(e.proximoContato)}</td>
                <td data-label="Empresa"><Link className="nome" href={`/empresa/${e.cnpj}`}>{e.razaoSocial}</Link>{e.nomeFantasia && <div>{e.nomeFantasia}</div>}
                  <div className="mudo">último contato: {dataBr(e.ultimoContato) || '—'}</div></td>
                <td data-label="Status"><span className="pilula">{e.prospeccaoStatusTexto}</span></td>
                <td data-label="Contatos"><Contatos e={e} /></td>
                <td data-label="Cidade">{e.cidade}/{e.uf}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  );
}
