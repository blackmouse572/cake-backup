/** Metro turns a bundled font into an asset id. */
declare module "*.ttf" {
  const asset: number;
  export default asset;
}
