import type { ChoiceView, ViewModel } from '@tmtg/shared';
import { useRef, useState, type ReactNode } from 'react';
import { actions, useUi, type InterruptState } from '../app/store.ts';

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose?: () => void }) {
  return (
    <div className="backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal card">
        <header className="modal-head">
          <h2>{title}</h2>
          {onClose && <button type="button" onClick={onClose} aria-label="Đóng">✕</button>}
        </header>
        {children}
      </div>
    </div>
  );
}

const REASON_TITLE: Record<InterruptState['reason'], string> = {
  critical_event: 'Biến cố khẩn',
  important_event: 'Biến cố quan trọng',
  player_action_finished: 'Hành động kết thúc',
  choice_required: 'Cần bạn quyết định',
  game_over: 'Thân tử đạo tiêu',
  skip_done: 'Thời gian đã trôi',
};

/** Ngắt / tóm tắt sau Skip. Nếu đang bế quan bị ngắt: tiếp tục hoặc xuất quan sớm (ADR-06). */
export function InterruptDialog({ view, interrupt }: { view: ViewModel; interrupt: InterruptState }) {
  const { reason, entry, summary } = interrupt;
  const current = view.player.currentAction;
  const inSeclusion = current?.type === 'seclusion' && reason !== 'player_action_finished';
  const years = summary ? Math.max(0, Math.round(((summary.toDay - summary.fromDay) / 360) * 10) / 10) : 0;
  const isSeclusionEnd = reason === 'player_action_finished' && summary !== null;
  return (
    <Modal title={isSeclusionEnd ? 'Xuất quan' : REASON_TITLE[reason]}>
      {entry && <p className={`lead sev-${entry.severity}`}>{entry.date}: {entry.text}</p>}
      {summary && (
        <section className="summary">
          <h3>Trong {years} năm qua ({summary.fromDate} → {summary.toDate})</h3>
          <p>
            Tu vi của bạn: {summary.playerBefore.realmName} {summary.playerBefore.stageName} ({summary.playerBefore.progressPct}%)
            {' → '}<strong>{summary.playerAfter.realmName} {summary.playerAfter.stageName} ({summary.playerAfter.progressPct}%)</strong>
          </p>
          {summary.entries.length === 0
            ? <p className="muted">Thiên hạ yên ả, không có đại sự nào.</p>
            : <ul className="plain chronicle-list">{summary.entries.map((e) => <li key={e.eventId}><span className="feed-date">{e.date}</span> {e.text}</li>)}</ul>}
        </section>
      )}
      {inSeclusion && current ? (
        <div className="row end">
          <p className="muted grow">Bạn đã bế quan {current.totalDays - current.daysLeft} ngày, còn {current.daysLeft} ngày. {current.cancelHint}</p>
          <button type="button" onClick={() => { actions.command({ type: 'CANCEL_ACTION', actionId: current.id }); actions.dismissInterrupt(); }}>
            Xuất quan sớm
          </button>
          <button type="button" className="primary" onClick={() => { actions.dismissInterrupt(); actions.skip(current.daysLeft + 1); }}>
            Tiếp tục bế quan
          </button>
        </div>
      ) : (
        <div className="row end">
          <button type="button" className="primary" onClick={() => actions.dismissInterrupt()}>Đã hiểu</button>
        </div>
      )}
    </Modal>
  );
}

