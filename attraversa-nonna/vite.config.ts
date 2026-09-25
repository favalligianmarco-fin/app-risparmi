import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build`                  → dist/  (caricato nell'app iOS da Capacitor)
// `vite build --mode singlefile` → dist-web/index.html, un unico file giocabile nel browser
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'singlefile' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'singlefile' ? 'dist-web' : 'dist',
    target: 'es2020',
    assetsInlineLimit: mode === 'singlefile' ? 100_000_000 : 4096,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
  },
}));
