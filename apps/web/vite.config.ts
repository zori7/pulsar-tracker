import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Dev-only branding. The dev server's home-screen PWA is generically named
 * "Vite DEV" (reused by any app's dev server) so it can never be confused with
 * a production app icon. Also serves a manifest in dev (no service worker —
 * a dev SW is exactly what caused stale-bundle bugs before).
 */
function devBranding(): Plugin {
  const manifest = {
    name: 'Vite DEV',
    short_name: 'Vite DEV',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    theme_color: '#0B1020',
    background_color: '#0B1020',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/pwa-192x192.png', sizes: '192', type: 'image/png', purpose: 'any' },
    ],
  };
  return {
    name: 'pulsar-dev-branding',
    transformIndexHtml(html) {
      return html
        .replace('<title>Pulsar Tracker</title>', '<title>Vite DEV</title>')
        .replace(
          'name="apple-mobile-web-app-title" content="Pulsar"',
          'name="apple-mobile-web-app-title" content="Vite DEV"',
        )
        .replace(
          '</title>',
          '</title>\n    <link rel="manifest" href="/manifest.webmanifest" />',
        );
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] === '/manifest.webmanifest') {
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(JSON.stringify(manifest));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const isDev = command === 'serve';
  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(isDev ? [devBranding()] : []),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'fonts/space-grotesk-latin.woff2'],
        manifest: {
          name: isDev ? 'Vite DEV' : 'Pulsar Tracker',
          short_name: isDev ? 'Vite DEV' : 'Pulsar',
          description: 'Self-hosted loop habit tracker and one-time todos.',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          start_url: '/',
          scope: '/',
          theme_color: '#0B1020',
          background_color: '#0B1020',
          orientation: 'portrait',
          icons: [
            { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: '/pwa-192x192.png', sizes: '192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-512x512.png', sizes: '512', type: 'image/png', purpose: 'any' },
            { src: '/maskable-512x512.png', sizes: '512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // App-shell precache only. /api/* is never cached: the generateSW
          // runtime does not configure any runtime caching, and SPA navigation
          // fallbacks must not swallow API routes.
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    server: {
      // Phone-reachable dev loop on the self-hosted band (see ~/Projects/PORTS.md).
      host: true,
      port: 8790,
      strictPort: true,
      allowedHosts: ['homebox'],
      proxy: {
        '/api': 'http://localhost:3000',
      },
    },
    preview: {
      proxy: {
        '/api': 'http://localhost:3000',
      },
    },
  };
});
