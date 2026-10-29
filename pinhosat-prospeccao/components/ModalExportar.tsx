'use client';
import { useState } from 'react';
import { CAMPOS, CAMPOS_PADRAO } from '@/lib/campos';
import { baixar } from './util';

const CHAVE = 'pinhosat.camposExportacao';

function camposIniciais(): string[] {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? 'null');
    if (Array.isArray(salvo) && salvo.length) return salvo;
  } catch { /* sem localStorage */ }
  return CAMPOS_PADRAO;
}

export function ModalExportar({ cnpjs, listaId, icpId, onFechar }: { cnpjs?: string[]; listaId?: number; icpId?: number; onFechar: () => void }) {
  const [campos, setCampos] = useState<string[]>(camposIniciais);
  const [formato, setFormato] = useState<'xlsx' | 'csv'>('xlsx');
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  const alternar = (c: string, on: boolean) => setCampos((xs) => (on ? [...xs, c] : xs.filter((x) => x !== c)));
  const exportar = async () => {
    setGerando(true);
    setErro(null);
    try {
      try { localStorage.setItem(CHAVE, JSON.stringify(campos)); } catch { /* ignora */ }
      await baixar('/api/exportar', { cnpjs, listaId, icpId, campos, formato });
      onFechar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando(false);
    }
  };
  const qtd = cnpjs?.length;
  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Exportar">
        <h2>Exportar {qtd !== undefined ? `${qtd} empresa${qtd === 1 ? '' : 's'}` : 'lista'}</h2>
        <div className="linha">
          <label className="check"><input type="radio" checked={formato === 'xlsx'} onChange={() => setFormato('xlsx')} /> Excel (.xlsx)</label>
          <label className="check"><input type="radio" checked={formato === 'csv'} onChange={() => setFormato('csv')} /> CSV (; — abre no Excel)</label>
        </div>
        <h3>Campos</h3>
        <div className="linha" style={{ marginBottom: 6 }}>
          <button className="btn pequeno" onClick={() => setCampos(CAMPOS.map((c) => c.chave))}>Todos</button>
          <button className="btn pequeno" onClick={() => setCampos(CAMPOS_PADRAO)}>Padrão</button>
          <button className="btn pequeno" onClick={() => setCampos(['razao_social', 'nome_fantasia', 'cnpj', 'cidade', 'telefone', 'celular', 'email'])}>Só contato</button>
        </div>
        <div className="grade-campos">
          {CAMPOS.map((c) => (
            <label key={c.chave} className="check">
              <input type="checkbox" checked={campos.includes(c.chave)} onChange={(e) => alternar(c.chave, e.target.checked)} /> {c.rotulo}
            </label>
          ))}
        </div>
        {erro && <div className="erro-box">{erro}</div>}
        <div className="rodape">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn primario" disabled={gerando || !campos.length} onClick={exportar}>{gerando ? 'Gerando…' : 'Baixar arquivo'}</button>
        </div>
      </div>
    </div>
  );
}
