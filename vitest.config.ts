import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Kept separate from vite.config.ts so the app config stays typed against
// Vite's own UserConfig (Vitest 2 no longer augments it).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      globals: true,
      include: ['src/**/*.test.{ts,tsx}'],
    },
  }),
);
