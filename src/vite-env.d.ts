/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: "staging" | "production" | "development" | string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
