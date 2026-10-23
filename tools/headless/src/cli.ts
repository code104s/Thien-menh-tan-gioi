/**
 * CLI headless.
 *   pnpm sim run   --seed <s> --years <n> [--origin join:0|rogue|seeker] [--commands <file.json>] [--save-at-year <n>]
 *   pnpm sim bench [--seeds 10] [--years 100] [--origin join:0] [--out bench-results/bench.json]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { playerCommandSchema } from '@tmtg/shared';
import { buildChronicle, formatDate, realmName, sortedValues } from '@tmtg/simulation';
import { gameData } from '@tmtg/game-data';
import { parseOrigin, runScenario } from './scenario.ts';

type Flags = Record<string, string>;

function parseFlags(args: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith('--')) throw new Error(`Tham số không hợp lệ: ${arg}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Thiếu giá trị cho ${arg}`);
    flags[arg.slice(2)] = value;
    i++;
  }
  return flags;
}

function intFlag(flags: Flags, name: string, fallback?: number): number {
  const raw = flags[name];
  if (raw === undefined) {
    if (fallback === undefined) throw new Error(`Thiếu --${name}`);
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`--${name} phải là số nguyên ≥ 0`);
  return value;
}

const print = (line = '') => process.stdout.write(`${line}\n`);

function commandRun(flags: Flags): void {
  const seed = flags['seed'];
  if (!seed) throw new Error('Thiếu --seed');
  const commands = flags['commands']
    ? z.array(playerCommandSchema).parse(JSON.parse(readFileSync(flags['commands'], 'utf8')))
    : [];
  const started = performance.now();
  const result = runScenario({
    seed,
    origin: parseOrigin(flags['origin'] ?? 'join:0'),
    years: intFlag(flags, 'years'),
    commands,
    ...(flags['save-at-year'] !== undefined ? { saveAtYear: intFlag(flags, 'save-at-year') } : {}),
  });
  const ms = performance.now() - started;
  print(`seed            ${seed}`);
  print(`ngày            ${result.state.day}`);
  print(`tick            ${result.ticks}`);
  print(`event           ${result.eventCount}`);
  print(`snapshot        ${result.snapshotBytes} byte`);
  print(`bất biến        ${result.invariantViolations === 0 ? 'OK' : `${result.invariantViolations} vi phạm`}`);
  print(`thời gian       ${ms.toFixed(1)} ms`);
  print(`digest          ${result.digest}`);
  if (result.invariantViolations > 0) process.exitCode = 1;
}

function commandBench(flags: Flags): void {
  const seeds = intFlag(flags, 'seeds', 10);
  const years = intFlag(flags, 'years', 100);
  const origin = parseOrigin(flags['origin'] ?? 'join:0');
  const rows = [];
  let peakHeap = 0;
  for (let i = 0; i < seeds; i++) {
    const seed = `bench-${String(i).padStart(3, '0')}`;
    const started = performance.now();
    const result = runScenario({ seed, origin, years });
    const ms = performance.now() - started;
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
    rows.push({
      seed,
      ms: Math.round(ms),
      ticksPerSecond: Math.round((result.ticks / ms) * 1000),
      events: result.eventCount,
      snapshotBytes: result.snapshotBytes,
      invariantViolations: result.invariantViolations,
      digest: result.digest,
    });
  }
  const totalMs = rows.reduce((sum, r) => sum + r.ms, 0);
  print(`Benchmark: ${seeds} seed × ${years} năm`);
  print();
  print('| seed | ms | tick/giây | event | snapshot (byte) | bất biến | digest |');
  print('|---|---:|---:|---:|---:|---|---|');
  for (const r of rows) {
    print(`| ${r.seed} | ${r.ms} | ${r.ticksPerSecond} | ${r.events} | ${r.snapshotBytes} | ${r.invariantViolations === 0 ? 'OK' : r.invariantViolations} | ${r.digest} |`);
  }
  print();
  print(`Tổng ${totalMs} ms, trung bình ${Math.round(totalMs / seeds)} ms/seed, heap đỉnh ~${Math.round(peakHeap / 1048576)} MB`);
  if (flags['out']) {
    mkdirSync(dirname(flags['out']), { recursive: true });
    writeFileSync(flags['out'], JSON.stringify({ seeds, years, rows, totalMs, peakHeapBytes: peakHeap }, null, 2));
    print(`Đã ghi ${flags['out']}`);
  }
  if (rows.some((r) => r.invariantViolations > 0)) process.exitCode = 1;
}

function commandReport(flags: Flags): void {
  const seed = flags['seed'] ?? 'thien-khuyet-01';
  const years = intFlag(flags, 'years', 100);
  const result = runScenario({ seed, origin: parseOrigin(flags['origin'] ?? 'join:0'), years, keepChronicle: true });
  const { state } = result;
  print(`Báo cáo: seed ${seed}, ${years} năm, digest ${result.digest}, bất biến ${result.invariantViolations === 0 ? 'OK' : 'LỖI'}`);
  print();
  print('Số event theo loại:');
  for (const [type, count] of Object.entries(result.eventTypes).sort()) print(`  ${type.padEnd(24)} ${count}`);
  print();
  print('Nhân vật cuối kỳ:');
  for (const c of sortedValues(state.characters)) {
    const status = c.alive ? 'sống' : `mất ${formatDate(c.deathDay!)} (${c.deathCause})`;
    print(`  ${c.id} ${c.name.padEnd(18)} ${(realmName(gameData, c.realm) + ' ' + c.stage).padEnd(18)} căn cơ ${String(c.foundation).padStart(3)} thương ${String(c.injury).padStart(3)} linh thạch ${String(c.spiritStones).padStart(5)} — ${status}`);
  }
  print();
  const limit = intFlag(flags, 'lines', 80);
  const chronicle = buildChronicle(state, gameData, result.chronicle);
  print(`Sử ký (${chronicle.length} dòng, in tối đa ${limit}):`);
  for (const entry of chronicle.slice(0, limit)) print(`  ${entry.date.padEnd(26)} ${entry.text}`);
}

function main(argv: string[]): void {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  switch (command) {
    case 'run':
      return commandRun(flags);
    case 'bench':
      return commandBench(flags);
    case 'report':
      return commandReport(flags);
    default:
      print('Dùng: pnpm sim run --seed <s> --years <n> | pnpm sim bench [--seeds 10] [--years 100]');
      process.exitCode = command ? 1 : 0;
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  print(`Lỗi: ${(error as Error).message}`);
  process.exitCode = 1;
}
