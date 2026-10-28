import { Busca } from '@/components/Busca';

export default function Pagina() {
  return (
    <>
      <h1>Buscar empresas</h1>
      <p className="sub">Monte listas de prospecção por segmento, região e disponibilidade de contato. Dados públicos da Receita Federal e da ANTT, com a fonte de cada informação.</p>
      <Busca />
    </>
  );
}
