'use client';
import { useEffect, useState } from 'react';
import type { AnaliseIcp } from '@/lib/calibracao';
import { formatarCnpj } from '@/lib/texto';
import { api, useToast } from '@/components/util';

interface IcpRow { id: number; nome: string; padrao: boolean; descricao: string | null; criterios: Record<string, { peso: number }> }
interface ResultadoImportacao {
  lidos: number; validos: number; invalidos: string[]; marcadosComoCliente: number; jaEramClientes: number;
  foraDaBase: number; foraDaBaseExemplos: string[];
}

const pct = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);

function Barra({ valor, cor = 'var(--brand)' }: { valor: number | null; cor?: string }) {
  return (
    <span className="linha" style={{ gap: 6 }}>
      <span style={{ display: 'inline-block', width: 70, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.round((valor ?? 0) * 100)}%`, background: cor }} />
      </span>
      <span className="mono">{pct(valor)}</span>
    </span>
  );
}

export default function Analise() {
  const [icps, setIcps] = useState<IcpRow[]>([]);
  const [icpId, setIcpId] = useState<number | null>(null);
  const [a, setA] = useState<AnaliseIcp | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [imp, setImp] = useState<ResultadoImportacao | null>(null);
  const { mostrar, Toast } = useToast();

  useEffect(() => {
    api<{ icps: IcpRow[] }>('/api/icps').then((d) => { setIcps(d.icps); setIcpId(d.icps.find((i) => i.padrao)?.id ?? d.icps[0]?.id ?? null); });
  }, []);
  const analisar = () => {
    if (!icpId) return;
    setCarregando(true);
    setErro(null);
    api<AnaliseIcp>(`/api/icps/analise?icp=${icpId}`).then(setA).catch((e) => setErro(e.message)).finally(() => setCarregando(false));
  };
  useEffect(analisar, [icpId]); // eslint-disable-line react-hooks/exhaustive-deps

  const importar = async () => {
    try {
      const r = await api<ResultadoImportacao>('/api/clientes/importar', { body: { texto } });
      setImp(r);
      setTexto('');
      analisar();
    } catch (e) { mostrar((e as Error).message); }
  };
  const lerArquivo = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) { mostrar('Arquivo muito grande (máx. 2 MB).'); return; }
    setTexto(await f.text());
  };
  const aplicar = async () => {
    if (!a?.pesosSugeridos || !icpId) return;
    if (!confirm('Aplicar os pesos sugeridos a este perfil? Os scores mudam nas próximas buscas.')) return;
    const atual = (await api<{ icps: (IcpRow & { criterios: Record<string, unknown> })[] }>('/api/icps')).icps.find((i) => i.id === icpId);
    if (!atual) return;
    const criterios = JSON.parse(JSON.stringify(atual.criterios));
    for (const [k, p] of Object.entries(a.pesosSugeridos)) criterios[k].peso = p;
    try {
      await api(`/api/icps/${icpId}`, { method: 'PUT', body: { nome: atual.nome, descricao: atual.descricao, padrao: atual.padrao, criterios } });
      mostrar('Pesos aplicados.');
      analisar();
    } catch (e) { mostrar((e as Error).message); }
  };

  const ref = a?.amostras.referencia === 'sem_interesse' ? '“Sem interesse”' : 'base de prospecção (amostra)';

  return (
    <>
      <h1>Análise do ICP</h1>
      <p className="sub">Compare o perfil de cliente ideal com quem realmente compra. Importe a carteira atual e registre “Cliente” e “Sem interesse” na prospecção: o sistema mostra quais critérios distinguem os clientes e sugere novos pesos.</p>

      <section className="cartao pad" style={{ marginBottom: 16 }}>
        <h2>Carteira de clientes atual</h2>
        <p className="mudo">Cole os CNPJs (com ou sem pontuação, em qualquer formato: coluna de planilha, CSV, texto) ou envie um arquivo .csv/.txt. As empresas encontradas passam a “Cliente”, saem das buscas de prospecção e entram na calibração.</p>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} placeholder={'12.345.678/0001-90\n98765432000110'} />
        <div className="linha" style={{ marginTop: 8 }}>
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => lerArquivo(e.target.files?.[0])} aria-label="Arquivo de CNPJs" />
          <button className="btn primario" disabled={!texto.trim()} onClick={importar}>Importar clientes</button>
        </div>
        {imp && (
          <div className="ok-box">
            {imp.validos} CNPJs válidos lidos · <strong>{imp.marcadosComoCliente}</strong> marcados como cliente · {imp.jaEramClientes} já eram clientes
            {imp.foraDaBase > 0 && <> · {imp.foraDaBase} fora da base importada (outro estado ou baixados): <span className="mono">{imp.foraDaBaseExemplos.slice(0, 5).map(formatarCnpj).join(', ')}{imp.foraDaBase > 5 ? '…' : ''}</span></>}
            {imp.invalidos.length > 0 && <div>{imp.invalidos.length} números com dígito verificador inválido foram ignorados: <span className="mono">{imp.invalidos.slice(0, 5).join(', ')}</span></div>}
          </div>
        )}
      </section>

      <div className="linha" style={{ marginBottom: 12 }}>
        <label htmlFor="icp" style={{ margin: 0 }}>Perfil</label>
        <select id="icp" value={icpId ?? ''} onChange={(e) => setIcpId(Number(e.target.value))} style={{ width: 'auto' }}>
          {icps.map((i) => <option key={i.id} value={i.id}>{i.nome}{i.padrao ? ' (padrão)' : ''}</option>)}
        </select>
        <button className="btn" onClick={analisar} disabled={carregando}>{carregando ? 'Analisando…' : 'Atualizar análise'}</button>
      </div>
      {erro && <div className="erro-box">{erro}</div>}
      {a && (
        <>
          <div className="cards">
            <div className="cartao card-num"><div className="n">{a.amostras.clientesNaBase}</div><div className="l">clientes na base{a.amostras.clientes > a.amostras.clientesNaBase ? ` (de ${a.amostras.clientes})` : ''}</div></div>
            <div className="cartao card-num"><div className="n">{a.amostras.semInteresse}</div><div className="l">“Sem interesse”</div></div>
            <div className="cartao card-num"><div className="n">{pct(a.coberturaAtual.clientes)}</div><div className="l">dos clientes em A/B hoje</div></div>
            <div className="cartao card-num"><div className="n">{pct(a.coberturaAtual.base)}</div><div className="l">da base em A/B hoje</div></div>
            {a.coberturaSugerida && <>
              <div className="cartao card-num"><div className="n">{pct(a.coberturaSugerida.clientes)}</div><div className="l">clientes em A/B com pesos sugeridos</div></div>
              <div className="cartao card-num"><div className="n">{pct(a.coberturaSugerida.base)}</div><div className="l">da base em A/B com pesos sugeridos</div></div>
            </>}
          </div>
          <p className="mudo">Um bom ICP coloca a maioria dos clientes em A/B e uma parte pequena da base: a lista fica curta e certeira.</p>

          {!a.suficiente && (
            <div className="aviso-box">
              Para sugerir pesos são necessários pelo menos {a.minimoClientes} clientes encontrados na base (hoje: {a.amostras.clientesNaBase}).
              Importe a carteira acima ou registre os clientes conquistados. A comparação é feita contra os “Sem interesse” quando houver {a.minimoNegativos} ou mais; antes disso, contra uma amostra da base.
            </div>
          )}

          <section className="cartao" style={{ marginBottom: 16 }}>
            <div className="barra-acoes" style={{ position: 'static' }}>
              <span className="info-res"><strong>Aderência média por critério</strong> — clientes × {ref}</span>
              <button className="btn primario" disabled={!a.pesosSugeridos} onClick={aplicar}>Aplicar pesos sugeridos</button>
            </div>
            <table className="tab responsiva">
              <thead><tr><th>Critério</th><th>Clientes</th><th>Sem interesse</th><th>Base (amostra)</th><th>Diferença</th><th>Peso atual</th><th>Peso sugerido</th></tr></thead>
              <tbody>{a.criterios.map((c) => (
                <tr key={c.chave}>
                  <td data-label="Critério"><strong>{c.nome}</strong></td>
                  <td data-label="Clientes"><Barra valor={c.clientes} /></td>
                  <td data-label="Sem interesse"><Barra valor={c.semInteresse} cor="#b8860b" /></td>
                  <td data-label="Base (amostra)"><Barra valor={c.base} cor="#8a949e" /></td>
                  <td data-label="Diferença" className="mono">{c.diferenca > 0 ? `+${Math.round(c.diferenca * 100)} p.p.` : '0'}</td>
                  <td data-label="Peso atual" className="mono">{c.pesoAtual}</td>
                  <td data-label="Peso sugerido" className="mono">{c.pesoSugerido === null ? '—' : <strong style={{ color: c.pesoSugerido > c.pesoAtual ? 'var(--alto)' : c.pesoSugerido < c.pesoAtual ? 'var(--danger)' : undefined }}>{c.pesoSugerido}</strong>}</td>
                </tr>
              ))}</tbody>
            </table>
            {a.semParametros.length > 0 && <p className="mudo pad" style={{ margin: 0 }}>Sem parâmetros definidos no perfil (não analisados): {a.semParametros.join(', ')}.</p>}
            <p className="mudo pad" style={{ margin: 0 }}>Peso sugerido proporcional à diferença entre clientes e referência (a maior diferença recebe 10). Critério que não distingue clientes recebe 0. Com poucos casos, trate como indicação, não como regra.</p>
          </section>

          <div className="dois">
            <section className="cartao">
              <div className="barra-acoes" style={{ position: 'static' }}><span className="info-res"><strong>Resultado por faixa</strong> (empresas já contatadas)</span></div>
              <table className="tab responsiva">
                <thead><tr><th>Faixa</th><th>Contatadas</th><th>Clientes</th><th>Sem interesse</th><th>Conversão</th></tr></thead>
                <tbody>{a.funil.map((f) => (
                  <tr key={f.faixa}>
                    <td data-label="Faixa"><span className="icp"><span className={`letra ${f.faixa}`}>{f.faixa}</span></span></td>
                    <td data-label="Contatadas">{f.contatadas}</td><td data-label="Clientes">{f.clientes}</td><td data-label="Sem interesse">{f.semInteresse}</td><td data-label="Conversão"><Barra valor={f.conversao} /></td>
                  </tr>
                ))}</tbody>
              </table>
              <p className="mudo pad" style={{ margin: 0 }}>Se a conversão não cai de A para D, o perfil não está separando bem os leads.</p>
            </section>
            <section className="cartao">
              <div className="barra-acoes" style={{ position: 'static' }}><span className="info-res"><strong>Segmentos dos clientes</strong></span></div>
              {a.segmentosClientes.length === 0 ? <div className="carregando">Sem clientes registrados.</div> : (
                <table className="tab responsiva">
                  <thead><tr><th>Segmento</th><th>Clientes</th><th></th></tr></thead>
                  <tbody>{a.segmentosClientes.map((s) => (
                    <tr key={s.id ?? 'x'}>
                      <td data-label="Segmento">{s.nome ?? <span className="vazio">Sem segmento cadastrado</span>}</td><td data-label="Clientes">{s.qtd}</td>
                      <td>{s.noIcp ? <span className="pilula ok">no ICP</span> : s.id ? <span className="pilula aviso">fora do ICP — avaliar incluir</span> : <span className="pilula aviso">criar segmento?</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
      <Toast />
    </>
  );
}
