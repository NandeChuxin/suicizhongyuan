// 讲解语音：优先使用浏览器合成语音（speechSynthesis），无语音服务时自动回退到字幕朗读。
// 语速（0.8 / 1 / 1.2）与音色（沉稳 / 清亮）都是「参数差异」：语音侧改 utterance.rate / pitch，
// 字幕侧用**同一个速率系数**缩放每秒推进字数（cps）——两边始终同源、同一 timeline。
// 切换语速/音色时：若正在发声，从「当前句」重新合成剩余文本（不打断字幕时间轴、不重复已读句）；
// 无语音服务时只作用于字幕推进速率，不报错。
// 合规边界：
//   · 不进行真人声音克隆，不声称复原真实古人声音，不使用任何未经授权的录音；
//   · 两套音色（基础讲解 / 数字策展员）只是「语速 + 音高 + 中文音色」的参数差异；
//   · 首次播放必须由用户主动触发（本模块不做任何自动播放）；
//   · 字幕与声音来自同一段文本，保证一致；
//   · 页面隐藏时停止，用户静音后不会自行重新发声。
const PROFILES = {
  character: { rate: 0.88, pitch: 0.9, volume: 0.9, cps: 5.0, label: '基础讲解音色' },
  qiling: { rate: 0.9, pitch: 1.7, volume: 0.9, cps: 5.4, label: '器灵音色（AI 合成 · 幼态可爱声线）' },
  curator: { rate: 1.0, pitch: 1.0, volume: 0.92, cps: 6.2, label: '数字策展员音色' }
};

// 两档音色只在「基础音色档案」上做轻微偏移（不改角色身份，不克隆任何真实人声）：
//   沉稳：略压低音高、稍放慢，字幕推进同样放慢；
//   清亮：略抬高音高、稍加快，字幕推进同步加快。
export const TONE_PRESETS = {
  steady: { rate: 0.95, pitch: 0.9, label: '沉稳' },
  bright: { rate: 1.05, pitch: 1.22, label: '清亮' }
};
export const SPEAK_RATE_STEPS = [0.8, 1, 1.2];
const clampNum = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
export function nearestSpeakRate(v) {
  const n = clampNum(v, 0.5, 2, 1);
  return SPEAK_RATE_STEPS.reduce((best, r) => (Math.abs(r - n) < Math.abs(best - n) ? r : best), SPEAK_RATE_STEPS[0]);
}

// 按中英文标点切分为字幕段，逐段显现，便于与语音同步。
export function splitSegments(text) {
  const parts = String(text || '')
    .split(/(?<=[。！？；!?;])|(?<=[，、,])/)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [String(text || '').trim()].filter(Boolean);
}

