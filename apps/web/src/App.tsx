import { useEffect } from 'react';
import { actions, useUi } from './app/store.ts';
import { ChronicleScreen } from './components/ChronicleScreen.tsx';
import { GameScreen } from './components/GameScreen.tsx';
import { StartScreen } from './components/StartScreen.tsx';

export function App() {
  const screen = useUi((s) => s.screen);
  const error = useUi((s) => s.error);
  const ornate = useUi((s) => s.ornate);

  // W7: bật/tắt lớp trang trí "Ngọc Các" bằng thuộc tính trên <html> (CSS đổi token màu, khung, phông tiêu đề).
  useEffect(() => {
    document.documentElement.dataset['ornate'] = ornate ? 'on' : 'off';
  }, [ornate]);

  // Tự lưu khi tab bị ẩn (ADR-15). Chỉ là thao tác giao diện, không ảnh hưởng mô phỏng.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && useUi.getState().view) actions.save('auto');
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  return (
    <>
      {error && (
        <div className="banner banner-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => useUi.setState({ error: null })}>Đóng</button>
        </div>
      )}
      {screen === 'start' && <StartScreen />}
      {screen === 'game' && <GameScreen />}
      {screen === 'chronicle' && <ChronicleScreen />}
    </>
  );
}
