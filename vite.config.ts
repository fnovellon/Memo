/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Le dépôt est publié sur https://fnovellon.github.io/Memo/ : le base path doit
// correspondre au nom du dépôt, sinon les assets sont introuvables en production.
export default defineConfig({
  base: '/Memo/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'Memo — vocabulaire',
        short_name: 'Memo',
        description: 'Apprentissage de vocabulaire par répétition espacée.',
        lang: 'fr',
        start_url: '/Memo/',
        scope: '/Memo/',
        display: 'standalone',
        background_color: '#12121a',
        theme_color: '#12121a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
