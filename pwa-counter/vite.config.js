import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Boucle visuelle en local : quand DEV_API_PROXY est défini (dans .env.local,
// gitignoré), le serveur de dev proxifie les routes d'API vers cette cible — le
// navigateur ne voit que localhost (même origine), donc aucun CORS et aucun
// changement côté serveur. Sans la variable : aucun proxy, build de prod et
// autres environnements inchangés. (Même dispositif que pwa-dashboard.)
const API_ROOTS = [
  'admin', 'auth', 'elo', 'games', 'leagues',
  'players', 'seasons', 'stats', 'tournaments', 'uploads', 'live', 'health',
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.DEV_API_PROXY;
  const proxy = target
    ? Object.fromEntries(
        API_ROOTS.map((root) => [`/${root}`, { target, changeOrigin: true, secure: true }]),
      )
    : undefined;

  return {
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
      // Port fixe : l'origine (localhost:5175) doit rester stable pour VITE_API_URL.
      port: 5175,
      strictPort: true,
      // Autorise l'import des tokens partagés qui vivent un cran au-dessus de
      // pwa-counter/ (même réglage que pwa-dashboard/vite.config.js).
      fs: { allow: ['..'] },
      proxy,
    },
  };
});
