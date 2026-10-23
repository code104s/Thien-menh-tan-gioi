import { useMemo, useState } from 'react';
import { useUi } from '../app/store.ts';

/** Sử ký: mốc thời gian, tác nhân, đối tượng, nguyên nhân, kết quả — dựng từ event log thật. */
export function ChronicleScreen() {
  const entries = useUi((s) => s.chronicle);
  const view = useUi((s) => s.view);
  const [filter, setFilter] = useState('');
  const byId = useMemo(() => new Map(entries.map((e) => [e.eventId, e])), [entries]);
  const shown = entries.filter((e) => !filter || e.text.toLowerCase().includes(filter.toLowerCase()));
  const years = new Map<number, typeof shown>();
  for (const e of shown) {
    const year = Math.floor(e.day / 360) + 1;
    years.set(year, [...(years.get(year) ?? []), e]);
  }
  return (
    <main className="chronicle">
      <header className="row">
        <h1>Sử ký</h1>
        <input placeholder="Lọc theo tên, tông môn, địa danh…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="spacer" />
        <button type="button" onClick={() => useUi.setState({ screen: view ? 'game' : 'start' })}>Quay lại</button>
      </header>
      {shown.length === 0 && <p className="muted">Chưa có sự kiện nào.</p>}
      {[...years.entries()].map(([year, list]) => (
        <section key={year} className="card">
          <h2>Năm {year}</h2>
          <ul className="plain chronicle-list">
            {list.map((e) => {
              const cause = e.causeEventId ? byId.get(e.causeEventId) : undefined;
              return (
                <li key={e.eventId}>
                  <span className="feed-date">{e.date}</span> {e.text}
                  {cause && <small className="muted"> — do: {cause.text}</small>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
