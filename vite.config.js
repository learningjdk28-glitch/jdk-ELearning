import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pclu-seal.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'JDK Learning System',
        short_name: 'JDK Learning',
        description: 'Offline-first adaptive learning for digital literacy.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#4f46e5',
        background_color: '#f5f7ff',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole app shell so lessons, quizzes, and the glossary load offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // A new version takes over right away instead of waiting for every tab to close.
        skipWaiting: true,
        clientsClaim: true,
        // Supabase API calls are never cached: offline writes go through IndexedDB instead.
      },
    }),
  ],
});
