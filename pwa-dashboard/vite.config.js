import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Served from the domain root behind Caddy (see caddy/Caddyfile.main/.dev), not
// a GitHub Pages subpath, so base is the default '/'.
//
// Boucle visuelle en local : quand DEV_API_PROXY est défini (dans .env.local,
// gitignoré), le serveur de dev proxifie les routes d'API vers cette cible —
// le navigateur ne voit que localhost (même origine), donc aucun CORS et aucun
// changement côté serveur. Sans cette variable, aucun proxy : le build de prod
// et les autres environnements ne sont pas affectés.
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
    plugins: [react()],
    server: {
      open: true,
      // Port fixe : l'origine (localhost:5174) doit rester stable pour VITE_API_URL.
      port: 5174,
      strictPort: true,
      // Allow importing the shared trophy engine that lives one level above pwa-dashboard/.
      fs: { allow: ['..'] },
      proxy,
    },
  };
});
