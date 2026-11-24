// The web app's modules read Vite's import.meta.env in a few places (only when called in a
// browser); this lets tsc check them from Node without Vite's types.
interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly [key: string]: string | boolean | undefined;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
