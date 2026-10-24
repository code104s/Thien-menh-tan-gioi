import type { ActionOption, Speed, ViewModel } from '@tmtg/shared';
import { actions, useUi, type Tab } from '../app/store.ts';
import { ChoiceDialog, GameOverOverlay, InterruptDialog, SavesDialog, SeclusionDialog } from './Dialogs.tsx';
import { MapCanvas } from './MapCanvas.tsx';
import { FactionPanel, HerePanel, PeoplePanel, SelfPanel } from './Panels.tsx';

const SPEEDS: { value: Speed; label: string }[] = [
  { value: 0, label: '⏸' }, { value: 1, label: '1×' }, { value: 10, label: '10×' }, { value: 100, label: '100×' },
];
const SKIPS = [{ days: 30, label: '1 tháng' }, { days: 360, label: '1 năm' }, { days: 3600, label: '10 năm' }];
const TABS: { key: Tab; label: string }[] = [
  { key: 'self', label: 'Bản thân' }, { key: 'here', label: 'Nơi này' }, { key: 'faction', label: 'Tông môn' }, { key: 'people', label: 'Nhân vật' },
];
const GROUPS: { key: ActionOption['group']; label: string }[] = [
  { key: 'tu_luyen', label: 'Tu luyện' }, { key: 'tai_nguyen', label: 'Tài nguyên' }, { key: 'tong_mon', label: 'Tông môn' },
  { key: 'di_chuyen', label: 'Di chuyển' }, { key: 'doi_dau', label: 'Đối đầu' },
];

export function GameScreen() {
  const view = useUi((s) => s.view);
  const interrupt = useUi((s) => s.interrupt);
  const seclusionOpen = useUi((s) => s.seclusionOpen);
  const savesOpen = useUi((s) => s.savesOpen);
  if (!view) return null;
  const showChoice = view.choices.length > 0 && !interrupt;
  return (
    <div className="game">
      <TopBar view={view} />
      <MapCanvas view={view} />
      <SidePanel view={view} />
      <EventFeed />
      {interrupt && <InterruptDialog view={view} interrupt={interrupt} />}
      {showChoice && <ChoiceDialog choice={view.choices[0]!} />}
      {seclusionOpen && <SeclusionDialog view={view} />}
      {savesOpen && <SavesDialog allowSave />}
      {view.gameOver && !interrupt && <GameOverOverlay view={view} />}
    </div>
  );
}

function TopBar({ view }: { view: ViewModel }) {
  const speed = useUi((s) => s.speed);
  const running = useUi((s) => s.running);
  const stopOnImportant = useUi((s) => s.stopOnImportant);
  const ornate = useUi((s) => s.ornate);
  const blocked = view.choices.length > 0 || view.gameOver !== null;
  return (
    <header className="topbar">
      <strong className="date">{view.date}</strong>
      <div className="speeds" role="group" aria-label="Tốc độ">
        {SPEEDS.map((s) => (
          <button
            key={s.value}
            type="button"
            className={speed === s.value && (s.value > 0 || !running) ? 'active' : ''}
            disabled={blocked && s.value > 0}
            onClick={() => (s.value === 0 ? actions.pause() : actions.setSpeed(s.value))}
            title={s.value === 0 ? 'Tạm dừng' : `${s.value} ngày mỗi giây`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="speeds" role="group" aria-label="Chạy nhanh">
        {SKIPS.map((s) => (
          <button key={s.days} type="button" disabled={blocked || running} onClick={() => actions.skip(s.days)}>
            ⏩ {s.label}
          </button>
        ))}
      </div>
      {running && <span className="running">Đang chạy…</span>}
      <label className="check">
        <input type="checkbox" checked={stopOnImportant} onChange={(e) => actions.setStopOnImportant(e.target.checked)} />
        Dừng khi có biến cố quan trọng
      </label>
      <label className="check" title="Khung, trận pháp và bảng màu Ngọc Các; tắt để dùng giao diện tối giản">
        <input type="checkbox" checked={ornate} onChange={(e) => actions.setOrnate(e.target.checked)} />
        Trang trí
      </label>
      <span className="spacer" />
      <button type="button" onClick={() => actions.openChronicle()}>Sử ký</button>
      <button type="button" onClick={() => { void actions.refreshSaves(); useUi.setState({ savesOpen: true }); }}>Lưu / Tải</button>
    </header>
  );
}

function SidePanel({ view }: { view: ViewModel }) {
  const tab = useUi((s) => s.tab);
  const notice = useUi((s) => s.notice);
  const running = useUi((s) => s.running);
  const p = view.player;
  return (
    <aside className="side">
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? 'active' : ''} onClick={() => useUi.setState({ tab: t.key })}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="tab-body">
        {tab === 'self' && <SelfPanel view={view} />}
        {tab === 'here' && <HerePanel view={view} />}
        {tab === 'faction' && <FactionPanel view={view} />}
        {tab === 'people' && <PeoplePanel view={view} />}
      </div>
      <section className="actions">
        <h3>Hành động</h3>
        {notice && <p className="notice">{notice}</p>}
        {p.currentAction && (
          <div className="current">
            <div>
              <strong>Đang: {p.currentAction.label}</strong> — còn {p.currentAction.daysLeft}/{p.currentAction.totalDays} ngày
            </div>
            <progress max={p.currentAction.totalDays} value={p.currentAction.totalDays - p.currentAction.daysLeft} />
            <button type="button" disabled={running} title={p.currentAction.cancelHint}
              onClick={() => actions.command({ type: 'CANCEL_ACTION', actionId: p.currentAction!.id })}>
              {p.currentAction.type === 'seclusion' ? 'Xuất quan sớm' : 'Dừng'}
            </button>
            <small>{p.currentAction.cancelHint}</small>
          </div>
        )}
        {GROUPS.map((g) => {
          const items = view.actions.filter((a) => a.group === g.key);
          if (items.length === 0) return null;
          return (
            <div key={g.key} className="action-group">
              <h4>{g.label}</h4>
              {items.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  className="action"
                  disabled={!a.enabled || running}
                  title={a.reason ?? (a.cost > 0 ? `Chi phí: ${a.cost} linh thạch` : '')}
                  onClick={() => (a.key === 'seclusion' ? useUi.setState({ seclusionOpen: true }) : actions.command(a.command))}
                >
                  <span>{a.label}{a.cost > 0 ? ` · ${a.cost} lt` : ''}</span>
                  {!a.enabled && a.reason && <small className="reason">{a.reason}</small>}
                </button>
              ))}
            </div>
          );
        })}
      </section>
    </aside>
  );
}

function EventFeed() {
  const feed = useUi((s) => s.feed);
  const recent = feed.slice(-60).reverse();
  return (
    <section className="feed" aria-label="Biến cố gần đây">
      <h3>Biến cố gần đây</h3>
      <ol>
        {recent.map((f) => (
          <li key={f.eventId} className={`sev-${f.severity}`}>
            <span className="feed-date">{f.date}</span> {f.severity === 'critical' ? '⚠ ' : f.severity === 'important' ? '• ' : ''}{f.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
