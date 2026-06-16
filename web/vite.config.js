import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed under https://mokakejr.github.io/DartsCounter/ → base must match the
// repo path. In dev, Vite ignores base for the dev server root.
export default defineConfig({
  base: '/DartsCounter/',
  plugins: [react()],
  server: {
    open: true,
    // Allow importing the shared trophy engine that lives one level above web/.
    fs: { allow: ['..'] },
  },
});
