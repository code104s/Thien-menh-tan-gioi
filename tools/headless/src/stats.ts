/** Thống kê cân bằng nhiều seed: pnpm tsx tools/headless/src/stats.ts [seeds] [years] */
import { runScenario } from './scenario.ts';

const seeds = Number(process.argv[2] ?? 10);
const years = Number(process.argv[3] ?? 100);
const out = (line: string) => process.stdout.write(`${line}\n`);
out('| seed | ms | →Trúc Cơ | →Kim Đan | thất bại | chết già (NPC) | chết khác | Luyện Khí/Trúc Cơ/Kim Đan cuối | linh thạch NPC max | bất biến |');
out('|---|---:|---:|---:|---:|---:|---:|---|---:|---|');
for (let i = 0; i < seeds; i++) {
  const seed = `bench-${String(i).padStart(3, '0')}`;
  const t = performance.now();
  const r = runScenario({ seed, origin: { kind: 'join_faction', factionIndex: 0 }, years, keepChronicle: true });
  const ms = Math.round(performance.now() - t);
  const ok = r.chronicle.filter((e) => e.type === 'breakthrough_succeeded');
  const toFoundation = ok.filter((e) => e.payload['toRealm'] === 'foundation').length;
  const toCore = ok.filter((e) => e.payload['toRealm'] === 'golden_core').length;
  const npcs = Object.values(r.state.characters).filter((c) => !c.isPlayer);
  const oldAge = npcs.filter((c) => c.deathCause === 'old_age').length;
  const otherDeaths = npcs.filter((c) => !c.alive && c.deathCause !== 'old_age').length;
  const alive = npcs.filter((c) => c.alive);
  const dist = ['qi', 'foundation', 'golden_core'].map((realm) => alive.filter((c) => c.realm === realm).length).join('/');
  const maxStones = Math.max(...npcs.map((c) => c.spiritStones));
  out(`| ${seed} | ${ms} | ${toFoundation} | ${toCore} | ${r.eventTypes['breakthrough_failed'] ?? 0} | ${oldAge} | ${otherDeaths} | ${dist} | ${maxStones} | ${r.invariantViolations === 0 ? 'OK' : 'LỖI'} |`);
}
