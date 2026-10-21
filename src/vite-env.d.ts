/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The demo switch: `1` for the sample data, `0` for empty. See src/core/demo.ts. */
  readonly VITE_DEMO?: string;
  /** The Supabase project's address. With the key, and the demo off, see src/core/supabase.ts. */
  readonly VITE_SUPABASE_URL?: string;
  /** The project's publishable key, which is safe in the browser. Never the secret key. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
