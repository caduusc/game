import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Alergia',
  description: 'Alergia — jogo de dedução social presencial. Cada um no seu celular, todos na mesma sala.',
  applicationName: 'Alergia',
  appleWebApp: { capable: true, title: 'Alergia', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#09090d',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
