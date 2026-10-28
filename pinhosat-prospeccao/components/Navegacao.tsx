'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Importacao { fonte: string; referencia: string; registros: number }

export function Navegacao() {
  const path = usePathname();
  const [base, setBase] = useState<Importacao[]>([]);
  useEffect(() => {
    fetch('/api/opcoes').then((r) => r.json()).then((d) => setBase(d.importacoes ?? [])).catch(() => {});
  }, []);
  const itens = [
    ['/', 'Buscar empresas'],
    ['/listas', 'Listas salvas'],
    ['/acompanhamento', 'Acompanhamento'],
    ['/configuracoes', 'Segmentos e regiões'],
  ];
  const rf = base.find((b) => b.fonte === 'receita_federal');
  const ant = base.find((b) => b.fonte === 'rntrc');
  return (
    <header className="topo">
      <div className="marca">PinhoSat <span>Prospecção</span></div>
      <nav className="nav">
        {itens.map(([href, rotulo]) => (
          <Link key={href} href={href} className={(href === '/' ? path === '/' : path.startsWith(href)) ? 'ativo' : ''}>{rotulo}</Link>
        ))}
      </nav>
      <div className="base-info">
        {rf ? <>Base RF {rf.referencia} · {Number(rf.registros).toLocaleString('pt-BR')} estabelecimentos</> : 'Base não importada'}
        {ant ? <> · RNTRC {ant.referencia}</> : null}
      </div>
    </header>
  );
}
