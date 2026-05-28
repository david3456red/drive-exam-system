import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Default Vitest configuration — covers unit tests, engine-layer property-based
 * tests (fast-check) and React component tests via jsdom + Testing Library.
 *
 * Integration tests that require a real Prisma SQLite database use the separate
 * `vitest.integration.config.ts` (it sets `DATABASE_URL=file:./test.db`).
 *
 * Aligns with Requirement 29.1 / 29.3:
 *   - Vitest is the only test runner
 *   - jsdom is the only client component rendering environment
 *   - `pnpm test` executes once (`--run`, see package.json) without watch mode
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'src/test/**/*.{test,spec}.{ts,tsx}',
    ],
    // Integration tests run via vitest.integration.config.ts; exclude them
    // from the default run so unit/PBT tests do not require a SQLite DB.
    exclude: [
      'node_modules/**',
      '.next/**',
      'dist/**',
      'src/test/**/*.integration.test.{ts,tsx}',
    ],
    css: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
