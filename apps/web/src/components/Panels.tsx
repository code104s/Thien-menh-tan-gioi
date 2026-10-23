import type { ViewModel } from '@tmtg/shared';
import { useUi } from '../app/store.ts';
import { factionColor } from './MapCanvas.tsx';

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}

export function SelfPanel({ view }: { view: ViewModel }) {
  const p = view.player;
  return (
    <div>
      <h2>{p.name}</h2>
      <p className="muted">{p.factionName ? `${p.rankName} ${p.factionName}` : 'Tán tu'} · tại {p.locationName}</p>
      <div className="realm">
        <strong>{p.realmName} {p.stageName}</strong>
        <progress max={100} value={p.progressPct} /> <span>{p.progressPct}%</span>
      </div>
      <div className="stats">
        <Stat label="Tuổi" value={`${p.ageYears} / ${p.lifespanYears}`} />
        <Stat label="Linh thạch" value={p.spiritStones} />
        <Stat label="Thương tích" value={p.injury} />
        <Stat label="Linh căn" value={`${p.spiritRootPct}%`} />
        <Stat label="Ngộ tính" value={p.insight} />
        <Stat label="Căn cơ" value={p.foundation} />
        <Stat label="Đạo tâm" value={p.daoHeart} />
        <Stat label="Công pháp" value={p.techniqueName} />
      </div>
      <p className="muted">
        Đột phá: {p.breakthroughChancePct !== null ? `tỉ lệ thành công ${p.breakthroughChancePct}%` : p.breakthroughBlocker}
      </p>
    </div>
  );
}

export function HerePanel({ view }: { view: ViewModel }) {
  const selectedId = useUi((s) => s.selectedLocationId) ?? view.player.locationId;
  const l = view.locations.find((x) => x.id === selectedId) ?? view.locations[0]!;
  const byId = new Map(view.characters.map((c) => [c.id, c]));
  const names = new Map(view.locations.map((x) => [x.id, x.name]));
  return (
    <div>
      <h2>{l.name}</h2>
      <p className="muted">
        {l.kindName} · <span style={{ color: factionColor(view, l.ownerFactionId) }}>{l.ownerName ?? 'vô chủ'}</span>
        {l.id === view.player.locationId ? ' · bạn đang ở đây' : ''}
      </p>
      <div className="stats">
        <Stat label="Linh khí" value={`${l.energyPct}%`} />
        <Stat label="Tài nguyên" value={l.resourceStock} />
        {l.veinName && <Stat label="Linh mạch" value={`${l.veinName} (${l.veinReserve})`} />}
        {l.disputed && <Stat label="Tình hình" value="⚔ Đang tranh chấp" />}
        {l.daoMark && <Stat label="Đạo Ngân" value="✦ Có" />}
      </div>
      <h4>Đường đi</h4>
      <ul className="plain">
        {l.edges.map((e) => <li key={e.to}>{names.get(e.to)} — {e.travelDays} ngày</li>)}
      </ul>
      <h4>Nhân vật bạn biết ở đây</h4>
      <ul className="plain">
        {l.characterIds.length === 0 && <li className="muted">Không thấy ai.</li>}
        {l.characterIds.map((id) => {
          const c = byId.get(id)!;
          return <li key={id}>{c.name}{c.isPlayer ? ' (bạn)' : ''} — {c.realmText}{c.factionName ? ` · ${c.factionName}` : ''}</li>;
        })}
      </ul>
    </div>
  );
}

export function FactionPanel({ view }: { view: ViewModel }) {
  return (
    <div>
      {view.disputes.length > 0 && (
        <section className="disputes">
          <h4>Tranh chấp đang diễn ra</h4>
          {view.disputes.map((d) => (
            <p key={d.id}>⚔ {d.attackerName} tranh {d.veinName} của {d.defenderName} — vòng {d.round}, điểm {d.attackerScore}:{d.defenderScore}
              {d.playerStance ? ` (bạn: ${d.playerStance === 'fight' ? 'tham chiến' : 'né tránh'})` : ''}</p>
          ))}
        </section>
      )}
      {view.factions.map((f) => (
        <section key={f.id} className={`faction ${f.isPlayerFaction ? 'mine' : ''}`}>
          <h3 style={{ color: factionColor(view, f.id) }}>{f.name}{f.dissolved ? ' (đã tan rã)' : ''}{f.isPlayerFaction ? ' — tông môn của bạn' : ''}</h3>
          <div className="stats">
            <Stat label="Tông chủ" value={f.leaderName ?? 'Khuyết'} />
            <Stat label="Thành viên" value={f.memberCount} />
            <Stat label="Linh mạch" value={f.veinCount} />
            <Stat label="Kho" value={f.treasury ?? '?'} />
            <Stat label="Ổn định" value={f.stability ?? '?'} />
            <Stat label="Chiến lược" value={f.strategyName ?? '?'} />
          </div>
          <p className="muted">Lãnh địa: {f.territoryNames.join(', ') || 'không'}</p>
          <div className="relations">
            {f.relations.map((r) => (
              <div key={r.factionId} className="relation">
                <span>{r.name}</span>
                <meter min={-100} max={100} low={-30} high={30} optimum={100} value={r.value} />
                <span>{r.value}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function PeoplePanel({ view }: { view: ViewModel }) {
  return (
    <table className="people">
      <thead><tr><th>Tên</th><th>Tông môn</th><th>Cảnh giới</th><th>Ở đâu</th><th>Thiện cảm</th></tr></thead>
      <tbody>
        {view.characters.filter((c) => !c.isPlayer).map((c) => (
          <tr key={c.id} className={c.alive ? '' : 'dead'}>
            <td>{c.name}{c.alive ? '' : ' †'}</td>
            <td>{c.factionName ? `${c.rankName} ${c.factionName}` : 'Tán tu'}</td>
            <td>{c.realmText}</td>
            <td>{c.locationName ?? '?'}</td>
            <td>{c.relationToPlayer ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
