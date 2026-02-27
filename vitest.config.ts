import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './src/test/global-setup.ts',
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    exclude: ['web/**', 'node_modules/**'],
  },
});
