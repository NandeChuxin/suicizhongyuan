// 讲解语音 / 字幕的偏好设置仓库（独立 key：guide-settings-v1）。
//
// 为什么单独一个模块：
//   · 讲解模块（guide-voice / guide-panel / guide-character / guide-agent）被测试静态守卫约束为
//     「不得触碰主线存档或 localStorage」——它们必须保持纯视图/纯逻辑；
//   · 这里只保存界面偏好（语速 / 音色 / 字幕字号 / 字幕位置 / 开关），不写进度、不上传、
//     与主线存档 key（porcelain-reunion-progress-v1）完全隔离；
//   · 读不到、写不进（隐私模式 / Node 测试环境 / 配额满）一律静默回退默认值，绝不抛错。

export const GUIDE_SETTINGS_KEY = 'guide-settings-v1';
export const SPEAK_RATES = [0.8, 1, 1.2];
export const TONE_IDS = ['steady', 'bright'];
export const SUBTITLE_SIZES = [14, 16, 18];
export const SUBTITLE_POSITIONS = ['bottom', 'top'];

export const TONE_LABELS = { steady: '沉稳', bright: '清亮' };

export const DEFAULT_GUIDE_SETTINGS = Object.freeze({
  rate: 1,              // 语速档位（0.8 / 1 / 1.2）
  tone: 'steady',       // 音色（沉稳 / 清亮）
  subtitleSize: 16,     // 字幕字号（14 / 16 / 18）
  subtitlePos: 'bottom',// 字幕位置（bottom / top）
  subtitleOn: true,     // 字幕开关（与语音开关互相独立）
  voiceOn: true         // 语音开关
});

const toNum = v => (typeof v === 'number' ? v : Number.parseFloat(v));
const clampNum = (v, min, max, fallback) => {
  const n = toNum(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
// 语速就近取档：任何输入都归到 0.8 / 1 / 1.2 之一（避免存档里出现无法解释的中间值）。
export function nearestRate(v) {
  const n = clampNum(v, 0.5, 2, DEFAULT_GUIDE_SETTINGS.rate);
  return SPEAK_RATES.reduce((best, r) => (Math.abs(r - n) <= Math.abs(best - n) ? r : best), SPEAK_RATES[0]);
}
// 字号就近取档：14 / 16 / 18。
export function nearestSubtitleSize(v) {
  const n = clampNum(v, 12, 22, DEFAULT_GUIDE_SETTINGS.subtitleSize);
  return SUBTITLE_SIZES.reduce((best, s) => (Math.abs(s - n) <= Math.abs(best - n) ? s : best), SUBTITLE_SIZES[0]);
}

// 把任意来源（存档 / 外部传入）的对象收敛为合法设置；未知字段忽略，缺失字段取默认。
export function normalizeGuideSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    rate: nearestRate(src.rate),
    tone: TONE_IDS.includes(src.tone) ? src.tone : DEFAULT_GUIDE_SETTINGS.tone,
    subtitleSize: nearestSubtitleSize(src.subtitleSize),
    subtitlePos: SUBTITLE_POSITIONS.includes(src.subtitlePos) ? src.subtitlePos : DEFAULT_GUIDE_SETTINGS.subtitlePos,
    subtitleOn: src.subtitleOn === undefined ? DEFAULT_GUIDE_SETTINGS.subtitleOn : Boolean(src.subtitleOn),
    voiceOn: src.voiceOn === undefined ? DEFAULT_GUIDE_SETTINGS.voiceOn : Boolean(src.voiceOn)
  };
}

function safeStorage(storage) {
  if (storage) return storage;
  try {
    const ls = globalThis.localStorage;
    // 隐私模式下 getItem 也可能抛错，这里只做能力探测，真正读写仍在 try 里。
    if (ls && typeof ls.getItem === 'function') return ls;
  } catch { /* ignore */ }
  return null;
}

export function loadGuideSettings(storage) {
  const ls = safeStorage(storage);
  if (!ls) return { ...DEFAULT_GUIDE_SETTINGS };
  try {
    const raw = ls.getItem(GUIDE_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_GUIDE_SETTINGS };
    return normalizeGuideSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_GUIDE_SETTINGS };
  }
}

export function saveGuideSettings(settings, storage) {
  const clean = normalizeGuideSettings(settings);
  const ls = safeStorage(storage);
  if (!ls) return clean;
  try { ls.setItem(GUIDE_SETTINGS_KEY, JSON.stringify(clean)); } catch { /* 配额满 / 被禁用：静默失败 */ }
  return clean;
}
