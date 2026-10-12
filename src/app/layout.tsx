import './globals.css';
import type { Metadata } from 'next';
import RouteTransition from './RouteTransition';

export const metadata: Metadata = {
  title: 'UNI-CET | Gestão de laboratórios',
  description: 'Sistema institucional de reserva de laboratórios de informática',
  icons: { icon: '/logo-empresa.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <RouteTransition>{children}</RouteTransition>
      </body>
    </html>
  );
}
