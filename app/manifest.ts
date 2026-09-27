import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Alergia',
    short_name: 'Alergia',
    description: 'Jogo de dedução social presencial.',
    lang: 'pt-BR',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#09090d',
    theme_color: '#09090d',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
