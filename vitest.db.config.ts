import { defineConfig } from 'vitest/config';

// The database check (`npm run test:db`, #153): the local Supabase against docs/SCHEMA.md.
// Kept out of `npm test` because it needs `supabase start`, and so Docker.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['db/**/*.test.ts'],
  },
});