export function ChoiceDialog({ choice }: { choice: ChoiceView }) {
  return (
    <Modal title={choice.title}>
      <p>{choice.text}</p>
      <p className="muted">Hạn trả lời: {choice.expiresDate}. Không trả lời sẽ mặc định “{choice.options.find((o) => o.id === choice.defaultOptionId)?.label}”.</p>
      <div className="row end">
        {choice.options.map((o) => (
          <button key={o.id} type="button" className={o.id === choice.defaultOptionId ? '' : 'primary'}
            onClick={() => actions.command({ type: 'RESOLVE_CHOICE', choiceId: choice.id, optionId: o.id })}>
            {o.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function SeclusionDialog({ view }: { view: ViewModel }) {
  const [years, setYears] = useState(10);
  const option = view.actions.find((a) => a.key === 'seclusion');
  const yearlyCost = option?.cost ?? 0;
  const cost = yearlyCost * years;
  const enough = view.player.spiritStones >= cost;
  const blocked = option && !option.enabled && !option.reason?.startsWith('Không đủ linh thạch') ? option.reason : null;
  return (
    <Modal title="Bế quan" onClose={() => useUi.setState({ seclusionOpen: false })}>
      <label className="field">
        <span>Thời gian: <strong>{years} năm</strong></span>
        <input type="range" min={1} max={10} value={years} onChange={(e) => setYears(Number(e.target.value))} />
      </label>
      <p>Công pháp: {view.player.techniqueName}. Chi phí giữ chỗ: <strong>{cost}</strong> linh thạch (đang có {view.player.spiritStones}).</p>
      <p className="muted">Bế quan tu luyện nhanh hơn 20%, không tham gia tranh chấp. Thế giới vẫn vận hành; biến cố khẩn sẽ gọi bạn dậy.</p>
      {blocked && <p className="notice">{blocked}</p>}
      {!enough && <p className="notice">Không đủ linh thạch cho {years} năm.</p>}
      <div className="row end">
        <button type="button" onClick={() => useUi.setState({ seclusionOpen: false })}>Hủy</button>
        <button type="button" className="primary" disabled={!enough || blocked !== null} onClick={() => actions.startSeclusion(years)}>
          Bắt đầu bế quan
        </button>
      </div>
    </Modal>
  );
}

const SLOTS = ['slot1', 'slot2', 'slot3'];

export function SavesDialog({ allowSave }: { allowSave: boolean }) {
  const saves = useUi((s) => s.saves);
  const fileRef = useRef<HTMLInputElement>(null);
  const bySlot = new Map(saves.map((s) => [s.slot, s]));
  const slots = [...SLOTS, ...(bySlot.has('auto') ? ['auto'] : [])];
  return (
    <Modal title="Lưu / Tải" onClose={() => useUi.setState({ savesOpen: false })}>
      <table className="saves">
        <tbody>
          {slots.map((slot) => {
            const meta = bySlot.get(slot);
            return (
              <tr key={slot}>
                <td>{slot === 'auto' ? 'Tự lưu' : `Ô ${slot.slice(4)}`}</td>
                <td>{meta ? `${meta.playerName} · ngày ${meta.day} · seed ${meta.seed}` : <span className="muted">trống</span>}</td>
                <td className="row end">
                  {allowSave && slot !== 'auto' && <button type="button" onClick={() => actions.save(slot)}>Lưu</button>}
                  {meta && <button type="button" onClick={() => void actions.load(slot)}>Tải</button>}
                  {meta && <button type="button" onClick={() => void actions.remove(slot)}>Xóa</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row end">
        {allowSave && <button type="button" onClick={() => actions.save('__export')}>Xuất file save</button>}
        <button type="button" onClick={() => fileRef.current?.click()}>Nhập file save</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void actions.importFile(f); e.target.value = ''; }} />
      </div>
    </Modal>
  );
}

export function GameOverOverlay({ view }: { view: ViewModel }) {
  const g = view.gameOver!;
  return (
    <Modal title="Thân tử đạo tiêu">
      <p className="lead">{view.player.name} qua đời vào {g.date} — {g.causeText}.</p>
      <p>Hưởng thọ {view.player.ageYears} năm, cảnh giới {view.player.realmName} {view.player.stageName}.</p>
      <div className="row end">
        <button type="button" onClick={() => actions.save('__export')}>Xuất save</button>
        <button type="button" onClick={() => actions.openChronicle()}>Xem Sử ký</button>
        <button type="button" className="primary" onClick={() => useUi.setState({ screen: 'start', view: null, feed: [] })}>Seed mới</button>
      </div>
    </Modal>
  );
}
