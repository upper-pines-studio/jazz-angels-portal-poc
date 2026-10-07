/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The demo switch: `1` for the sample data, `0` for empty. See src/core/demo.ts. */
  readonly VITE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
