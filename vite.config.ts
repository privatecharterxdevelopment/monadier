import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const GA_ID_RE = /^G-[A-Z0-9]+$/i;

function googleAnalyticsHtml(): Plugin {
  return {
    name: 'hypergain-ga-html',
    transformIndexHtml(html) {
      const id = (
        process.env.VITE_GA_MEASUREMENT_ID ||
        process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
        ''
      ).trim();
      if (!GA_ID_RE.test(id)) return html;
      const snippet = `
    <script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied' });
      gtag('js', new Date());
      gtag('config', '${id}', { anonymize_ip: true });
    </script>`;
      return html.replace('</head>', `${snippet}\n  </head>`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), googleAnalyticsHtml()],
  // Accept misnamed Next.js-style env vars on Vercel (NEXT_PUBLIC_*),
  // in addition to the Vite-native VITE_* prefix.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      '/bot-service': {
        target: 'https://monadier-production.up.railway.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bot-service/, ''),
      },
    },
  },
});
