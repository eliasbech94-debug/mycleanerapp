/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: "staging" | "production" | "development" | string;
  readonly VITE_ENABLE_PROVIDER_PROFILE_PREVIEW?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
