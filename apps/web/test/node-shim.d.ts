/** Kiểu tối thiểu cho API Node dùng trong test (repo không cài @types/node; xem tools/headless/src/node-shim.d.ts). */
declare module 'node:fs' {
  export function readFileSync(path: URL, encoding: 'utf8'): string;
}
