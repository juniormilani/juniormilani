'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Empresa } from '@/lib/empresa';
import type { FiltrosBusca } from '@/lib/filtros';
import { NIVEL_POTENCIAL, PORTE, SITUACAO_CADASTRAL, STATUS_PROSPECCAO } from '@/lib/status';
import { DESCRICAO_FAIXA } from '@/lib/icp';
import { TabelaEmpresas, type ColunaOrdem } from './TabelaEmpresas';
import { ModalExportar } from './ModalExportar';
import { ModalSalvarLista } from './ModalSalvarLista';
import { EmpresaGaveta } from './EmpresaGaveta';
import { Icone } from './Icone';
import { api, useToast } from './util';

interface Segmento { id: number; nome: string; grupo: string; prioridade: 'alta' | 'media' | 'baixa' }
interface Regiao { id: number; nome: string; uf: string; qtd: number }
interface Municipio { codigo: string; nome: string }
interface Opcoes { segmentos: Segmento[]; regioes: Regiao[]; ufs: string[]; municipios: Municipio[]; icps: { id: number; nome: string; padrao: boolean }[] }
type Resultado = { total: number; empresas: Empresa[]; ms: number; icp: { id: number; nome: string } | null };

const PADRAO: FiltrosBusca = {
  ufs: ['RS'], situacoes: ['02'], modoSegmento: 'amplo', excluirMei: true, prospeccao: 'todas',
  ordenarPor: 'icp', limite: 200, umPorEmpresa: true, excluirClientes: true, segmentos: [], regioes: [], municipios: [], portes: [], potencial: [], icpFaixas: [],
};
const CHAVE = 'pinhosat.filtros';
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const CORES_FAIXA: Record<string, string> = { A: '#1f7a4f', B: '#3f8f6a', C: '#b8860b', D: '#8a949e' };
const ORDENACOES: [string, string][] = [
  ['icp', 'Score ICP'], ['potencial', 'Potencial de frota'], ['cidade', 'Cidade'], ['segmento', 'Segmento'],
  ['porte', 'Porte'], ['capital', 'Capital social'], ['abertura', 'Mais antigas'], ['razao_social', 'Razão social'],
];

/** Seção recolhível do painel de filtros, com contador de filtros ativos. */
function Secao({ titulo, ativos, aberta, children }: { titulo: string; ativos: number; aberta?: boolean; children: React.ReactNode }) {
  return (
    <details className="secao-filtro" open={aberta}>
      <summary>
        <Icone nome="seta" tamanho={14} className="seta" />
        <span>{titulo}</span>
        <span className="resumo">{ativos > 0 && <span className="contador">{ativos}</span>}</span>
      </summary>
      {children}
    </details>
  );
}

