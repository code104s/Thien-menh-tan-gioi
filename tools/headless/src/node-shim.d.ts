// Khai báo tối thiểu cho API Node mà CLI dùng, để không cần thêm @types/node ở Phase 1.
// Nếu sau này thêm @types/node thì xóa file này.
declare const process: {
  argv: string[];
  exitCode?: number;
  stdout: { write(text: string): boolean };
  memoryUsage(): { heapUsed: number };
};

declare const performance: { now(): number };

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

declare module 'node:path' {
  export function dirname(path: string): string;
}
