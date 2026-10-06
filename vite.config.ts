import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server port comes from PORT (the shell, or a .env / .env.local file), so several
// worktrees can run side by side: `PORT=5190 npm run dev`. Without it, 5181.
const DEFAULT_PORT = 5181;
const port = Number(loadEnv('', '.', 'PORT').PORT) || DEFAULT_PORT;

export default defineConfig({
  plugins: [react()],
  server: { port },
});
