import type { Metadata } from 'next';
import './globals.css';
import { Navegacao } from '@/components/Navegacao';

export const metadata: Metadata = {
  title: 'PinhoSat Prospecção',
  description: 'Gerador de listas de prospecção B2B — uso interno da equipe comercial PinhoSat',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Navegacao />
        <main>{children}</main>
      </body>
    </html>
  );
}
