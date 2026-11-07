/** Vite's `?raw` imports: the file as a string (the config test reads wrangler.jsonc this way). */
declare module "*?raw" {
  const text: string;
  export default text;
}
