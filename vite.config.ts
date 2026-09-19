/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

/**
 * Le commit permet de savoir exactement quelle version est en ligne. Absent d'une
 * archive sans historique git, auquel cas on l'omet plutôt que d'afficher un leurre.
 */
function currentCommit(): string {
  const fromCI = process.env.GITHUB_SHA;
  if (fromCI) return fromCI.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

// Le dépôt est publié sur https://fnovellon.github.io/Memo/ : le base path doit
// correspondre au nom du dépôt, sinon les assets sont introuvables en production.
export default defineConfig({
  base: '/Memo/',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(currentCommit()),
  },
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
