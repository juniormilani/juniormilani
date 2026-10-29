import type { Metadata } from 'next';
import './globals.css';
import { Navegacao } from '@/components/Navegacao';

export const metadata: Metadata = {
  title: 'PinhoSat Prospecção',
  description: 'Gerador de listas de prospecção B2B — uso interno da equipe comercial PinhoSat',
  robots: { index: false, follow: false },
};

// Aplica o tema escolhido antes da primeira pintura (sem "piscar" claro → escuro).
const SCRIPT_TEMA = `try{var t=localStorage.getItem('pinhosat.tema');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        <Navegacao />
        <main>{children}</main>
      </body>
    </html>
  );
}
