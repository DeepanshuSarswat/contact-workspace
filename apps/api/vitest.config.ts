import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(new URL('../../.env', import.meta.url).pathname);
} catch {
  // no .env in CI
}

export default defineConfig({
  test: {
    env: { NODE_ENV: 'test' },
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    // files share one database
    fileParallelism: false,
  },
});