export function Busca() {
  const [op, setOp] = useState<Opcoes | null>(null);
  const [f, setF] = useState<FiltrosBusca>(PADRAO);
  const [municipiosNomes, setMunicipiosNomes] = useState<Record<string, string>>({});
  const [buscaMun, setBuscaMun] = useState('');
  const [cnaesTexto, setCnaesTexto] = useState('');
  const [res, setRes] = useState<Resultado | null>(null);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [modal, setModal] = useState<'exportar' | 'salvar' | null>(null);
  const [filtrosUsados, setFiltrosUsados] = useState<FiltrosBusca | null>(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
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

  // Folha de filtros no celular: trava a rolagem da página por trás.
  useEffect(() => {
    if (!filtrosAbertos) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [filtrosAbertos]);

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

  const gerar = async (sobrepor: Partial<FiltrosBusca> = {}, cnaesTxt = cnaesTexto) => {
    setCarregando(true);
    setErro(null);
    setFiltrosAbertos(false);
    const cnaes = cnaesTxt.split(/[,;\s]+/).map((c) => c.replace(/\D/g, '')).filter((c) => c.length === 7);
    const filtros = { ...f, cnaes, pagina: 0, ...sobrepor };
    setF(filtros);
    try {
      try { localStorage.setItem(CHAVE, JSON.stringify({ f: { ...filtros, pagina: 0 }, municipiosNomes })); } catch { /* ignora */ }
      const r = await api<Resultado>('/api/busca', { body: filtros });
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

  // ----- Contagem por seção e chips de filtros ativos -----
  const nomeSeg = (id: number) => op?.segmentos.find((s) => s.id === id)?.nome ?? `Segmento ${id}`;
  const nomeReg = (id: number) => op?.regioes.find((r) => r.id === id)?.nome ?? `Região ${id}`;
  const situacoesPadrao = (f.situacoes ?? []).join() === '02';
  const ativos: { rotulo: string; secao: string; remover: Partial<FiltrosBusca> | (() => Partial<FiltrosBusca>) }[] = [];
  if (f.texto) ativos.push({ rotulo: `“${f.texto}”`, secao: 'texto', remover: { texto: '' } });
  if (f.icpFaixas?.length) ativos.push({ rotulo: `Faixa ICP ${f.icpFaixas.join(', ')}`, secao: 'icp', remover: { icpFaixas: [] } });
  for (const id of f.segmentos ?? []) ativos.push({ rotulo: nomeSeg(id), secao: 'seg', remover: () => ({ segmentos: (f.segmentos ?? []).filter((x) => x !== id) }) });
  if (f.modoSegmento === 'principal') ativos.push({ rotulo: 'Só CNAE principal', secao: 'seg', remover: { modoSegmento: 'amplo' } });
  if (cnaesTexto.trim()) ativos.push({ rotulo: `CNAEs: ${cnaesTexto.trim()}`, secao: 'seg', remover: {} });
  if ((f.ufs ?? []).join() !== 'RS') ativos.push({ rotulo: `UF: ${(f.ufs ?? []).join(', ') || 'todas'}`, secao: 'loc', remover: { ufs: ['RS'] } });
  for (const id of f.regioes ?? []) ativos.push({ rotulo: nomeReg(id), secao: 'loc', remover: () => ({ regioes: (f.regioes ?? []).filter((x) => x !== id) }) });
  for (const m of f.municipios ?? []) ativos.push({ rotulo: municipiosNomes[m] ?? m, secao: 'loc', remover: () => ({ municipios: (f.municipios ?? []).filter((x) => x !== m) }) });
  if (f.cep) ativos.push({ rotulo: `CEP ${f.cep}…`, secao: 'loc', remover: { cep: '' } });
  if (!situacoesPadrao) ativos.push({ rotulo: `Situação: ${(f.situacoes ?? []).map((s) => SITUACAO_CADASTRAL[s]).join(', ')}`, secao: 'cad', remover: { situacoes: ['02'] } });
  if (f.portes?.length) ativos.push({ rotulo: `Porte: ${f.portes.map((p) => PORTE[p]).join(', ')}`, secao: 'cad', remover: { portes: [] } });
  if (f.excluirMei === false) ativos.push({ rotulo: 'Incluindo MEI', secao: 'cad', remover: { excluirMei: true } });
  if (f.matrizFilial && f.matrizFilial !== 'todas') ativos.push({ rotulo: f.matrizFilial === 'matriz' ? 'Só matriz' : 'Só filial', secao: 'cad', remover: { matrizFilial: 'todas' } });
  if (f.capitalMin !== undefined) ativos.push({ rotulo: `Capital ≥ R$ ${f.capitalMin.toLocaleString('pt-BR')}`, secao: 'cad', remover: { capitalMin: undefined } });
  if (f.idadeMinAnos !== undefined) ativos.push({ rotulo: `≥ ${f.idadeMinAnos} anos`, secao: 'cad', remover: { idadeMinAnos: undefined } });
  if (f.idadeMaxAnos !== undefined) ativos.push({ rotulo: `≤ ${f.idadeMaxAnos} anos`, secao: 'cad', remover: { idadeMaxAnos: undefined } });
  const flags: [keyof FiltrosBusca, string][] = [['comTelefone', 'Com telefone'], ['comCelular', 'Com celular'], ['comEmail', 'Com e-mail'],
    ['comEmailCorporativo', 'E-mail com domínio próprio'], ['comSite', 'Site verificado'], ['somenteRntrcAtivo', 'RNTRC ativo']];
  for (const [k, r] of flags) if (f[k]) ativos.push({ rotulo: r, secao: 'com', remover: { [k]: false } });
  if (f.potencial?.length) ativos.push({ rotulo: `Potencial: ${f.potencial.map((n) => NIVEL_POTENCIAL[n]).join(', ')}`, secao: 'com', remover: { potencial: [] } });
  if (f.prospeccao && f.prospeccao !== 'todas') ativos.push({
    rotulo: { fora_da_base: 'Fora da minha base', nao_contatadas: 'Não contatadas', na_base: 'Já na base' }[f.prospeccao], secao: 'com', remover: { prospeccao: 'todas' },
  });
  const porSecao = (s: string) => ativos.filter((a) => a.secao === s).length;

  const removerChip = (a: (typeof ativos)[number]) => {
    const mudanca = typeof a.remover === 'function' ? a.remover() : a.remover;
    if (a.rotulo.startsWith('CNAEs:')) { setCnaesTexto(''); if (res) gerar(mudanca, ''); else set('cnaes', []); return; }
    if (res) gerar(mudanca); else setF((x) => ({ ...x, ...mudanca }));
  };

  // ----- Buscas rápidas (estado vazio) -----
  const idSeg = (nome: string) => op?.segmentos.find((s) => s.nome === nome)?.id;
  const idReg = (nome: string) => op?.regioes.find((r) => r.nome === nome)?.id;
  const atalhos: { titulo: string; desc: string; icone: string; filtros: Partial<FiltrosBusca> }[] = [
    { titulo: 'Transportadoras na Grande POA', desc: 'Com telefone e fora da minha base', icone: 'caminhao',
      filtros: { segmentos: [idSeg('Transportadoras de cargas')!].filter(Boolean), regioes: [idReg('Grande Porto Alegre (RMPA)')!].filter(Boolean), comTelefone: true, prospeccao: 'fora_da_base' } },
    { titulo: 'Desentupidoras no eixo Sapucaia–POA', desc: 'Limpa-fossa e hidrojateamento com contato', icone: 'alvo',
      filtros: { segmentos: [idSeg('Desentupimento, limpa-fossa e hidrojateamento')!].filter(Boolean), regioes: [idReg('Eixo prioritário PinhoSat (Sapucaia–POA)')!].filter(Boolean), comTelefone: true } },
    { titulo: 'Distribuidoras com frota registrada', desc: 'Bebidas e alimentos com RNTRC ativo', icone: 'lista',
      filtros: { segmentos: [idSeg('Distribuidoras de bebidas')!, idSeg('Distribuidoras de alimentos')!].filter(Boolean), somenteRntrcAtivo: true, regioes: [] } },
    { titulo: 'Faixa A do ICP no Vale dos Sinos', desc: 'Todos os segmentos, melhor aderência', icone: 'grafico',
      filtros: { segmentos: [], icpFaixas: ['A'], regioes: [idReg('Vale dos Sinos')!].filter(Boolean) } },
  ];

  const visiveis = (res?.empresas ?? []).filter((e) => !ocultos.has(e.cnpj));
  const selecionadas = [...sel];
  const faixas = { A: 0, B: 0, C: 0, D: 0 } as Record<string, number>;
  visiveis.forEach((e) => { if (e.icp) faixas[e.icp.faixa]++; });

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
      gerar({ pagina: f.pagina ?? 0 });
    } catch (e) { mostrar((e as Error).message); }
  };

  const verificarSites = async () => {
    const alvo = visiveis.filter((e) => sel.has(e.cnpj) && e.siteProvavel).map((e) => e.cnpj).slice(0, 100);
    if (!alvo.length) { mostrar('Nenhuma empresa selecionada tem e-mail com domínio próprio.'); return; }
    mostrar(`Verificando ${alvo.length} domínios…`);
    try {
      const r = await api<{ verificados: number; encontrados: number }>('/api/verificar-sites', { body: { cnpjs: alvo } });
      mostrar(`${r.encontrados} de ${r.verificados} domínios responderam como site.`);
      gerar({ pagina: f.pagina ?? 0 });
    } catch (e) { mostrar((e as Error).message); }
  };

  const limite = f.limite ?? 200;
  const paginas = res ? Math.ceil(res.total / limite) : 0;
  const pagina = f.pagina ?? 0;
  const totalFaixas = Object.values(faixas).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="busca">
      {/* ---------------- Filtros ---------------- */}
      <aside className={`cartao painel-filtros ${filtrosAbertos ? 'aberto' : ''}`} aria-label="Filtros">
        <div className="titulo-filtros">
          <strong>Filtros {ativos.length > 0 && <span className="contador">{ativos.length}</span>}</strong>
          <button className="btn icone fantasma" onClick={() => setFiltrosAbertos(false)} aria-label="Fechar filtros"
            style={{ visibility: filtrosAbertos ? 'visible' : 'hidden' }}><Icone nome="fechar" /></button>
        </div>
        <div className="rolagem">
          <Secao titulo="Perfil de cliente ideal" ativos={porSecao('icp')} aberta>
            <label htmlFor="icp" style={{ marginTop: 4 }}>Perfil usado no score</label>
            <select id="icp" value={f.icpId ?? ''} onChange={(e) => set('icpId', e.target.value ? Number(e.target.value) : undefined)}>
              {(op?.icps ?? []).map((i) => <option key={i.id} value={i.padrao ? '' : i.id}>{i.nome}{i.padrao ? ' (padrão)' : ''}</option>)}
            </select>
            <label>Faixas</label>
            <div className="chips">
              {(['A', 'B', 'C', 'D'] as const).map((x) => (
                <label key={x} className="check" style={{ margin: 0 }} title={DESCRICAO_FAIXA[x]}>
                  <input type="checkbox" checked={!!f.icpFaixas?.includes(x)} onChange={(e) => alternar('icpFaixas', x, e.target.checked)} />
                  <span className="icp"><span className={`letra ${x}`}>{x}</span></span>
                </label>
              ))}
            </div>
          </Secao>

          <Secao titulo="Segmentos" ativos={porSecao('seg')} aberta>
            <div className="linha" style={{ margin: '6px 0' }}>
              <button className="btn pequeno" onClick={() => set('segmentos', (op?.segmentos ?? []).filter((s) => s.prioridade === 'alta').map((s) => s.id))}>Todos de prioridade alta</button>
              {!!f.segmentos?.length && <button className="btn pequeno fantasma" onClick={() => set('segmentos', [])}>Limpar</button>}
            </div>
            {grupos.map(([g, segs]) => {
              const n = segs.filter((s) => f.segmentos?.includes(s.id)).length;
              return (
                <details key={g} className="grupo-seg" open={n > 0 || g === 'Transporte e logística'}>
                  <summary>{g} {n > 0 && <span className="contador">{n}</span>}</summary>
                  {segs.map((s) => (
                    <label key={s.id} className="check">
                      <input type="checkbox" checked={!!f.segmentos?.includes(s.id)} onChange={(e) => alternar('segmentos', s.id, e.target.checked)} />
                      <span>{s.nome} {s.prioridade === 'alta' && <span className="pilula ok">alta</span>}</span>
                    </label>
                  ))}
                </details>
              );
            })}
            <label htmlFor="modo">Correspondência</label>
            <select id="modo" value={f.modoSegmento} onChange={(e) => set('modoSegmento', e.target.value as FiltrosBusca['modoSegmento'])}>
              <option value="amplo">Ampla — CNAE principal, secundário ou nome</option>
              <option value="principal">Restrita — só CNAE principal</option>
            </select>
            <label htmlFor="cnaes">CNAEs adicionais</label>
            <input id="cnaes" type="text" value={cnaesTexto} placeholder="Ex.: 4930202, 3702900" onChange={(e) => setCnaesTexto(e.target.value)} />
          </Secao>

          <Secao titulo="Localização" ativos={porSecao('loc')} aberta>
            {!!op?.regioes.length && (<>
              <label style={{ marginTop: 4 }}>Regiões</label>
              {op.regioes.map((r) => (
                <label key={r.id} className="check">
                  <input type="checkbox" checked={!!f.regioes?.includes(r.id)} onChange={(e) => alternar('regioes', r.id, e.target.checked)} />
                  <span>{r.nome} <span className="mudo">· {r.qtd} cidades</span></span>
                </label>
              ))}
            </>)}
            <label htmlFor="mun">Cidades {ufUnica ? `(${ufUnica})` : ''}</label>
            <input id="mun" type="search" value={buscaMun} disabled={!ufUnica} placeholder={ufUnica ? 'Digite o nome da cidade…' : 'Selecione um único estado'}
              onChange={(e) => setBuscaMun(e.target.value)} autoComplete="off" />
            {sugestoesMun.length > 0 && (
              <div className="sugestoes" role="listbox">
                {sugestoesMun.map((m) => (
                  <button key={m.codigo} role="option" aria-selected="false" onClick={() => {
                    set('municipios', [...(f.municipios ?? []), m.codigo]);
                    setMunicipiosNomes((x) => ({ ...x, [m.codigo]: m.nome }));
                    setBuscaMun('');
                  }}><Icone nome="mais" tamanho={14} /> {m.nome}</button>
                ))}
              </div>
            )}
            {!!f.municipios?.length && (
              <div className="chips" style={{ marginTop: 6, gap: 4 }}>
                {f.municipios.map((m) => (
                  <span key={m} className="chip">{municipiosNomes[m] ?? m}
                    <button aria-label={`Remover ${municipiosNomes[m] ?? m}`} onClick={() => alternar('municipios', m, false)}><Icone nome="fechar" tamanho={12} /></button></span>
                ))}
              </div>
            )}
            <div className="dois">
              <div>
                <label>Estado</label>
                <select value={(f.ufs ?? []).join()} onChange={(e) => { set('ufs', e.target.value ? e.target.value.split(',') : []); set('municipios', []); }}>
                  {(op?.ufs ?? ['RS']).map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  {(op?.ufs?.length ?? 0) > 1 && <option value="">Todos</option>}
                </select>
              </div>
              <div>
                <label htmlFor="cep">CEP (início)</label>
                <input id="cep" type="text" inputMode="numeric" value={f.cep ?? ''} placeholder="Ex.: 932" onChange={(e) => set('cep', e.target.value)} />
              </div>
            </div>
          </Secao>

          <Secao titulo="Contato e prospecção" ativos={porSecao('com')}>
            {flags.map(([k, r]) => (
              <label key={k} className="check"><input type="checkbox" checked={!!f[k]} onChange={(e) => set(k, e.target.checked as never)} /> {r === 'Com celular' ? 'Com celular (possível WhatsApp)' : r === 'RNTRC ativo' ? 'Somente com RNTRC ativo (ANTT)' : r}</label>
            ))}
            <label htmlFor="prosp">Base de prospecção</label>
            <select id="prosp" value={f.prospeccao} onChange={(e) => set('prospeccao', e.target.value as FiltrosBusca['prospeccao'])}>
              <option value="todas">Todas as empresas</option>
              <option value="fora_da_base">Somente fora da minha base</option>
              <option value="nao_contatadas">Ainda não contatadas</option>
              <option value="na_base">Somente já na base</option>
            </select>
            <label>Potencial de frota</label>
            <div className="chips">
              {(Object.keys(NIVEL_POTENCIAL) as (keyof typeof NIVEL_POTENCIAL)[]).map((n) => (
                <label key={n} className="check" style={{ margin: 0 }}>
                  <input type="checkbox" checked={!!f.potencial?.includes(n)} onChange={(e) => alternar('potencial', n, e.target.checked)} /> {NIVEL_POTENCIAL[n]}
                </label>
              ))}
            </div>
          </Secao>

          <Secao titulo="Dados cadastrais" ativos={porSecao('cad')}>
            <label style={{ marginTop: 4 }}>Situação cadastral</label>
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
                <label htmlFor="cap">Capital mín. (R$)</label>
                <input id="cap" type="number" inputMode="numeric" min={0} step={10000} value={f.capitalMin ?? ''} onChange={(e) => set('capitalMin', e.target.value === '' ? undefined : Number(e.target.value))} />
              </div>
              <div>
                <label htmlFor="imin">Atividade mín. (anos)</label>
                <input id="imin" type="number" inputMode="numeric" min={0} value={f.idadeMinAnos ?? ''} onChange={(e) => set('idadeMinAnos', e.target.value === '' ? undefined : Number(e.target.value))} />
              </div>
              <div>
                <label htmlFor="imax">Atividade máx. (anos)</label>
                <input id="imax" type="number" inputMode="numeric" min={0} value={f.idadeMaxAnos ?? ''} onChange={(e) => set('idadeMaxAnos', e.target.value === '' ? undefined : Number(e.target.value))} />
              </div>
            </div>
          </Secao>

          <Secao titulo="Opções da lista" ativos={0}>
            <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={f.umPorEmpresa ?? false} onChange={(e) => set('umPorEmpresa', e.target.checked)} /> Um estabelecimento por empresa (o de melhor score)</label>
            <label className="check"><input type="checkbox" checked={f.excluirClientes ?? true} onChange={(e) => set('excluirClientes', e.target.checked)} /> Excluir quem já é cliente</label>
            <label htmlFor="lim">Resultados por página</label>
            <select id="lim" value={limite} onChange={(e) => set('limite', Number(e.target.value))}>
              {[50, 100, 200, 500, 1000, 2000, 5000].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <p className="mudo">Empresas marcadas como “Não prospectar” nunca aparecem nas buscas.</p>
          </Secao>
        </div>
        <div className="rodape-filtros">
          <button className="btn" onClick={() => { setF({ ...PADRAO, icpId: f.icpId }); setCnaesTexto(''); }}>Limpar</button>
          <button className="btn primario" style={{ flex: 1 }} onClick={() => gerar()} disabled={carregando}>
            <Icone nome="busca" tamanho={16} />{carregando ? 'Buscando…' : filtrosAbertos ? 'Ver resultados' : 'Gerar lista'}
          </button>
        </div>
      </aside>

      {/* ---------------- Resultados ---------------- */}
      <div className="area-resultados">
        <div className="cartao barra-busca">
          <div className="campo-busca">
            <Icone nome="busca" />
            <input type="search" value={f.texto ?? ''} aria-label="Buscar por nome, CNPJ ou atividade" enterKeyHint="search"
              placeholder="Nome, CNPJ ou atividade — ex.: desentupidora, 12.345.678/0001-90"
              onChange={(e) => set('texto', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && gerar()} />
          </div>
          <button className="btn so-celular-flex" onClick={() => setFiltrosAbertos(true)} aria-label="Abrir filtros">
            <Icone nome="filtro" tamanho={16} />Filtros {ativos.length > 0 && <span className="contador">{ativos.length}</span>}
          </button>
          <button className="btn primario" onClick={() => gerar()} disabled={carregando}>{carregando ? 'Buscando…' : 'Gerar lista'}</button>
        </div>

        {ativos.length > 0 && (
          <div className="filtros-ativos" aria-label="Filtros ativos">
            <span className="rotulo">Filtros:</span>
            {ativos.map((a, i) => (
              <span key={i} className="chip">{a.rotulo}
                <button aria-label={`Remover filtro ${a.rotulo}`} onClick={() => removerChip(a)}><Icone nome="fechar" tamanho={12} /></button>
              </span>
            ))}
            <button className="btn pequeno fantasma" onClick={() => { const limpo = { ...PADRAO, icpId: f.icpId }; setCnaesTexto(''); if (res) gerar(limpo, ''); else setF(limpo); }}>Limpar tudo</button>
          </div>
        )}

        <section className="cartao" aria-label="Resultados" aria-busy={carregando}>
          {erro && <div className="erro-box" style={{ margin: 12 }}>{erro}</div>}

          {!res && !carregando && (
            <div className="vazio-busca">
              <h2>Por onde começar?</h2>
              <p className="sub">Escolha uma busca pronta ou monte a sua com os filtros. O score ICP ordena as empresas pela aderência ao cliente ideal.</p>
              <div className="atalhos">
                {atalhos.map((a) => (
                  <button key={a.titulo} className="atalho" onClick={() => gerar({ ...PADRAO, icpId: f.icpId, ...a.filtros }, '')} disabled={!op}>
                    <span className="ico"><Icone nome={a.icone} /></span>
                    <span><strong>{a.titulo}</strong><span>{a.desc}</span></span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {carregando && (
            <div className="esqueleto" aria-label="Carregando">
              {Array.from({ length: 6 }, (_, i) => <div key={i} />)}
            </div>
          )}

          {res && !carregando && (<>
            <div className="resumo-resultado">
              <div>
                <div className="total"><strong>{res.total.toLocaleString('pt-BR')}</strong> empresas</div>
                <div className="meta">
                  {res.total > visiveis.length ? `mostrando ${visiveis.length} · ` : ''}{(res.ms / 1000).toFixed(1)} s{res.icp ? ` · ICP “${res.icp.nome}”` : ''}
                </div>
              </div>
              {res.icp && visiveis.length > 0 && (
                <div className="legenda-faixas" title="Distribuição por faixa do ICP nesta página">
                  <div className="distribuicao">
                    {(['A', 'B', 'C', 'D'] as const).map((x) => <span key={x} style={{ width: `${(100 * faixas[x]) / totalFaixas}%`, background: CORES_FAIXA[x] }} />)}
                  </div>
                  {(['A', 'B', 'C', 'D'] as const).map((x) => <span key={x} className="icp"><span className={`letra ${x}`}>{x}</span>{faixas[x]}</span>)}
                </div>
              )}
              <div className="direita">
                <label htmlFor="ord" className="mudo" style={{ margin: 0 }}>Ordenar</label>
                <select id="ord" value={f.ordenarPor} onChange={(e) => gerar({ ordenarPor: e.target.value as FiltrosBusca['ordenarPor'] })} style={{ width: 'auto' }}>
                  {ORDENACOES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </div>
            </div>

            {sel.size > 0 && (
              <div className="barra-selecao" role="toolbar" aria-label="Ações para as selecionadas">
                <strong>{sel.size} selecionada{sel.size === 1 ? '' : 's'}</strong>
                <button className="btn" onClick={() => setModal('salvar')}><Icone nome="salvar" tamanho={16} />Salvar</button>
                <button className="btn primario" onClick={() => setModal('exportar')}><Icone nome="baixar" tamanho={16} />Exportar</button>
                <select className="so-desktop" aria-label="Alterar status das selecionadas" value="" onChange={(e) => statusLote(e.target.value)}>
                  <option value="">Marcar status…</option>
                  {Object.entries(STATUS_PROSPECCAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button className="btn so-desktop" onClick={verificarSites} title="Testa se o domínio do e-mail corporativo tem site">Verificar sites</button>
                <button className="btn so-desktop" onClick={() => { setOcultos((o) => new Set([...o, ...sel])); setSel(new Set()); }}>Remover da lista</button>
                <button className="btn icone fantasma" onClick={() => setSel(new Set())} aria-label="Limpar seleção"><Icone nome="fechar" /></button>
              </div>
            )}

            {visiveis.length === 0 ? (
              <div className="carregando">
                <p><strong>Nenhuma empresa encontrada.</strong></p>
                <p>Remova algum filtro acima, use a correspondência ampla ou inclua mais cidades.</p>
              </div>
            ) : (
              <div data-resultado>
                <TabelaEmpresas
                  empresas={visiveis}
                  selecionados={sel}
                  onSelecionar={(c, on) => setSel((s) => { const n = new Set(s); if (on) n.add(c); else n.delete(c); return n; })}
                  onSelecionarTodos={(on) => setSel(on ? new Set(visiveis.map((e) => e.cnpj)) : new Set())}
                  ordem={f.ordenarPor as ColunaOrdem}
                  onOrdenar={(c) => gerar({ ordenarPor: c })}
                  onAbrir={setAberta}
                  aberta={aberta}
                  acaoLinha={(e) => (
                    <button className="btn icone pequeno fantasma" title="Remover desta lista" aria-label="Remover desta lista"
                      onClick={() => { setOcultos((o) => new Set([...o, e.cnpj])); setSel((s) => { const n = new Set(s); n.delete(e.cnpj); return n; }); }}>
                      <Icone nome="fechar" tamanho={15} />
                    </button>
                  )}
                />
              </div>
            )}
            {paginas > 1 && (
              <div className="paginacao">
                <span>Página {pagina + 1} de {paginas}</span>
                <button className="btn" disabled={!pagina} onClick={() => gerar({ pagina: pagina - 1 })}><Icone nome="voltar" tamanho={16} />Anterior</button>
                <button className="btn" disabled={pagina + 1 >= paginas} onClick={() => gerar({ pagina: pagina + 1 })}>Próxima<Icone nome="seta" tamanho={16} /></button>
              </div>
            )}
          </>)}
        </section>
      </div>

      {aberta && <EmpresaGaveta cnpj={aberta} icpId={res?.icp?.id} onFechar={() => setAberta(null)} onAtualizado={(m) => { mostrar(m); gerar({ pagina }); }} />}
      {modal === 'exportar' && <ModalExportar cnpjs={selecionadas} icpId={res?.icp?.id} onFechar={() => setModal(null)} />}
      {modal === 'salvar' && (
        <ModalSalvarLista cnpjs={selecionadas} empresas={visiveis.filter((e) => sel.has(e.cnpj))} filtros={filtrosUsados} nomeSugerido={nomeSugerido}
          onFechar={() => setModal(null)} onSalvo={(m) => { mostrar(m); gerar({ pagina }); }} />
      )}
      <Toast />
    </div>
  );
}
