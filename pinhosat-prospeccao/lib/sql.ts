/** Acumula parâmetros posicionais ($1, $2...) de uma consulta. */
export class Params {
  readonly valores: unknown[] = [];
  add(v: unknown): string {
    this.valores.push(v);
    return `$${this.valores.length}`;
  }
}

/** Literal de texto SQL (só para textos fixos do código, nunca para entrada do usuário). */
export const txt = (s: string) => `'${s.replace(/'/g, "''")}'`;
