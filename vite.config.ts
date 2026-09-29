import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig(({ mode, command }) => ({
  base: './',
  resolve: {
    alias: {
      '@platform': fileURLToPath(
        new URL(
          `./src/platform/${mode === 'tauri' ? 'tauri' : 'web'}.ts`,
          import.meta.url,
        ),
      ),
    },
  },
  plugins: [
    react(),
    {
      name: 'packaged-classic-script',
      // A single classic bundle also works on file-protocol WebViews that block ES module requests.
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          if (command !== 'build' || mode === 'tauri') return html;
          return html
            .replace(
              '<head>',
              `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`,
            )
            .replace(/type="module"/g, 'defer')
            .replace(/ crossorigin/g, '');
        },
      },
    },
  ],
  build:
    mode === 'tauri'
      ? { outDir: 'dist-tauri' }
      : {
          modulePreload: false,
          cssCodeSplit: false,
          rollupOptions: {
            output: { format: 'iife', inlineDynamicImports: true },
          },
        },
  server: { port: 1420, strictPort: true, host: '127.0.0.1' },
  clearScreen: false,
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    restoreMocks: true,
    exclude: ['e2e/**', '**/node_modules/**', '**/target/**'],
  },
}));
