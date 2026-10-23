import { generateWorld, sortedValues } from '@tmtg/simulation';
import { useEffect, useMemo, useState } from 'react';
import { actions, useUi } from '../app/store.ts';
import { SavesDialog } from './Dialogs.tsx';

type OriginKey = 'join:0' | 'join:1' | 'join:2' | 'rogue' | 'seeker';

function randomSeed() {
  const words = ['thien-khuyet', 'linh-mach', 'van-mong', 'huyen-thiet', 'thanh-van', 'hac-phong'];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(Math.random() * 10_000)}`;
}

export function StartScreen() {
  const [seed, setSeed] = useState('thien-khuyet-01');
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState<OriginKey>('join:0');
  const savesOpen = useUi((s) => s.savesOpen);
  const saves = useUi((s) => s.saves);

  useEffect(() => { void actions.refreshSaves(); }, []);

  // Xem trước tên tông môn của seed (sinh thế giới chỉ mất vài ms, hàm thuần).
  const factionNames = useMemo(() => {
    try {
      const { state } = generateWorld({ seed: seed || 'x', origin: { kind: 'rogue' } });
      return sortedValues(state.factions).map((f) => f.name);
    } catch {
      return ['Tông môn 1', 'Tông môn 2', 'Tông môn 3'];
    }
  }, [seed]);

  const start = () => {
    const o = origin === 'rogue' ? { kind: 'rogue' as const }
      : origin === 'seeker' ? { kind: 'resource_seeker' as const }
        : { kind: 'join_faction' as const, factionIndex: Number(origin.slice(5)) as 0 | 1 | 2 };
    actions.newGame(seed.trim() || randomSeed(), o, name);
  };

  const originOptions: { key: OriginKey; label: string; hint: string }[] = [
    ...factionNames.map((n, i) => ({ key: `join:${i}` as OriginKey, label: `Gia nhập ${n}`, hint: 'Có bổng lộc và công pháp tông môn' })),
    { key: 'rogue', label: 'Tán tu', hint: 'Tự do, không bổng lộc, bắt đầu ở thị trấn' },
    { key: 'seeker', label: 'Tìm tài nguyên', hint: 'Bắt đầu nơi hoang dã giàu tài nguyên nhất' },
  ];

  return (
    <main className="start">
      <h1 className="title">Thiên Mệnh Tàn Giới</h1>
      <p className="subtitle">Thiên Khuyết làm thiên địa tổn thương, linh mạch suy kiệt. Thế giới tự vận hành — bạn chỉ là một tu sĩ nhỏ bé.</p>
      <form className="card start-form" onSubmit={(e) => { e.preventDefault(); start(); }}>
        <label className="field">
          <span>Seed thế giới</span>
          <div className="row">
            <input value={seed} onChange={(e) => setSeed(e.target.value)} maxLength={64} />
            <button type="button" onClick={() => setSeed(randomSeed())}>Ngẫu nhiên</button>
          </div>
        </label>
        <label className="field">
          <span>Tên nhân vật (để trống để sinh ngẫu nhiên)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="Lý Thanh Phong" />
        </label>
        <fieldset className="field">
          <legend>Xuất thân</legend>
          {originOptions.map((o) => (
            <label key={o.key} className="radio">
              <input type="radio" name="origin" checked={origin === o.key} onChange={() => setOrigin(o.key)} />
              <span><strong>{o.label}</strong> — <em>{o.hint}</em></span>
            </label>
          ))}
        </fieldset>
        <div className="row end">
          <button type="button" onClick={() => useUi.setState({ savesOpen: true })}>
            Tải / nhập save ({saves.length})
          </button>
          <button type="submit" className="primary">Bắt đầu</button>
        </div>
      </form>
      {savesOpen && <SavesDialog allowSave={false} />}
    </main>
  );
}
