import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Smoke tests for the flows the office relies on: `npm run test:e2e`.
//
// `.env.local` at the repo root (ignored by git) holds the demo logins the sign-in spec reads,
// and may set PORT. A small parser loads it here so nobody has to export the variables by hand;
// anything already set in the shell wins.
loadEnvFile('.env.local');

// The same port and default as vite.config.ts, so `PORT=5207 npm run test:e2e` runs beside
// other worktrees.
const DEFAULT_PORT = 5181;
const port = Number(process.env.PORT) || DEFAULT_PORT;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    env: { PORT: String(port) },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

/** `KEY=value` lines, `#` comments and blank lines; quotes around a value are dropped. */
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
