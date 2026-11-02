// 讲解字幕条（纯视图）：与语音共用同一段文本 / 同一条 timeline（voice 的 onSubtitle 逐段推送）。
//
// 设计要点：
//   · 当前句用半透明金色底条高亮（<mark>），已读内容不铺满屏幕，避免遮挡器物与按钮；
//   · 长句按 22 字/行断行（优先在标点后断），逐行 block 排布，不会横向溢出面板；
//   · 字号 14 / 16 / 18 三档、位置 底部 / 顶部 两档，均通过 data 属性 + CSS 变量切换，即时生效；
//   · pointer-events:none —— 字幕只做背景信息，绝不挡住任何点击（与拼合/委托屏的点击修复口径一致）；
//   · 字幕开关与语音开关彼此独立：关字幕只隐藏这一条，语音仍照常朗读；关语音时字幕照常推进。
import { VOICE_LABEL } from '../data/guide.js';

// 逐行断行：CJK 按固定字数切分；接近行尾的 8 个字里有标点则优先断在标点之后。
// 用 Array.from 处理代理对，返回的每一行长度都不超过 per。
export function wrapCJK(text, per = 22) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  const chars = Array.from(s);
  if (!(per > 0)) return [chars.join('')];
  const lines = [];
  let i = 0;
  while (i < chars.length) {
    let end = Math.min(chars.length, i + per);
    if (end < chars.length) {
      for (let k = end; k > i + per - 8 && k > i; k--) {
        if (/[。！？；，、,;!?.…—]/.test(chars[k - 1])) { end = k; break; }
      }
    }
    const line = chars.slice(i, end).join('').trim();
    if (line) lines.push(line);
    i = end;
  }
  return lines;
}

export function createGuideSubtitle({ mount, size = 16, position = 'bottom', enabled = true, perLine = 22, label = VOICE_LABEL } = {}) {
  const doc = typeof document !== 'undefined' ? document : null;
  const state = { size, position, enabled: Boolean(enabled), current: '', index: 0, total: 0 };
  let el = null, textEl = null, metaEl = null;

  if (doc) {
    el = doc.createElement('div');
    el.className = 'guide-sub';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'false');
    el.hidden = true;   // 无内容时不占位（首次 update 才显示）
    el.dataset.pos = state.position;
    el.style.setProperty('--gs-fs', state.size + 'px');
    textEl = doc.createElement('p');
    textEl.className = 'gs-text';
    metaEl = doc.createElement('span');
    metaEl.className = 'gs-meta';
    metaEl.textContent = `${label} · 字幕与声音同源`;
    el.append(textEl, metaEl);
    (mount || doc.body).append(el);
  }

  function paintMeta() {
    if (!metaEl) return;
    const total = state.total > 0 ? ` · ${Math.min(state.index + 1, state.total)} / ${state.total}` : '';
    metaEl.textContent = `${label} · 字幕与声音同源${total}`;
  }

  // 逐段推送：seg 来自 guide-voice 的 onSubtitle（与朗读共用同一 timeline）。
  function update(seg) {
    if (!el || !textEl) return;
    const current = String(seg?.current ?? '');
    if (!current) { clear(); return; }
    state.current = current;
    state.index = Number.isFinite(seg?.index) ? seg.index : 0;
    state.total = Number.isFinite(seg?.total) ? seg.total : 0;
    // 当前句逐行渲染为独立的高亮底条（每行一个 <mark>）：
    // 不在 inline 的 <mark> 里再嵌块级行——那种写法会产生多余的匿名行盒，字幕条凭空变高。
    const isMark = true; // 语义：高亮底条（屏幕阅读器按 mark 朗读当前句）
    const nodes = wrapCJK(current, perLine).map(line => {
      const ln = doc.createElement(isMark ? 'mark' : 'span');
      ln.className = 'gs-cur gs-l';
      ln.textContent = line;
      return ln;
    });
    if (textEl.replaceChildren) textEl.replaceChildren(...nodes);
    else { textEl.textContent = ''; nodes.forEach(n => textEl.append(n)); }
    paintMeta();
    el.hidden = !state.enabled;
    el.dataset.state = 'on';
  }

  function clear() {
    if (!el) return;
    state.current = '';
    if (textEl) {
      if (textEl.replaceChildren) textEl.replaceChildren();
      else textEl.textContent = '';
    }
    if (metaEl) metaEl.textContent = `${label} · 字幕与声音同源`;
    el.dataset.state = '';
    el.hidden = true;
  }

  // 设置即时生效：开关 / 字号 / 位置都不需要重建元素。
  function setOptions(opts = {}) {
    if (opts.size !== undefined) {
      state.size = Number(opts.size) || state.size;
      el?.style.setProperty('--gs-fs', state.size + 'px');
    }
    if (opts.position !== undefined) {
      state.position = opts.position === 'top' ? 'top' : 'bottom';
      if (el) el.dataset.pos = state.position;
    }
    if (opts.enabled !== undefined) {
      state.enabled = Boolean(opts.enabled);
      if (el) el.hidden = !state.enabled || !state.current;
    }
    return { ...state };
  }

  function dispose() { el?.remove?.(); el = null; textEl = null; metaEl = null; }

  return { el, update, clear, setOptions, dispose, get options() { return { ...state }; } };
}
