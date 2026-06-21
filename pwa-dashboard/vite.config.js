import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from the domain root behind Caddy (see caddy/Caddyfile.main/.dev), not
// a GitHub Pages subpath, so base is the default '/'.
export default defineConfig({
  plugins: [react()],
  server: {
    open: true,
    // Allow importing the shared trophy engine that lives one level above pwa-dashboard/.
    fs: { allow: ['..'] },
  },
});
