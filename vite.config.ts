import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // 👈 Import the modern plugin

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(), // 👈 Activate Tailwind here
    {
      name: 'workpulse-offline-shell',
      generateBundle(_options, bundle) {
        const assets = Object.keys(bundle).filter(name => /\.(?:js|css)$/.test(name));
        const version = assets.join('|');
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = 'workpulse-shell-' + ${JSON.stringify(version)};
const ASSETS = ${JSON.stringify(['/index.html', ...assets.map(name => `/${name}`)])};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('workpulse-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});
` });
      },
    },
  ],
})
