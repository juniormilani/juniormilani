// Geração de CSV / XLSX.
import ExcelJS from 'exceljs';
import type { Empresa } from './empresa';
import type { CampoExportacao } from './campos';

export { CAMPOS, CAMPOS_PADRAO, camposSelecionados } from './campos';

/** CSV com ";" e BOM UTF-8 — abre corretamente no Excel em português. */
export function gerarCsv(empresas: Empresa[], campos: CampoExportacao[]): string {
  const cel = (v: string | number | null) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    // Evita injeção de fórmula ao abrir no Excel.
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = [campos.map((c) => cel(c.rotulo)).join(';')];
  for (const e of empresas) linhas.push(campos.map((c) => cel(c.valor(e))).join(';'));
  return '﻿' + linhas.join('\r\n') + '\r\n';
}

export async function gerarXlsx(empresas: Empresa[], campos: CampoExportacao[], titulo: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PinhoSat Prospecção';
  wb.created = new Date();
  const ws = wb.addWorksheet((titulo || 'Leads').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  ws.columns = campos.map((c) => ({ header: c.rotulo, key: c.chave, width: c.largura }));
  for (const e of empresas) {
    const linha: Record<string, string | number | null> = {};
    for (const c of campos) {
      const v = c.valor(e);
      linha[c.chave] = typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v;
    }
    ws.addRow(linha);
  }
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E3D' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: campos.length } };
  const meta = wb.addWorksheet('Sobre');
  meta.addRows([
    ['Gerado em', new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })],
    ['Empresas', empresas.length],
    ['Fontes', 'Receita Federal — Dados Abertos CNPJ; ANTT — RNTRC; contatos complementares com fonte indicada'],
    ['Observação', 'Campos "Não encontrado" não foram localizados nas fontes. Celular não confirma WhatsApp.'],
    ['LGPD', 'Uso restrito à prospecção comercial B2B da PinhoSat. Respeite pedidos de não contato.'],
  ]);
  meta.getColumn(1).width = 14;
  meta.getColumn(2).width = 100;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
