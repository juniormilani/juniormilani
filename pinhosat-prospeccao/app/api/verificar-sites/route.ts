import { ok, rota, corpo, cnpjs } from '@/lib/api';
import { query } from '@/lib/db';
import { usuarioDe } from '@/lib/auth';
import { empresasPorCnpj } from '@/lib/servico';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HOST_VALIDO = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*\.[a-z]{2,}$/;

async function responde(dominio: string): Promise<string | null> {
  for (const url of [`https://${dominio}`, `https://www.${dominio}`]) {
    try {
      const r = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'PinhoSat-Prospeccao/1.0 (verificacao de site)' } });
      await r.body?.cancel();
      if (r.status < 400) return url;
    } catch { /* sem resposta */ }
  }
  return null;
}

/**
 * Enriquecimento leve e legítimo: verifica se o domínio do e-mail corporativo (cadastrado na RF)
 * responde como site. Só acessa a página inicial pública; não coleta conteúdo.
 */
export const POST = rota(async (req: Request) => {
  const alvo = cnpjs((await corpo(req)).cnpjs, 100);
  const empresas = (await empresasPorCnpj(alvo)).filter((e) => e.siteProvavel && HOST_VALIDO.test(e.siteProvavel));
  const usuario = usuarioDe(req);
  let encontrados = 0;
  const fila = [...empresas];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let e = fila.shift(); e; e = fila.shift()) {
      const url = await responde(e.siteProvavel!);
      if (url) {
        encontrados++;
        await query(`insert into contatos (cnpj, tipo, valor, fonte, verificado, criado_por)
          values ($1, 'site', $2, $3, true, $4) on conflict do nothing`,
          [e.cnpj, url, `Domínio do e-mail cadastrado na RF — respondeu em ${new Date().toISOString().slice(0, 10)}`, usuario]);
      }
    }
  }));
  return ok({ verificados: empresas.length, encontrados });
});
