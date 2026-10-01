/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps the build portable: it works from any static host path
// (GitHub Pages sub-path, a local file server, etc.).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.ts'],
  },
});
