import { Busca } from '@/components/Busca';

export default function Pagina() {
  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Buscar empresas</h1>
          <p className="sub">Listas de prospecção por segmento, região e contato, ordenadas pelo score ICP. Dados públicos da Receita Federal e da ANTT, com a fonte de cada informação.</p>
        </div>
      </div>
      <Busca />
    </>
  );
}
