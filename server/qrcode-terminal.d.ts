declare module 'qrcode-terminal' {
  const qrcode: { generate(text: string, opts?: { small?: boolean }, cb?: (s: string) => void): void };
  export default qrcode;
}
