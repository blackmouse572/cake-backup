/** Metro turns a bundled font into an asset id. */
declare module "*.ttf" {
  const asset: number;
  export default asset;
}

/** Vite's `import.meta.glob`, as tests use it: each matching file read as text, keyed by path. */
interface ImportMeta {
  glob(pattern: string, options: { query: "?raw"; import: "default"; eager: true }): Record<string, string>;
}
