'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Empresa } from '@/lib/empresa';
import type { FiltrosBusca } from '@/lib/filtros';
import { NIVEL_POTENCIAL, PORTE, SITUACAO_CADASTRAL, STATUS_PROSPECCAO } from '@/lib/status';
import { TabelaEmpresas, type ColunaOrdem } from './TabelaEmpresas';
import { ModalExportar } from './ModalExportar';
import { ModalSalvarLista } from './ModalSalvarLista';
import { api, useToast } from './util';

interface Segmento { id: number; nome: string; grupo: string; prioridade: 'alta' | 'media' | 'baixa' }
interface Regiao { id: number; nome: string; uf: string; qtd: number }
interface Municipio { codigo: string; nome: string }
interface Opcoes { segmentos: Segmento[]; regioes: Regiao[]; ufs: string[]; municipios: Municipio[] }

const PADRAO: FiltrosBusca = {
  ufs: ['RS'], situacoes: ['02'], modoSegmento: 'amplo', excluirMei: true, prospeccao: 'todas',
  ordenarPor: 'potencial', limite: 200, segmentos: [], regioes: [], municipios: [], portes: [], potencial: [],
};
const CHAVE = 'pinhosat.filtros';
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function Busca() {
  const [op, setOp] = useState<Opcoes | null>(null);
  const [f, setF] = useState<FiltrosBusca>(PADRAO);
  const [municipiosNomes, setMunicipiosNomes] = useState<Record<string, string>>({});
  const [buscaMun, setBuscaMun] = useState('');
  const [cnaesTexto, setCnaesTexto] = useState('');
  const [res, setRes] = useState<{ total: number; empresas: Empresa[]; ms: number } | null>(null);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [modal, setModal] = useState<'exportar' | 'salvar' | null>(null);
  const [filtrosUsados, setFiltrosUsados] = useState<FiltrosBusca | null>(null);
  const { mostrar, Toast } = useToast();

  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? 'null');
      if (salvo?.f) { setF({ ...PADRAO, ...salvo.f }); setMunicipiosNomes(salvo.municipiosNomes ?? {}); setCnaesTexto((salvo.f.cnaes ?? []).join(', ')); }
    } catch { /* sem localStorage */ }
  }, []);

  const ufUnica = f.ufs?.length === 1 ? f.ufs[0] : null;
  useEffect(() => {
    api<Opcoes>(`/api/opcoes${ufUnica ? `?uf=${ufUnica}` : ''}`).then(setOp).catch((e) => setErro(e.message));
  }, [ufUnica]);

  const set = <K extends keyof FiltrosBusca>(k: K, v: FiltrosBusca[K]) => setF((x) => ({ ...x, [k]: v }));
  const alternar = <T,>(k: keyof FiltrosBusca, v: T, on: boolean) =>
    setF((x) => {
      const atual = ((x[k] as T[] | undefined) ?? []).filter((y) => y !== v);
      return { ...x, [k]: on ? [...atual, v] : atual };
    });

  const grupos = useMemo(() => {
    const g = new Map<string, Segmento[]>();
    for (const s of op?.segmentos ?? []) g.set(s.grupo, [...(g.get(s.grupo) ?? []), s]);
    return [...g.entries()];
  }, [op]);

  const sugestoesMun = useMemo(() => {
    const t = buscaMun.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
    if (t.length < 2) return [];
    return (op?.municipios ?? []).filter((m) => m.nome.includes(t) && !f.municipios?.includes(m.codigo)).slice(0, 8);
  }, [buscaMun, op, f.municipios]);

  const gerar = async (pagina = 0, ordenarPor = f.ordenarPor) => {
    setCarregando(true);
    setErro(null);
    const cnaes = cnaesTexto.split(/[,;\s]+/).map((c) => c.replace(/\D/g, '')).filter((c) => c.length === 7);
    const filtros = { ...f, cnaes, pagina, ordenarPor };
    setF(filtros);
    try {
      try { localStorage.setItem(CHAVE, JSON.stringify({ f: { ...filtros, pagina: 0 }, municipiosNomes })); } catch { /* ignora */ }
      const r = await api<{ total: number; empresas: Empresa[]; ms: number }>('/api/busca', { body: filtros });
      setRes(r);
      setFiltrosUsados(filtros);
      setSel(new Set());
      setOcultos(new Set());
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  const visiveis = (res?.empresas ?? []).filter((e) => !ocultos.has(e.cnpj));
  const selecionadas = [...sel];
  const contagem = { alto: 0, medio: 0, verificar: 0 } as Record<string, number>;
  visiveis.forEach((e) => contagem[e.nivel]++);

  const nomeSugerido = useMemo(() => {
    const segs = (op?.segmentos ?? []).filter((s) => f.segmentos?.includes(s.id)).map((s) => s.nome);
    const regs = (op?.regioes ?? []).filter((r) => f.regioes?.includes(r.id)).map((r) => r.nome);
    const muns = (f.municipios ?? []).map((m) => municipiosNomes[m]).filter(Boolean);
    const onde = regs.length ? regs.join(', ') : muns.length ? muns.slice(0, 3).join(', ') : (f.ufs ?? []).join(', ');
    const d = new Date();
    return [segs.length ? (segs.length > 2 ? `${segs.slice(0, 2).join(', ')} e outros` : segs.join(' e ')) : 'Leads', onde, `${MESES[d.getMonth()]} ${d.getFullYear()}`]
      .filter(Boolean).join(' — ');
  }, [f, op, municipiosNomes]);

  const statusLote = async (status: string) => {
    if (!status || !selecionadas.length) return;
    try {
      await api('/api/prospeccao/lote', { body: { cnpjs: selecionadas, status } });
      mostrar(`${selecionadas.length} empresas marcadas como "${STATUS_PROSPECCAO[status as keyof typeof STATUS_PROSPECCAO]}".`);
      gerar(f.pagina ?? 0);
    } catch (e) { mostrar((e as Error).message); }
  };

  const verificarSites = async () => {
    const alvo = visiveis.filter((e) => sel.has(e.cnpj) && e.siteProvavel).map((e) => e.cnpj).slice(0, 100);
    if (!alvo.length) { mostrar('Nenhuma empresa selecionada tem e-mail com domínio próprio.'); return; }
    mostrar(`Verificando ${alvo.length} domínios…`);
    try {
      const r = await api<{ verificados: number; encontrados: number }>('/api/verificar-sites', { body: { cnpjs: alvo } });
      mostrar(`${r.encontrados} de ${r.verificados} domínios responderam como site.`);
      gerar(f.pagina ?? 0);
    } catch (e) { mostrar((e as Error).message); }
  };

  const ordenar = (c: ColunaOrdem) => gerar(0, c);
  const limite = f.limite ?? 200;
  const paginas = res ? Math.ceil(res.total / limite) : 0;

  return (
    <div className="grade-busca">
      <aside className="cartao pad filtros" aria-label="Filtros">
        <label htmlFor="texto" style={{ marginTop: 0 }}>Nome, CNPJ ou atividade</label>
        <input id="texto" type="search" value={f.texto ?? ''} placeholder="Ex.: desentupidora, 12.345.678/0001-90, transporte"
          onChange={(e) => set('texto', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && gerar()} />

        <h3>Segmentos</h3>
        <div className="linha" style={{ marginBottom: 6 }}>
          <button className="btn pequeno" onClick={() => set('segmentos', (op?.segmentos ?? []).filter((s) => s.prioridade === 'alta').map((s) => s.id))}>Prioridade alta</button>
          <button className="btn pequeno" onClick={() => set('segmentos', [])}>Limpar</button>
        </div>
        {grupos.map(([g, segs]) => (
          <details key={g} className="segmentos-grupo" open={segs.some((s) => f.segmentos?.includes(s.id)) || g === 'Transporte e logística'}>
            <summary>{g} ({segs.filter((s) => f.segmentos?.includes(s.id)).length}/{segs.length})</summary>
            {segs.map((s) => (
              <label key={s.id} className="check">
                <input type="checkbox" checked={!!f.segmentos?.includes(s.id)} onChange={(e) => alternar('segmentos', s.id, e.target.checked)} />
                <span>{s.nome} {s.prioridade === 'alta' && <span className="pilula ok">alta</span>}</span>
              </label>
            ))}
          </details>
        ))}
        <label htmlFor="modo">Correspondência do segmento</label>
        <select id="modo" value={f.modoSegmento} onChange={(e) => set('modoSegmento', e.target.value as FiltrosBusca['modoSegmento'])}>
          <option value="amplo">Ampla — CNAE principal, secundário ou palavra-chave no nome</option>
          <option value="principal">Restrita — somente CNAE principal</option>
        </select>
        <label htmlFor="cnaes">CNAEs adicionais (7 dígitos, separados por vírgula)</label>
        <input id="cnaes" type="text" value={cnaesTexto} placeholder="Ex.: 4930202, 3702900" onChange={(e) => setCnaesTexto(e.target.value)} />

        <h3>Localização</h3>
        <label>Estado</label>
        <div className="chips">
          {(op?.ufs ?? ['RS']).map((uf) => (
            <label key={uf} className="check" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!f.ufs?.includes(uf)} onChange={(e) => { alternar('ufs', uf, e.target.checked); set('municipios', []); }} /> {uf}
            </label>
          ))}
        </div>
        {!!op?.regioes.length && (<>
          <label>Regiões</label>
          {op.regioes.map((r) => (
            <label key={r.id} className="check">
              <input type="checkbox" checked={!!f.regioes?.includes(r.id)} onChange={(e) => alternar('regioes', r.id, e.target.checked)} />
              {r.nome} <span className="mudo">({r.qtd} cidades)</span>
            </label>
          ))}
        </>)}
        <label htmlFor="mun">Cidades {ufUnica ? `(${ufUnica})` : '(selecione um estado)'}</label>
        <input id="mun" type="text" value={buscaMun} disabled={!ufUnica} placeholder="Digite para adicionar…" onChange={(e) => setBuscaMun(e.target.value)} />
        {sugestoesMun.length > 0 && (
          <div className="cartao" style={{ padding: 4 }}>
            {sugestoesMun.map((m) => (
              <button key={m.codigo} className="btn pequeno" style={{ margin: 2 }} onClick={() => {
                set('municipios', [...(f.municipios ?? []), m.codigo]);
                setMunicipiosNomes((x) => ({ ...x, [m.codigo]: m.nome }));
                setBuscaMun('');
              }}>+ {m.nome}</button>
            ))}
          </div>
        )}
        <div className="chips" style={{ marginTop: 6 }}>
          {(f.municipios ?? []).map((m) => (
            <span key={m} className="chip">{municipiosNomes[m] ?? m}
              <button aria-label="remover" onClick={() => alternar('municipios', m, false)}>×</button></span>
          ))}
        </div>
        <label htmlFor="cep">CEP (início)</label>
        <input id="cep" type="text" value={f.cep ?? ''} placeholder="Ex.: 932 (Sapucaia/Esteio)" onChange={(e) => set('cep', e.target.value)} />

        <h3>Cadastro</h3>
        <label>Situação cadastral</label>
        <div className="chips">
          {['02', '03', '04', '08'].map((s) => (
            <label key={s} className="check" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!f.situacoes?.includes(s)} onChange={(e) => alternar('situacoes', s, e.target.checked)} /> {SITUACAO_CADASTRAL[s]}
            </label>
          ))}
        </div>
        <label>Porte</label>
        <div className="chips">
          {['01', '03', '05', '00'].map((p) => (
            <label key={p} className="check" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!f.portes?.includes(p)} onChange={(e) => alternar('portes', p, e.target.checked)} /> {PORTE[p]}
            </label>
          ))}
        </div>
        <label className="check"><input type="checkbox" checked={f.excluirMei ?? true} onChange={(e) => set('excluirMei', e.target.checked)} /> Excluir MEI</label>
        <div className="dois">
          <div>
            <label htmlFor="mf">Matriz/filial</label>
            <select id="mf" value={f.matrizFilial ?? 'todas'} onChange={(e) => set('matrizFilial', e.target.value as FiltrosBusca['matrizFilial'])}>
              <option value="todas">Todas</option><option value="matriz">Só matriz</option><option value="filial">Só filial</option>
            </select>
          </div>
          <div>
            <label htmlFor="cap">Capital mínimo (R$)</label>
            <input id="cap" type="number" min={0} step={10000} value={f.capitalMin ?? ''} onChange={(e) => set('capitalMin', e.target.value === '' ? undefined : Number(e.target.value))} />
          </div>
          <div>
            <label htmlFor="imin">Atividade mín. (anos)</label>
            <input id="imin" type="number" min={0} value={f.idadeMinAnos ?? ''} onChange={(e) => set('idadeMinAnos', e.target.value === '' ? undefined : Number(e.target.value))} />
          </div>
          <div>
            <label htmlFor="imax">Atividade máx. (anos)</label>
            <input id="imax" type="number" min={0} value={f.idadeMaxAnos ?? ''} onChange={(e) => set('idadeMaxAnos', e.target.value === '' ? undefined : Number(e.target.value))} />
          </div>
        </div>

        <h3>Comercial</h3>
        <label className="check"><input type="checkbox" checked={!!f.comTelefone} onChange={(e) => set('comTelefone', e.target.checked)} /> Com telefone</label>
        <label className="check"><input type="checkbox" checked={!!f.comCelular} onChange={(e) => set('comCelular', e.target.checked)} /> Com celular (possível WhatsApp)</label>
        <label className="check"><input type="checkbox" checked={!!f.comEmail} onChange={(e) => set('comEmail', e.target.checked)} /> Com e-mail</label>
        <label className="check"><input type="checkbox" checked={!!f.comEmailCorporativo} onChange={(e) => set('comEmailCorporativo', e.target.checked)} /> Com e-mail de domínio próprio</label>
        <label className="check"><input type="checkbox" checked={!!f.comSite} onChange={(e) => set('comSite', e.target.checked)} /> Com site verificado</label>
        <label className="check"><input type="checkbox" checked={!!f.somenteRntrcAtivo} onChange={(e) => set('somenteRntrcAtivo', e.target.checked)} /> Somente com RNTRC ativo (ANTT)</label>
        <label>Potencial</label>
        <div className="chips">
          {(Object.keys(NIVEL_POTENCIAL) as (keyof typeof NIVEL_POTENCIAL)[]).map((n) => (
            <label key={n} className="check" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!f.potencial?.includes(n)} onChange={(e) => alternar('potencial', n, e.target.checked)} /> {NIVEL_POTENCIAL[n]}
            </label>
          ))}
        </div>
        <label htmlFor="prosp">Base de prospecção</label>
        <select id="prosp" value={f.prospeccao} onChange={(e) => set('prospeccao', e.target.value as FiltrosBusca['prospeccao'])}>
          <option value="todas">Todas as empresas</option>
          <option value="fora_da_base">Somente fora da minha base (nunca listadas)</option>
          <option value="nao_contatadas">Ainda não contatadas</option>
          <option value="na_base">Somente já na base</option>
        </select>
        <div className="dois">
          <div>
            <label htmlFor="ord">Ordenar por</label>
            <select id="ord" value={f.ordenarPor} onChange={(e) => set('ordenarPor', e.target.value as FiltrosBusca['ordenarPor'])}>
              <option value="potencial">Potencial</option><option value="cidade">Cidade</option><option value="segmento">Segmento</option>
              <option value="porte">Porte</option><option value="capital">Capital social</option><option value="abertura">Mais antigas</option>
              <option value="razao_social">Razão social</option>
            </select>
          </div>
          <div>
            <label htmlFor="lim">Quantidade</label>
            <select id="lim" value={limite} onChange={(e) => set('limite', Number(e.target.value))}>
              {[50, 100, 200, 500, 1000, 2000, 5000].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <p className="mudo">Empresas marcadas como “Não prospectar” nunca aparecem nas buscas.</p>
        <button className="btn primario grande" onClick={() => gerar()} disabled={carregando}>{carregando ? 'Buscando…' : 'Gerar lista'}</button>
        <button className="btn pequeno" style={{ marginTop: 8 }} onClick={() => { setF(PADRAO); setCnaesTexto(''); }}>Limpar filtros</button>
      </aside>

      <section className="cartao" aria-label="Resultados">
        {erro && <div className="erro-box">{erro}</div>}
        {!res && !carregando && (
          <div className="carregando">
            <p><strong>Escolha os segmentos e a região e clique em “Gerar lista”.</strong></p>
            <p>Exemplo: segmento “Transportadoras de cargas”, região “Grande Porto Alegre”, “Com telefone” e “Somente fora da minha base”.</p>
          </div>
        )}
        {carregando && !res && <div className="carregando">Buscando empresas…</div>}
        {res && (
          <>
            <div className="barra-acoes">
              <span className="info-res">
                <strong>{res.total.toLocaleString('pt-BR')}</strong> empresas encontradas
                {res.total > visiveis.length && <> · mostrando {visiveis.length}</>} · {(res.ms / 1000).toFixed(1)}s
                {' '}<span className="pilula alto">{contagem.alto} alto</span> <span className="pilula medio">{contagem.medio} médio</span> <span className="pilula verificar">{contagem.verificar} a verificar</span>
              </span>
              <span className="mudo">{sel.size} selecionada{sel.size === 1 ? '' : 's'}</span>
              <button className="btn" disabled={!sel.size} onClick={() => setModal('salvar')}>Salvar em lista</button>
              <button className="btn primario" disabled={!sel.size} onClick={() => setModal('exportar')}>Exportar</button>
              <select aria-label="Alterar status das selecionadas" disabled={!sel.size} value="" onChange={(e) => statusLote(e.target.value)} style={{ width: 'auto' }}>
                <option value="">Marcar status…</option>
                {Object.entries(STATUS_PROSPECCAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button className="btn" disabled={!sel.size} onClick={verificarSites} title="Testa se o domínio do e-mail corporativo tem site">Verificar sites</button>
              <button className="btn" disabled={!sel.size} onClick={() => { setOcultos((o) => new Set([...o, ...sel])); setSel(new Set()); }}>Remover da lista</button>
            </div>
            {visiveis.length === 0 ? (
              <div className="carregando">Nenhuma empresa encontrada com esses filtros. Experimente a correspondência ampla, mais cidades ou menos filtros de contato.</div>
            ) : (
              <TabelaEmpresas
                empresas={visiveis}
                selecionados={sel}
                onSelecionar={(c, on) => setSel((s) => { const n = new Set(s); if (on) n.add(c); else n.delete(c); return n; })}
                onSelecionarTodos={(on) => setSel(on ? new Set(visiveis.map((e) => e.cnpj)) : new Set())}
                ordem={f.ordenarPor as ColunaOrdem}
                onOrdenar={ordenar}
                acaoLinha={(e) => (
                  <button className="btn pequeno" title="Remover desta lista" aria-label="Remover"
                    onClick={() => { setOcultos((o) => new Set([...o, e.cnpj])); setSel((s) => { const n = new Set(s); n.delete(e.cnpj); return n; }); }}>×</button>
                )}
              />
            )}
            {paginas > 1 && (
              <div className="barra-acoes" style={{ position: 'static', borderTop: '1px solid var(--border)', borderBottom: 0 }}>
                <span className="info-res">Página {(f.pagina ?? 0) + 1} de {paginas}</span>
                <button className="btn" disabled={!f.pagina} onClick={() => gerar((f.pagina ?? 0) - 1)}>← Anterior</button>
                <button className="btn" disabled={(f.pagina ?? 0) + 1 >= paginas} onClick={() => gerar((f.pagina ?? 0) + 1)}>Próxima →</button>
              </div>
            )}
          </>
        )}
      </section>
      {modal === 'exportar' && <ModalExportar cnpjs={selecionadas} onFechar={() => setModal(null)} />}
      {modal === 'salvar' && (
        <ModalSalvarLista cnpjs={selecionadas} filtros={filtrosUsados} nomeSugerido={nomeSugerido}
          onFechar={() => setModal(null)} onSalvo={(m) => { mostrar(m); gerar(f.pagina ?? 0); }} />
      )}
      <Toast />
    </div>
  );
}
