import { rota, corpo, cnpjs, ErroValidacao } from '@/lib/api';
import { query } from '@/lib/db';
import { usuarioDe } from '@/lib/auth';
import { camposSelecionados, gerarCsv, gerarXlsx } from '@/lib/exportar';
import { empresasPorCnpj } from '@/lib/servico';

export const dynamic = 'force-dynamic';

export const POST = rota(async (req: Request) => {
  const b = await corpo(req);
  const formato = b.formato === 'csv' ? 'csv' : 'xlsx';
  const listaId = b.listaId !== undefined && b.listaId !== null ? Number(b.listaId) : null;
  let alvo: string[];
  let titulo = 'Leads PinhoSat';
  if (listaId !== null) {
    if (!Number.isInteger(listaId)) throw new ErroValidacao('Lista inválida.');
    const [l] = await query<{ nome: string }>('select nome from listas where id = $1', [listaId]);
    if (!l) throw new ErroValidacao('Lista não encontrada.');
    titulo = l.nome;
    alvo = b.cnpjs ? cnpjs(b.cnpjs) : (await query<{ cnpj: string }>('select cnpj from lista_itens where lista_id = $1', [listaId])).map((r) => r.cnpj);
  } else {
    alvo = cnpjs(b.cnpjs);
  }
  if (!alvo.length) throw new ErroValidacao('Nenhuma empresa selecionada.');
  const campos = camposSelecionados(b.campos);
  if (!campos.length) throw new ErroValidacao('Selecione ao menos um campo.');
  const icpId = Number.isInteger(Number(b.icpId)) && b.icpId !== null && b.icpId !== undefined ? Number(b.icpId) : undefined;
  const empresas = await empresasPorCnpj(alvo, undefined, icpId);
  await query('insert into exportacoes (lista_id, formato, quantidade, campos, usuario) values ($1, $2, $3, $4, $5)',
    [listaId, formato, empresas.length, campos.map((c) => c.chave), usuarioDe(req)]);

  const nomeArq = `${titulo.normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'leads'}-${new Date().toISOString().slice(0, 10)}`;
  if (formato === 'csv') {
    return new Response(gerarCsv(empresas, campos), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nomeArq}.csv"`,
      },
    });
  }
  const buf = await gerarXlsx(empresas, campos, titulo);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeArq}.xlsx"`,
    },
  });
});
