/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** "true" in a build with no API behind it. See SHOWCASE in lib/constants.ts.
   *  A string, not a boolean: Vite substitutes the literal from the
   *  environment, and `VITE_SHOWCASE=false` would otherwise be truthy. */
  readonly VITE_SHOWCASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
