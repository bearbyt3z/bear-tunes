import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: {
    resolve: {
      conditions: ['tests', 'module', 'node', 'development|production'],
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
