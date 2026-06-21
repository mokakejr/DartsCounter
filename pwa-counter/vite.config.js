import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: { injectionPoint: 'self.__WB_MANIFEST' },
      manifest: false, // shipped as a static public/manifest.json instead
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  server: {
    open: true,
  },
});
