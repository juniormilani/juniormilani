'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from './Icone';

interface Importacao { fonte: string; referencia: string; registros: number }

const ITENS: { href: string; rotulo: string; curto: string; icone: string }[] = [
  { href: '/', rotulo: 'Buscar empresas', curto: 'Buscar', icone: 'busca' },
  { href: '/listas', rotulo: 'Listas salvas', curto: 'Listas', icone: 'lista' },
  { href: '/acompanhamento', rotulo: 'Acompanhamento', curto: 'Retornos', icone: 'agenda' },
  { href: '/analise', rotulo: 'Análise do ICP', curto: 'Análise', icone: 'grafico' },
  { href: '/configuracoes', rotulo: 'ICP e segmentos', curto: 'Ajustes', icone: 'ajustes' },
];

export function Navegacao() {
  const path = usePathname();
  const [base, setBase] = useState<Importacao[]>([]);
  useEffect(() => {
    fetch('/api/opcoes').then((r) => r.json()).then((d) => setBase(d.importacoes ?? [])).catch(() => {});
  }, []);
  const ativo = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  const rf = base.find((b) => b.fonte === 'receita_federal');
  const ant = base.find((b) => b.fonte === 'rntrc');
  return (
    <>
      <header className="topo">
        <Link href="/" className="marca" aria-label="PinhoSat Prospecção — início">
          <span className="logo"><Icone nome="caminhao" tamanho={17} /></span>
          <div>PinhoSat <span>Prospecção</span></div>
        </Link>
        <nav className="nav" aria-label="Principal">
          {ITENS.map((i) => (
            <Link key={i.href} href={i.href} className={ativo(i.href) ? 'ativo' : ''} title={i.rotulo}>
              <Icone nome={i.icone} tamanho={16} /><span>{i.rotulo}</span>
            </Link>
          ))}
        </nav>
        <div className="base-info" title="Competência das bases de dados carregadas">
          <span className="ponto" />
          {rf ? <>RF {rf.referencia}<span className="texto-longo"> · {Number(rf.registros).toLocaleString('pt-BR')} estabelecimentos</span></> : 'Base não importada'}
          {ant ? <span className="texto-longo"> · RNTRC {ant.referencia}</span> : null}
        </div>
      </header>
      <nav className="tabbar" aria-label="Principal (celular)">
        {ITENS.map((i) => (
          <Link key={i.href} href={i.href} className={ativo(i.href) ? 'ativo' : ''}>
            <Icone nome={i.icone} tamanho={21} /><span>{i.curto}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
