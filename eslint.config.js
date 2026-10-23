// @ts-check
import tseslint from 'typescript-eslint';

/** API không tất định hoặc phụ thuộc engine — cấm trong domain (ADR-02). */
const bannedMath = [
  'random', 'pow', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'sqrt', 'cbrt', 'hypot', 'fround',
].map((property) => ({
  object: 'Math',
  property,
  message: `Math.${property} bị cấm trong domain (ADR-02). Dùng core/math.ts hoặc bảng tra.`,
}));

export const determinismRules = {
  'no-restricted-properties': ['error', ...bannedMath],
  'no-restricted-globals': [
    'error',
    { name: 'Date', message: 'Domain không dùng thời gian hệ thống (ADR-02).' },
    { name: 'performance', message: 'Domain không dùng thời gian hệ thống (ADR-02).' },
    { name: 'crypto', message: 'Domain dùng RNG có seed (ADR-03).' },
    { name: 'window', message: 'Domain không phụ thuộc DOM.' },
    { name: 'document', message: 'Domain không phụ thuộc DOM.' },
    { name: 'indexedDB', message: 'Domain không phụ thuộc IndexedDB.' },
  ],
  'no-restricted-syntax': [
    'error',
    { selector: "BinaryExpression[operator='**']", message: 'Toán tử ** bị cấm trong domain (ADR-02).' },
    { selector: "AssignmentExpression[operator='**=']", message: 'Toán tử **= bị cấm trong domain (ADR-02).' },
  ],
  'no-restricted-imports': [
    'error',
    { patterns: ['react', 'react-dom', 'dexie', 'zustand', 'node:*', '@tmtg/shared'] },
  ],
};

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'docs/**', 'bench-results/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['packages/simulation/src/**/*.ts', 'packages/game-data/src/**/*.ts'],
    rules: determinismRules,
  },
);
