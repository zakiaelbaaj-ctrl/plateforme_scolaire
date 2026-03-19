// vitest.config.js
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [
      // fichier d'initialisation pour mocks globaux (ex: localStorage, fetch, WebSocket)
      path.resolve(__dirname, 'public/unit/setupTests.js')
    ],
    include: ['public/js/**/*.spec.{js,mjs,ts}', 'tests/**/*.spec.{js,mjs,ts}'],
    exclude: ['node_modules', 'dist', 'public/vendor/**'],
    coverage: {
      provider: 'c8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      all: true,
      include: ['public/js/**'],
      exclude: ['**/__tests__/**', '**/*.spec.*', 'public/js/vendor/**']
    },
    watch: false,
    threads: true,
    isolate: true,
    testTimeout: 10000
  },
  resolve: {
    alias: {
      '#root': path.resolve(__dirname),
      '#config': path.resolve(__dirname, 'config'),
      '#controllers': path.resolve(__dirname, 'controllers'),
      '#middlewares': path.resolve(__dirname, 'middleware'),
      '#routes': path.resolve(__dirname, 'routes'),
      '#services': path.resolve(__dirname, 'services'),
      '#utils': path.resolve(__dirname, 'utils'),
      '@': path.resolve(__dirname, 'public/js')
    }
  }
});
