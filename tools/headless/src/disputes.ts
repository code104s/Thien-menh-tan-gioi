/** Thống kê tranh chấp: pnpm tsx tools/headless/src/disputes.ts [seeds] [years] */
import { runScenario } from './scenario.ts';

const seeds = Number(process.argv[2] ?? 10);
const years = Number(process.argv[3] ?? 10);
const out = (line: string) => process.stdout.write(`${line}\n`);
let withDispute = 0;
for (let i = 0; i < seeds; i++) {
  const seed = `bench-${String(i).padStart(3, '0')}`;
  const r = runScenario({ seed, origin: { kind: 'join_faction', factionIndex: 0 }, years, keepChronicle: true });
  const started = r.chronicle.filter((e) => e.type === 'dispute_started');
  if (started.length > 0) withDispute++;
  const firstYear = started[0] ? Math.floor(started[0].day / 360) + 1 : '-';
  const outcomes = r.chronicle.filter((e) => e.type === 'dispute_ended').map((e) => `${e.payload['outcome']}@${Math.floor(e.day / 360) + 1}`);
  const deaths = r.chronicle.filter((e) => e.type === 'character_died').map((e) => e.payload['cause']);
  const strategies = Object.values(r.state.factions).map((f) => `${f.id}:${f.strategy}:${f.treasury}`).join(' ');
  out(`${seed} tranh chấp=${started.length} đầu tiên năm ${firstYear} kết quả=[${outcomes.join(', ')}] chết=[${deaths.join(',')}] chuyển quyền=${r.eventTypes['territory_transferred'] ?? 0} | ${strategies} | bất biến ${r.invariantViolations === 0 ? 'OK' : 'LỖI'}`);
}
out(`Seed có tranh chấp trong ${years} năm: ${withDispute}/${seeds}`);
