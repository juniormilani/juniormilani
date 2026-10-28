'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import type { Empresa } from '@/lib/empresa';
import { SITUACAO_CADASTRAL, STATUS_PROSPECCAO } from '@/lib/status';
import { formatarCnpj, formatarTelefone } from '@/lib/texto';
import { api, dataBr, useToast } from '@/components/util';
import { Contatos, PilulaPotencial } from '@/components/TabelaEmpresas';

interface Detalhe {
  empresa: Empresa;
  prospeccao: { status: string; observacoes: string | null; ultimo_contato: string | null; proximo_contato: string | null; responsavel: string | null; atualizado_por: string; atualizado_em: string } | null;
  historico: { status: string; nota: string | null; usuario: string; criado_em: string }[];
  contatos: { id: number; tipo: string; valor: string; fonte: string; verificado: boolean; observacao: string | null; criado_por: string; criado_em: string }[];
  outrosEstabelecimentos: { cnpj: string; matriz: boolean; nome_fantasia: string | null; cidade: string; uf: string; situacao: string; status: string | null }[];
}

const isoData = (v: string | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : '');

export default function EmpresaDetalhe({ params }: { params: Promise<{ cnpj: string }> }) {
  const { cnpj } = use(params);
  const [d, setD] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState({ status: 'novo', observacoes: '', ultimoContato: '', proximoContato: '', responsavel: '', nota: '' });
  const [contato, setContato] = useState({ tipo: 'whatsapp', valor: '', fonte: 'Informado pelo próprio contato', verificado: true });
  const { mostrar, Toast } = useToast();

  const carregar = () => api<Detalhe>(`/api/empresas/${cnpj}`).then((x) => {
    setD(x);
    setForm({
      status: x.prospeccao?.status ?? 'novo', observacoes: x.prospeccao?.observacoes ?? '',
      ultimoContato: isoData(x.prospeccao?.ultimo_contato), proximoContato: isoData(x.prospeccao?.proximo_contato),
      responsavel: x.prospeccao?.responsavel ?? '', nota: '',
    });
  }).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, [cnpj]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = async () => {
    try {
      await api(`/api/prospeccao/${cnpj}`, { method: 'PUT', body: form });
      mostrar('Prospecção atualizada.');
      carregar();
    } catch (e) { mostrar((e as Error).message); }
  };
  const registrarContatoHoje = () => setForm((f) => ({ ...f, ultimoContato: new Date().toISOString().slice(0, 10) }));
  const addContato = async () => {
    try {
      await api('/api/contatos', { body: { ...contato, cnpj } });
      setContato((c) => ({ ...c, valor: '' }));
      mostrar('Contato adicionado.');
      carregar();
    } catch (e) { mostrar((e as Error).message); }
  };
  const delContato = async (id: number) => {
    await api(`/api/contatos?id=${id}`, { method: 'DELETE' });
    carregar();
  };
  const lgpd = async () => {
    if (!confirm('Excluir contatos complementares, anotações e histórico desta empresa, removê-la de todas as listas e bloquear novos contatos?')) return;
    await api(`/api/lgpd/${cnpj}`, { method: 'POST' });
    mostrar('Dados complementares excluídos. Empresa marcada como "Não prospectar".');
    carregar();
  };

  if (erro) return <div className="erro-box">{erro}</div>;
  if (!d) return <div className="carregando">Carregando…</div>;
  const e = d.empresa;
  return (
    <>
      <p className="mudo"><Link href="/">← Voltar à busca</Link></p>
      <h1>{e.razaoSocial} <PilulaPotencial e={e} /></h1>
      <p className="sub">{e.nomeFantasia && <>{e.nomeFantasia} · </>}<span className="mono">{e.cnpjFormatado}</span> · {e.matriz ? 'Matriz' : 'Filial'} · {e.cidade}/{e.uf}</p>
      <div className="grade-detalhe">
        <div>
          <section className="cartao pad">
            <h2>Dados cadastrais</h2>
            <dl className="campos">
              <dt>Situação cadastral</dt><dd>{e.situacao}</dd>
              <dt>Atividade principal</dt><dd><span className="mono">{e.cnae}</span> {e.cnaeDescricao}</dd>
              <dt>CNAEs secundários</dt><dd>{e.cnaesSecundarios.length ? e.cnaesSecundarios.join(', ') : '—'}</dd>
              <dt>Segmento</dt><dd>{e.segmento || <span className="vazio">Não classificado</span>} {e.tipoCorrespondencia && <span className="mudo">(por {e.tipoCorrespondencia.toLowerCase()})</span>}</dd>
              <dt>Endereço</dt><dd>{e.endereco || 'Não encontrado'}{e.cep && ` — CEP ${e.cep}`}</dd>
              <dt>Porte</dt><dd>{e.porte}{e.mei && ' (MEI)'}</dd>
              <dt>Capital social</dt><dd>{e.capitalSocial !== null ? e.capitalSocial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</dd>
              <dt>Abertura</dt><dd>{dataBr(e.dataInicio) || '—'}</dd>
              <dt>RNTRC (ANTT)</dt><dd>{e.rntrc ? `${e.rntrc.numero ?? ''} — ${e.rntrc.situacao} (${e.rntrc.categoria ?? ''})` : 'Sem registro'}</dd>
              <dt>Contatos</dt><dd><Contatos e={e} /></dd>
              <dt>Fonte</dt><dd>{e.fonte} · atualizado em {dataBr(e.dataConsulta)}</dd>
            </dl>
          </section>
          <section className="cartao pad" style={{ marginTop: 16 }}>
            <h2>Por que este potencial?</h2>
            <ul className="motivos">{e.motivos.map((m) => <li key={m}>{m}</li>)}</ul>
            <p className="mudo">Alto potencial exige pontuação ≥ 60 e evidência de frota (registro ativo no RNTRC ou CNAE principal de segmento prioritário com porte EPP/Demais, capital ≥ R$ 100 mil ou filiais). A quantidade de veículos não está disponível nas fontes públicas.</p>
          </section>
          <section className="cartao pad" style={{ marginTop: 16 }}>
            <h2>Contatos complementares</h2>
            <p className="mudo">Use para registrar WhatsApp confirmado, site ou e-mail do responsável pela frota. Sempre informe de onde veio o dado.</p>
            {d.contatos.length > 0 && (
              <table className="tab" style={{ marginBottom: 10 }}>
                <thead><tr><th>Tipo</th><th>Valor</th><th>Fonte</th><th>Verificado</th><th></th></tr></thead>
                <tbody>{d.contatos.map((c) => (
                  <tr key={c.id}><td>{c.tipo}</td><td>{c.tipo === 'telefone' || c.tipo === 'whatsapp' ? formatarTelefone(c.valor) : c.valor}</td><td className="mudo">{c.fonte}<br />{c.criado_por} · {dataBr(c.criado_em)}</td>
                    <td>{c.verificado ? 'Sim' : 'Não'}</td><td><button className="btn pequeno perigo" onClick={() => delContato(c.id)}>Excluir</button></td></tr>
                ))}</tbody>
              </table>
            )}
            <div className="linha">
              <select value={contato.tipo} onChange={(ev) => setContato({ ...contato, tipo: ev.target.value })} style={{ width: 130 }} aria-label="Tipo">
                <option value="whatsapp">WhatsApp</option><option value="telefone">Telefone</option><option value="email">E-mail</option><option value="site">Site</option>
              </select>
              <input className="cresce" style={{ width: 180 }} type="text" placeholder="Valor" value={contato.valor} onChange={(ev) => setContato({ ...contato, valor: ev.target.value })} aria-label="Valor" />
            </div>
            <div className="linha" style={{ marginTop: 6 }}>
              <input className="cresce" style={{ width: 220 }} type="text" placeholder="Fonte (ex.: site oficial, ligação)" value={contato.fonte} onChange={(ev) => setContato({ ...contato, fonte: ev.target.value })} aria-label="Fonte" />
              <label className="check"><input type="checkbox" checked={contato.verificado} onChange={(ev) => setContato({ ...contato, verificado: ev.target.checked })} /> Confirmado</label>
              <button className="btn" onClick={addContato} disabled={!contato.valor.trim() || !contato.fonte.trim()}>Adicionar</button>
            </div>
          </section>
          {d.outrosEstabelecimentos.length > 0 && (
            <section className="cartao pad" style={{ marginTop: 16 }}>
              <h2>Outros estabelecimentos da empresa</h2>
              <table className="tab"><tbody>{d.outrosEstabelecimentos.map((o) => (
                <tr key={o.cnpj}><td><Link href={`/empresa/${o.cnpj}`} className="mono">{formatarCnpj(o.cnpj)}</Link></td>
                  <td>{o.matriz ? 'Matriz' : 'Filial'}</td><td>{o.nome_fantasia}</td><td>{o.cidade}/{o.uf}</td>
                  <td>{SITUACAO_CADASTRAL[o.situacao]}</td><td>{o.status ? STATUS_PROSPECCAO[o.status as keyof typeof STATUS_PROSPECCAO] : ''}</td></tr>
              ))}</tbody></table>
            </section>
          )}
        </div>
        <div>
          <section className="cartao pad">
            <h2>Prospecção</h2>
            {e.listas.length > 0 && <p>Listas: {e.listas.map((l) => <Link key={l.id} href={`/listas/${l.id}`} className="pilula tag-lista">{l.nome}</Link>)}</p>}
            <label htmlFor="st" style={{ marginTop: 0 }}>Status</label>
            <select id="st" value={form.status} onChange={(ev) => setForm({ ...form, status: ev.target.value })}>
              {Object.entries(STATUS_PROSPECCAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="dois">
              <div>
                <label htmlFor="uc">Último contato <button className="btn pequeno" onClick={registrarContatoHoje}>hoje</button></label>
                <input id="uc" type="date" value={form.ultimoContato} onChange={(ev) => setForm({ ...form, ultimoContato: ev.target.value })} />
              </div>
              <div>
                <label htmlFor="pc">Próximo acompanhamento</label>
                <input id="pc" type="date" value={form.proximoContato} onChange={(ev) => setForm({ ...form, proximoContato: ev.target.value })} />
              </div>
            </div>
            <label htmlFor="resp">Responsável</label>
            <input id="resp" type="text" value={form.responsavel} onChange={(ev) => setForm({ ...form, responsavel: ev.target.value })} />
            <label htmlFor="obs">Observações</label>
            <textarea id="obs" value={form.observacoes} rows={5} placeholder="Ex.: Já possui rastreamento; interesse em câmera de baú; falar com o responsável pela frota."
              onChange={(ev) => setForm({ ...form, observacoes: ev.target.value })} />
            <div className="chips" style={{ marginTop: 4 }}>
              {['Já possui rastreamento', 'Não possui câmeras', 'Interesse em câmera de baú', 'Considerou o investimento alto', 'Solicitou contato futuro', 'Falei com o responsável pela frota'].map((t) => (
                <button key={t} className="btn pequeno" onClick={() => setForm((f) => ({ ...f, observacoes: f.observacoes ? `${f.observacoes}\n${t}` : t }))}>+ {t}</button>
              ))}
            </div>
            <label htmlFor="nota">Registro deste contato (vai para o histórico)</label>
            <input id="nota" type="text" value={form.nota} placeholder="Ex.: Liguei, pediu proposta por e-mail" onChange={(ev) => setForm({ ...form, nota: ev.target.value })} />
            <button className="btn primario grande" style={{ marginTop: 12 }} onClick={salvar}>Salvar</button>
            {d.prospeccao && <p className="mudo">Atualizado por {d.prospeccao.atualizado_por} em {dataBr(d.prospeccao.atualizado_em)}</p>}
          </section>
          <section className="cartao pad" style={{ marginTop: 16 }}>
            <h2>Histórico</h2>
            {d.historico.length === 0 ? <p className="vazio">Sem registros.</p> : (
              <ul className="motivos">{d.historico.map((h, i) => (
                <li key={i}><strong>{dataBr(h.criado_em)}</strong> — {STATUS_PROSPECCAO[h.status as keyof typeof STATUS_PROSPECCAO] ?? h.status}{h.nota && `: ${h.nota}`} <span className="mudo">({h.usuario})</span></li>
              ))}</ul>
            )}
          </section>
          <section className="cartao pad" style={{ marginTop: 16 }}>
            <h2>LGPD</h2>
            <p className="mudo">Se a empresa ou o titular pedir para não ser contatado ou para excluir os dados, use o botão abaixo. Os dados públicos da Receita continuam na base, mas a empresa fica bloqueada para prospecção.</p>
            <button className="btn perigo" onClick={lgpd}>Excluir dados complementares e bloquear contato</button>
          </section>
        </div>
      </div>
      <Toast />
    </>
  );
}
