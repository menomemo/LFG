import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'plugins/*/src/**/*.test.ts'],
    /* docs/code-standards.md: no test depends on the wall clock, the network,
       or the order the suite runs in. Isolation is on, and a test that needs
       the network has to go out of its way to get it. */
    environment: 'node',
    isolate: true,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
    },
  },
});
