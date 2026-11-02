// 数字展厅「自动导览」：沿六件器物逐位巡礼，每件 30~60 秒，随时可暂停 / 继续 / 跳过 / 静音。
// 刻意不做成不可跳过的长片：节奏由用户掌控，文案与聚焦由集成层回调提供。
// 本模块不读写任何进度存档（展厅浏览规则）。
export const TOUR_MIN_SECONDS = 30;
export const TOUR_MAX_SECONDS = 60;

export function createMuseumTour({
  count = 6, duration = 45, reduced = false,
  onFocus, onEnd, onTick, onState
} = {}) {
  const total = Math.max(1, count);
  const per = Math.min(TOUR_MAX_SECONDS, Math.max(TOUR_MIN_SECONDS, duration));
  const state = { active: false, paused: false, muted: false, index: 0, elapsed: 0 };
  let raf = 0, last = 0;

  const emit = reason => onState?.({ active: state.active, paused: state.paused, muted: state.muted, index: state.index, total, reason });
  const tick = () => onTick?.({ index: state.index, total, elapsed: state.elapsed, duration: per, progress: Math.min(1, state.elapsed / per) });

  function focus() { onFocus?.(state.index, total); tick(); }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!state.active || state.paused) { last = now; return; }
    const dt = Math.min((now - (last || now)) / 1000, 0.1);
    last = now;
    state.elapsed += dt;
    tick();
    if (state.elapsed >= per) next();
  }

  function next() {
    if (state.index >= total - 1) { finish(); return; }
    state.index += 1; state.elapsed = 0; focus(); emit('advance');
  }

  function finish() {
    state.active = false; state.paused = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    emit('ended');
    onEnd?.();
  }

  function start({ from = 0 } = {}) {
    if (raf) cancelAnimationFrame(raf);
    state.active = true; state.paused = false;
    state.index = Math.min(Math.max(0, from), total - 1);
    state.elapsed = 0;
    last = 0;
    emit('start');
    focus();
    raf = requestAnimationFrame(loop);
  }

  function pause() { if (state.active && !state.paused) { state.paused = true; emit('paused'); } }
  function resume() { if (state.active && state.paused) { state.paused = false; last = 0; emit('resumed'); } }
  function toggle() { state.paused ? resume() : pause(); }
  function skip() { if (state.active) next(); }
  function stop() { finish(); }
  // 静音只影响导览配音（集成层据此停止旁白），不影响视觉巡礼。
  function setMuted(m) { state.muted = Boolean(m); emit('muted'); }

  return {
    start, pause, resume, toggle, skip, stop, setMuted,
    get active() { return state.active; },
    get paused() { return state.paused; },
    get muted() { return state.muted; },
    get index() { return state.index; },
    get total() { return total; },
    get duration() { return per; },
    get reduced() { return reduced; },
    dispose() { if (raf) cancelAnimationFrame(raf); raf = 0; state.active = false; }
  };
}