export function createGuideVoice({ onSubtitle, onState } = {}) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const supported = Boolean(synth && typeof window !== 'undefined' && window.SpeechSynthesisUtterance);
  const state = { speaking: false, paused: false, muted: false, profile: 'character', rate: 1, tone: 'steady' };
  let timer = null, segs = [], index = 0, tickAcc = 0, charAcc = 0, onDone = null;
  let utter = null;   // 当前 utterance（切换语速/音色时要先摘掉回调，避免 cancel 触发 finish）
  // 语音速率系数与字幕推进系数是同一个值：rate 档位 × 音色微调。
  const speedFactor = () => state.rate * (TONE_PRESETS[state.tone] || TONE_PRESETS.steady).rate;
  // 字幕每秒推进字数：基础 cps × 速率系数（无语音服务时这就是唯一生效的"语速"）。
  const cpsNow = () => (PROFILES[state.profile] || PROFILES.character).cps * speedFactor();

  const emitState = reason => onState?.({ ...state, reason });
  const emitSubtitle = () => onSubtitle?.({
    text: segs.slice(0, index + 1).join(''),
    current: segs[index] || '',
    index,
    total: segs.length,
    speaking: state.speaking
  });

  function clearTimer() { if (timer) { clearInterval(timer); timer = null; } }

  // 字幕推进器：以「字符数 / 语速」估算时长，无语音时也照常走字幕。
  function startTicker() {
    clearTimer();
    const stepMs = 120;
    timer = setInterval(() => {
      if (state.paused) return;
      tickAcc += stepMs / 1000;
      // 每 tick 读实时 cps：切换语速/音色后，当前句的剩余时长立刻按新系数折算（无需重启计时器）。
      const need = (segs[index] || '').length / cpsNow();
      if (tickAcc >= need) {
        tickAcc = 0;
        index++;
        if (index >= segs.length) { finish(); return; }
        emitSubtitle();
      }
      charAcc += 1;
    }, stepMs);
  }

  function finish() {
    clearTimer();
    state.speaking = false; state.paused = false;
    onSubtitle?.({ text: segs.join(''), current: '', index: segs.length - 1, total: segs.length, speaking: false, done: true });
    emitState('ended');
    const done = onDone; onDone = null; done?.();
  }

  function pickVoice() {
    if (!supported) return null;
    // 只用系统已有的中文合成音色，不指定任何真实人物音色（不做真人声音克隆 / 仿制）。
    const voices = synth.getVoices().filter(v => /zh|cmn|Chinese/i.test(v.lang || ''));
    return voices[0] || null;
  }

  function speak(text, { profile = 'character', onEnd } = {}) {
    stop();
    state.profile = PROFILES[profile] ? profile : 'character';
    segs = splitSegments(text);
    if (!segs.length) { onEnd?.(); return; }
    index = 0; tickAcc = 0; charAcc = 0; onDone = onEnd || null;
    state.speaking = true; state.paused = false;
    emitSubtitle();
    emitState('start');
    utterFrom(0);
    startTicker();
  }

  // 从第 startIndex 段起把剩余文本交给浏览器合成语音（语音与字幕同源：utterance 文本 = 剩余字幕段拼接）。
  // 语速/音色切换时用它"从当前句重新合成"，因此不会重复已读句，也不打断字幕时间轴。
  function utterFrom(startIndex) {
    if (!supported || state.muted) return;
    const rest = segs.slice(startIndex).join('');
    if (!rest) return;
    try {
      detachUtter();
      const cfg = PROFILES[state.profile] || PROFILES.character;
      const tone = TONE_PRESETS[state.tone] || TONE_PRESETS.steady;
      const u = new window.SpeechSynthesisUtterance(rest);
      // 语速：角色基准 × 用户档位 × 音色微调（与字幕 cps 用的是同一系数）
      u.rate = clampNum(cfg.rate * speedFactor(), 0.1, 10, 1);
      u.pitch = clampNum(cfg.pitch * tone.pitch, 0, 2, 1);
      u.volume = cfg.volume; u.lang = 'zh-CN';
      const v = pickVoice(); if (v) u.voice = v;
      // 有边界事件时用它校正字幕（部分浏览器对中文不触发，故仅作增强）。
      // charIndex 相对"剩余文本"，需要加上起始段偏移。
      u.onboundary = e => {
        if (typeof e.charIndex !== 'number') return;
        let acc = 0, i = startIndex;
        while (i < segs.length && acc + segs[i].length <= e.charIndex) { acc += segs[i].length; i++; }
        if (i !== index && i < segs.length) { index = i; tickAcc = 0; emitSubtitle(); }
      };
      u.onend = () => { if (state.speaking) finish(); };
      u.onerror = () => { if (state.speaking) finish(); };
      utter = u;
      try { synth.cancel(); } catch { /* ignore */ }
      synth.speak(u);
    } catch { /* 语音异常时仍保留字幕推进 */ }
  }

  // 先摘掉旧 utterance 的回调再 cancel：cancel 会触发 onend/onerror，若不摘会误判为「整段播完」。
  function detachUtter() {
    if (!utter) return;
    try { utter.onend = null; utter.onerror = null; utter.onboundary = null; } catch { /* ignore */ }
    utter = null;
  }

  // 语速 / 音色变更后的即时重同步：字幕系数由 cpsNow() 实时读取，语音则从当前句重合成。
  function resync() {
    if (!state.speaking) return;
    if (supported && !state.muted) utterFrom(index);
    emitState('rate');
  }

  function stop() {
    clearTimer();
    detachUtter();
    if (supported) { try { synth.cancel(); } catch { /* ignore */ } }
    const wasSpeaking = state.speaking;
    state.speaking = false; state.paused = false;
    onDone = null;
    if (wasSpeaking) { emitSubtitle(); emitState('stopped'); }
  }

  function pause() {
    if (!state.speaking || state.paused) return;
    state.paused = true;
    if (supported && !state.muted) { try { synth.pause(); } catch { /* ignore */ } }
    emitState('paused');
  }

  function resume() {
    if (!state.speaking || !state.paused) return;
    state.paused = false;
    if (supported && !state.muted) { try { synth.resume(); } catch { /* ignore */ } }
    emitState('resumed');
  }

  function toggle() { state.paused ? resume() : pause(); }

  // 静音：立即停止发声；此后 speak() 只走字幕，不会自动重新开声。
  function setMuted(muted) {
    const was = state.muted;
    state.muted = Boolean(muted);
    if (state.muted && state.speaking) {
      detachUtter();
      if (supported) { try { synth.cancel(); } catch { /* ignore */ } }
      state.paused = false;
    }
    // 朗读中途重新开声：从当前句接着说（字幕一直没停，所以不需要重放已读内容）。
    if (!state.muted && was && state.speaking) utterFrom(index);
    emitState('muted');
  }

  // —— 语速（0.8 / 1 / 1.2）——
  // 即时生效：字幕推进系数立刻改变；正在发声则从当前句以新语速重合成（不卡顿、不重复已读句）。
  function setRate(rate) {
    const next = nearestSpeakRate(rate);
    if (next === state.rate) return next;
    state.rate = next;
    resync();
    return next;
  }

  // —— 音色（沉稳 / 清亮）——
  // 只是 utterance.pitch 与语速的轻微偏移；无语音服务时仅记录选择（不影响字幕推进，不抛错）。
  function setTone(tone) {
    if (!TONE_PRESETS[tone]) return state.tone;
    if (tone === state.tone) return state.tone;
    state.tone = tone;
    resync();
    return state.tone;
  }

  // —— 语音开关（与字幕开关互相独立）——
  // 关：立刻静音，字幕照常逐段推进；开：若正在朗读则从当前句接着说。
  function setVoiceEnabled(on) { setMuted(!on); return !state.muted; }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  }

  return {
    supported,
    speak, stop, pause, resume, toggle, setMuted,
    setRate, setTone, setVoiceEnabled,
    // 当前生效的速率系数（语音 utterance.rate 与字幕 cps 共用同一值，供 UI 展示/测试断言）
    speedFactor,
    cps: cpsNow,
    get speaking() { return state.speaking; },
    get paused() { return state.paused; },
    get muted() { return state.muted; },
    get voiceEnabled() { return !state.muted; },
    get profile() { return state.profile; },
    get rate() { return state.rate; },
    get tone() { return state.tone; },
    profiles: PROFILES,
    tones: TONE_PRESETS
  };
}