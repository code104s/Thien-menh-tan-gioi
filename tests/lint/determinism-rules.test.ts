import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();
const DOMAIN_FILE = 'packages/simulation/src/__lint_probe__.ts';
const UI_FILE = 'tools/headless/src/__lint_probe__.ts';

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

describe('ESLint chặn API không tất định trong domain', () => {
  it.each([
    ['Math.random()', 'no-restricted-properties'],
    ['Math.pow(2, 3)', 'no-restricted-properties'],
    ['Math.exp(1)', 'no-restricted-properties'],
    ['Math.sqrt(4)', 'no-restricted-properties'],
    ['2 ** 3', 'no-restricted-syntax'],
    ['Date.now()', 'no-restricted-globals'],
    ['new Date()', 'no-restricted-globals'],
    ['performance.now()', 'no-restricted-globals'],
  ])('%s → %s', async (expr, rule) => {
    expect(await ruleIds(`export const x = ${expr};\n`, DOMAIN_FILE)).toContain(rule);
  });

  it('chặn import React trong domain', async () => {
    expect(await ruleIds(`import 'react';\n`, DOMAIN_FILE)).toContain('no-restricted-imports');
  });

  it('cho phép Math.floor / Math.min trong domain', async () => {
    expect(await ruleIds('export const x = Math.floor(Math.min(3, 4));\n', DOMAIN_FILE)).toEqual([]);
  });

  it('không áp luật domain cho tools', async () => {
    expect(await ruleIds('export const x = Math.random();\n', UI_FILE)).toEqual([]);
  });
});
