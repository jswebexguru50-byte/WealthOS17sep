import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      emptyOutDir: true,
      target: 'es2022',
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('motion')) {
                return 'vendor-framework';
              }
              if (id.includes('recharts')) {
                return 'vendor-charts';
              }
              if (id.includes('xlsx') || id.includes('exceljs')) {
                return 'vendor-excel';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-lucide';
              }
            }
          },
        },
      },
    },
    server: {
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching for databases, logs, and temp files to prevent infinite page reloads
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: [
          '**/*.db*',
          '**/*.log',
          '**/*.csv',
          '**/*.xlsx',
          '**/*.xls',
          '**/*.pdf',
          '**/*.err',
          '**/*.py',
          '**/*.cjs',
          '**/*.sql',
          '**/*.bat',
          '**/*.ps1',
          '**/0',
          '**/src/server/**',
          '**/scratch/**',
          '**/artifacts/**',
          '**/dist/**',
          '**/uploads/**',
          '**/tests/**',
          '**/data/**'
        ]
      },
    },
  };
});
