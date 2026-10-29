// Validação e extração de CNPJs de texto livre (planilhas coladas, CSV, exportações de outros sistemas).

export function cnpjValido(c: string): boolean {
  if (!/^\d{14}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + p * Number(base[i]), 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}

/** Extrai CNPJs (com ou sem pontuação) de um texto; separa válidos e inválidos (dígito verificador). */
export function extrairCnpjs(texto: string): { validos: string[]; invalidos: string[] } {
  const achados = texto.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) ?? [];
  const validos = new Set<string>();
  const invalidos = new Set<string>();
  for (const a of achados) {
    const d = a.replace(/\D/g, '');
    (cnpjValido(d) ? validos : invalidos).add(d);
  }
  return { validos: [...validos], invalidos: [...invalidos] };
}
