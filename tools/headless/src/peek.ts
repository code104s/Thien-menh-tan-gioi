/** In tóm tắt một thế giới vừa sinh để kiểm tra bằng mắt: pnpm tsx tools/headless/src/peek.ts <seed> */
import { gameData } from '@tmtg/game-data';
import { ageInYears, generateWorld, realmName, sortedValues } from '@tmtg/simulation';

const seed = process.argv[2] ?? 'thien-khuyet-01';
const { state } = generateWorld({ seed, origin: { kind: 'join_faction', factionIndex: 0 } });
const out = (line: string) => process.stdout.write(`${line}\n`);

out(`== Địa điểm (${seed}) ==`);
for (const l of sortedValues(state.locations)) {
  const edges = l.edges.map((e) => `${e.to.slice(4)}(${e.travelDays}n)`).join(' ');
  out(`${l.id} ${l.name.padEnd(20)} ${l.kind.padEnd(12)} chủ:${(l.ownerFactionId ?? '-').padEnd(6)} mạch:${(l.veinId ?? '-').padEnd(7)} linh khí:${l.spiritualEnergyBp} kề: ${edges}`);
}
out('== Tông môn ==');
for (const f of sortedValues(state.factions)) {
  out(`${f.id} ${f.name} — kho ${f.treasury}, tông chủ ${state.characters[f.leaderId!]!.name}, quan hệ ${JSON.stringify(f.relations)}`);
}
out('== Nhân vật ==');
for (const c of sortedValues(state.characters)) {
  out(`${c.id} ${c.name.padEnd(18)} ${(c.factionId ?? 'tán tu').padEnd(7)} ${(c.factionRank ?? '').padEnd(8)} ${realmName(gameData, c.realm)} ${c.stage.padEnd(7)} tuổi ${ageInYears(c.birthDay, 0)} linh thạch ${c.spiritStones} ${c.techniqueId}`);
}
