// 问答面板（纯视图层）：桌面端可收起侧栏、移动端底部抽屉。
// 只负责 DOM 与无障碍结构；检索、语音、角色全部由 guide-agent 通过回调驱动，
// 因此本文件不引入 three / 音频依赖，也不会改写任何进度存档。
import { LAYER_LABELS } from '../data/culture.js';
import { GUIDE_DISCLAIMER, VOICE_LABEL } from '../data/guide.js';

const FONT_STEPS = [['s', 13], ['m', 15], ['l', 18]];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 只把 http(s) 与站内相对路径渲染成可点击链接，杜绝 javascript: 等危险协议。
const SAFE_URL = /^(https?:\/\/|\.{0,2}\/)/i;
const safeUrl = u => (SAFE_URL.test(String(u || '')) ? String(u) : '');

// 把一条回答渲染为卡片 HTML（标签 + 来源 + 播放控制），供面板与测试复用。
export function answerCardHTML(answer, { question = '' } = {}) {
  const layers = (answer.layers && answer.layers.length ? answer.layers : [answer.layer]).filter(Boolean);
  const chips = layers.map(k => `<span class="gp-chip" data-layer="${esc(k)}">${esc(LAYER_LABELS[k] || '待人工核实')}</span>`).join('');
  const sources = (answer.sources || []).filter(s => s && safeUrl(s.url)).map(s =>
    `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a></li>`).join('');
  const sourceBlock = sources
    ? `<details class="gp-sources"><summary>查看资料来源</summary><ul>${sources}</ul></details>`
    : `<p class="gp-nosource small-note">本条未附外部来源，属于项目原创叙事或数字示意。</p>`;
  const related = (answer.related || []).map(r =>
    `<button type="button" class="gp-reco" data-related-q="${esc(r.question)}">↳ ${esc(r.title)}</button>`).join('');
  const relatedBlock = related ? `<div class="gp-related" role="group" aria-label="相关知识与联想">${related}</div>` : '';
  return `<p class="gp-q">问 · ${esc(question)}</p>`
    + `<h4 class="gp-title">${esc(answer.title || '')}</h4>`
    + `<p class="gp-text">${esc(answer.text || '')}</p>`
    + `<div class="gp-layers">${chips}</div>`
    + sourceBlock
    + relatedBlock
    + `<p class="gp-voicemark small-note">${esc(VOICE_LABEL)} · 字幕与声音同源</p>`
    + `<div class="gp-actions"><button type="button" class="quiet gp-play">▶ 播放讲解</button><button type="button" class="quiet gp-stopplay" hidden>■ 停止播放</button></div>`;
}

export function createGuidePanel({
  mount, onAsk, onClear, onStop, onPlay, onStopPlay, onSubtitle, onFont, onRemoteToggle, onModelChange,
  onRateChange, onToneChange, onSubtitleSize, onSubtitlePosition, onVoiceToggle
} = {}) {
  const el = document.createElement('aside');
  el.className = 'guide-panel';
  el.id = 'guide-panel';
  el.setAttribute('role', 'complementary');
  el.setAttribute('aria-label', '窑火问答 · 数字讲解面板');
  el.hidden = true;
  el.innerHTML = `
    <header class="gp-head">
      <div class="gp-head-text">
        <span class="gp-kicker">窑火问答 · 数字讲解</span>
        <b id="gp-object" class="gp-object">当前讲解对象 · 数字展厅</b>
      </div>
      <div class="gp-head-actions">
        <button type="button" class="quiet" id="gp-font" aria-label="调整正文字号" title="字号 小/中/大">字号 中</button>
        <button type="button" class="quiet" id="gp-subtitle" aria-pressed="true" aria-label="字幕开关">字幕 · 开</button>
        <button type="button" class="quiet" id="gp-remote" aria-pressed="false" aria-label="联网讲解">联网讲解</button>
        <button type="button" class="quiet" id="gp-close" aria-label="收起讲解面板">收起 ×</button>
      </div>
    </header>
    <div class="gp-voice" id="gp-voice" aria-label="语音与字幕设置">
      <div class="gp-seg" role="group" aria-label="语速">
        <span class="gp-seg-label">语速</span>
        <button type="button" class="gp-opt" data-rate="0.8" aria-pressed="false">0.8×</button>
        <button type="button" class="gp-opt" data-rate="1" aria-pressed="true">1.0×</button>
        <button type="button" class="gp-opt" data-rate="1.2" aria-pressed="false">1.2×</button>
      </div>
      <div class="gp-seg" role="group" aria-label="音色（仅影响 AI 合成语音）">
        <span class="gp-seg-label">音色</span>
        <button type="button" class="gp-opt" data-tone="steady" aria-pressed="true">沉稳</button>
        <button type="button" class="gp-opt" data-tone="bright" aria-pressed="false">清亮</button>
      </div>
      <div class="gp-seg" role="group" aria-label="字幕字号">
        <span class="gp-seg-label">字幕</span>
        <button type="button" class="gp-opt" data-subsize="14" aria-pressed="false">14</button>
        <button type="button" class="gp-opt" data-subsize="16" aria-pressed="true">16</button>
        <button type="button" class="gp-opt" data-subsize="18" aria-pressed="false">18</button>
      </div>
      <div class="gp-seg" role="group" aria-label="字幕位置">
        <span class="gp-seg-label">位置</span>
        <button type="button" class="gp-opt" data-subpos="bottom" aria-pressed="true">底部</button>
        <button type="button" class="gp-opt" data-subpos="top" aria-pressed="false">顶部</button>
      </div>
      <button type="button" class="quiet gp-voice-toggle" id="gp-voice-toggle" aria-pressed="true">语音 · 开</button>
    </div>
    <div class="gp-scroll" id="gp-scroll">
      <div class="gp-recos" id="gp-recos" role="group" aria-label="与当前展品相关的推荐问题"></div>
      <div class="gp-answers" id="gp-answers"></div>
    </div>
    <div class="gp-models" id="gp-models" hidden>
      <label class="gp-sr" for="gp-model">选择讲解模型（可选）</label>
      <select id="gp-model" aria-label="选择讲解模型"></select>
    </div>
    <form class="gp-ask" id="gp-ask" autocomplete="off">
      <label class="gp-sr" for="gp-input">向数字讲解员提问</label>
      <input id="gp-input" placeholder="问一件器物、一处纹样或一道工序…" maxlength="120">
      <div class="gp-ask-row">
        <button type="submit" class="primary" id="gp-send">发送</button>
        <button type="button" class="quiet" id="gp-stop" hidden>■ 停止生成</button>
        <button type="button" class="quiet" id="gp-clear">清空</button>
      </div>
    </form>
    <p class="gp-disclaimer small-note">${esc(GUIDE_DISCLAIMER)}</p>`;
  (mount || document.body).append(el);

  const fab = document.createElement('button');
  fab.className = 'quiet guide-fab';
  fab.id = 'guide-fab';
  fab.type = 'button';
  fab.setAttribute('aria-haspopup', 'dialog');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = '✦ 窑火问答';
  (mount || document.body).append(fab);

  const $id = id => el.querySelector('#' + id);
  const answers = $id('gp-answers'), recos = $id('gp-recos'), input = $id('gp-input');
  let fontIndex = 1, subtitleOn = true, busy = false;
  // 语音/字幕偏好（真实来源在 guide-settings.js，这里只做视图回显与事件派发）
  const voiceState = { rate: 1, tone: 'steady', subtitleSize: 16, subtitlePos: 'bottom', voiceOn: true, supported: true };
  // 联网讲解：available 由「是否配置了远程服务」决定（agent 构造时同步），on 为开关状态。
  let remoteAvailable = false, remoteOn = false;

  // —— 展开 / 收起 ——
  function open() {
    el.hidden = false;
    document.body.classList.add('guide-open');
    fab.setAttribute('aria-expanded', 'true');
    if (window.matchMedia('(pointer: fine)').matches) setTimeout(() => input.focus(), 60);
  }
  function close() {
    el.hidden = true;
    document.body.classList.remove('guide-open');
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  }
  function toggle() { el.hidden ? open() : close(); }

  // —— 当前讲解对象 ——
  function setObject(text) { const n = $id('gp-object'); if (n) n.textContent = text ? `当前讲解对象 · ${text}` : '当前讲解对象 · 数字展厅'; }

  // —— 推荐问题 ——
  function setRecommendations(list = []) {
    recos.innerHTML = '';
    for (const q of list.slice(0, 5)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gp-reco';
      b.textContent = q;
      b.onclick = () => ask(q);
      recos.append(b);
    }
  }

  // —— 提问与回答 ——
  function ask(text) {
    const q = String(text ?? input.value ?? '').trim();
    if (!q || busy) return;
    input.value = '';
    onAsk?.(q);
  }

  function beginAnswer(question) {
    busy = true;
    $id('gp-send').hidden = false;
    $id('gp-stop').hidden = false;
    const art = document.createElement('article');
    art.className = 'gp-answer pending';
    art.innerHTML = `<p class="gp-q">问 · ${esc(question)}</p><p class="gp-text gp-wait">正在查阅展览资料…</p>`;
    answers.append(art);
    el.querySelector('.gp-scroll').scrollTop = el.querySelector('.gp-scroll').scrollHeight;
    return art;
  }

  function endAnswer(art, answer, question) {
    busy = false;
    $id('gp-stop').hidden = true;
    if (!art) return;
    art.classList.remove('streaming'); // 撤掉打字机光标
    art.classList.remove('pending');
    art.innerHTML = answerCardHTML(answer, { question });
    const play = art.querySelector('.gp-play'), stop = art.querySelector('.gp-stopplay');
    play.onclick = () => { play.hidden = true; stop.hidden = false; onPlay?.(answer); };
    stop.onclick = () => { play.hidden = false; stop.hidden = true; onStopPlay?.(); };
    // 联想条目：点击即以对应问题重新提问（连回展厅展品或相邻知识）。
    art.querySelectorAll('[data-related-q]').forEach(b => {
      b.onclick = () => ask(b.getAttribute('data-related-q'));
    });
    // 语音结束后自动复位播放按钮。
    art._play = play; art._stop = stop;
    el.querySelector('.gp-scroll').scrollTop = el.querySelector('.gp-scroll').scrollHeight;
    return art;
  }

  // 供 agent 在语音结束/停止时复位对应卡片的播放按钮。
  function resetPlayback() {
    for (const art of answers.querySelectorAll('.gp-answer')) {
      if (art._play && art._stop) { art._play.hidden = false; art._stop.hidden = true; }
    }
  }

  function clear() { answers.innerHTML = ''; onClear?.(); }

  function setBusy(v) { busy = Boolean(v); $id('gp-stop').hidden = !busy; }

  // —— 字号 / 字幕 ——
  function setFontSize(level) {
    const found = FONT_STEPS.findIndex(s => s[0] === level);
    if (found >= 0) fontIndex = found;
    el.style.setProperty('--gp-fs', FONT_STEPS[fontIndex][1] + 'px');
    $id('gp-font').textContent = '字号 ' + { s: '小', m: '中', l: '大' }[FONT_STEPS[fontIndex][0]];
    onFont?.(FONT_STEPS[fontIndex][0]);
  }
  const cycleFont = () => setFontSize(FONT_STEPS[(fontIndex + 1) % FONT_STEPS.length][0]);

  function setSubtitleEnabled(on) {
    subtitleOn = Boolean(on);
    $id('gp-subtitle').textContent = '字幕 · ' + (subtitleOn ? '开' : '关');
    $id('gp-subtitle').setAttribute('aria-pressed', String(subtitleOn));
    onSubtitle?.(subtitleOn);
  }

  // 语音/字幕设置回显：只改 aria-pressed / disabled / 文案，不重建元素（切换即时生效）。
  function setVoiceSettings(patch = {}) {
    Object.assign(voiceState, patch);
    const mark = (sel, attr, val) => el.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(String(b.getAttribute(attr)) === String(val))));
    mark('[data-rate]', 'data-rate', voiceState.rate);
    mark('[data-tone]', 'data-tone', voiceState.tone);
    mark('[data-subsize]', 'data-subsize', voiceState.subtitleSize);
    mark('[data-subpos]', 'data-subpos', voiceState.subtitlePos);
    // 无语音服务：音色置灰（不报错、不隐藏——用户仍能看到"当前环境无语音服务"）。
    const noVoice = !voiceState.supported;
    el.querySelectorAll('[data-tone]').forEach(b => {
      b.disabled = noVoice;
      b.classList.toggle('gp-opt-off', noVoice);
      b.title = noVoice ? '当前环境无语音服务，音色不生效；字幕与阅读不受影响' : '音色：仅调整 AI 合成语音的音高与语速微调';
    });
    const tg = $id('gp-voice-toggle');
    if (tg) {
      tg.textContent = '语音 · ' + (voiceState.voiceOn && !noVoice ? '开' : '关');
      tg.setAttribute('aria-pressed', String(Boolean(voiceState.voiceOn && !noVoice)));
      tg.classList.toggle('gp-opt-off', noVoice);
      tg.title = noVoice ? '当前环境无语音服务：回退为纯字幕阅读' : '语音开关：关掉后只显示字幕，朗读与字幕互不影响';
    }
    return { ...voiceState };
  }

  // —— 流式输出：远程回答逐 delta 追加（textContent，天然免疫 HTML 注入），带打字机光标 ——
  function streamDelta(art, delta) {
    if (!art) return;
    let p = art.querySelector('.gp-text');
    if (!p) {
      p = document.createElement('p');
      p.className = 'gp-text';
      art.append(p);
    }
    p.classList.remove('gp-wait');
    if (p.textContent === '正在查阅展览资料…') p.textContent = '';
    p.textContent += String(delta ?? '');
    art.classList.add('streaming');
    const scroll = el.querySelector('.gp-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }

  // 回退提示：联网讲解不可用（超时 / 404 / 断网）时明确告知已切回本地检索。
  function fallbackNotice() {
    const p = document.createElement('p');
    p.className = 'gp-fallback small-note';
    p.textContent = '联网讲解暂不可用，已切换本地讲解';
    answers.append(p);
    const scroll = el.querySelector('.gp-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }

  // —— 联网讲解开关 ——
  // 未配置远程服务：置灰 + 提示「未配置远程服务，当前为本地讲解」，点击无效果。
  function setRemoteAvailable(available) {
    remoteAvailable = Boolean(available);
    const b = $id('gp-remote');
    b.classList.toggle('gp-remote-off', !remoteAvailable);
    b.disabled = !remoteAvailable;
    if (!remoteAvailable) {
      b.textContent = '联网讲解';
      b.title = '未配置远程服务，当前为本地讲解';
      b.setAttribute('aria-label', '未配置远程服务，当前为本地讲解');
      b.setAttribute('aria-pressed', 'false');
      return;
    }
    b.title = '联网讲解：回答由远程大模型流式生成，展示前仍经本地领域与标签校验';
    setRemoteOn(remoteOn);
  }
  function setRemoteOn(on) {
    remoteOn = Boolean(on);
    const b = $id('gp-remote');
    if (!remoteAvailable) return;
    b.textContent = '联网讲解 · ' + (remoteOn ? '开' : '关');
    b.setAttribute('aria-pressed', String(remoteOn));
    b.setAttribute('aria-label', '联网讲解' + (remoteOn ? '（已开启，点击关闭）' : '（已关闭，点击开启）'));
  }

  // —— 模型选择（可选能力）：后端未提供或请求失败时保持隐藏 ——
  function setModels(list = []) {
    const wrap = $id('gp-models'), sel = $id('gp-model');
    const items = (list || []).filter(m => m && m.id);
    if (!items.length) { wrap.hidden = true; sel.innerHTML = ''; return; }
    sel.innerHTML = '';
    for (const m of items) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name || m.id;
      if (m.desc) opt.title = m.desc;
      sel.append(opt);
    }
    wrap.hidden = false;
  }

  fab.onclick = toggle;
  $id('gp-close').onclick = close;
  $id('gp-font').onclick = cycleFont;
  $id('gp-subtitle').onclick = () => setSubtitleEnabled(!subtitleOn);
  // —— 语速 / 音色 / 字幕字号 / 字幕位置 / 语音开关（全部即时生效；音色在无语音服务时置灰）——
  const bindOpts = (sel, attr, apply) => { el.querySelectorAll(sel).forEach(b => { b.onclick = () => { if (b.disabled) return; apply(b.getAttribute(attr)); }; }); };
  bindOpts('[data-rate]', 'data-rate', v => { const r = Number(v); setVoiceSettings({ rate: r }); onRateChange?.(r); });
  bindOpts('[data-tone]', 'data-tone', v => { setVoiceSettings({ tone: v }); onToneChange?.(v); });
  bindOpts('[data-subsize]', 'data-subsize', v => { const n = Number(v); setVoiceSettings({ subtitleSize: n }); onSubtitleSize?.(n); });
  bindOpts('[data-subpos]', 'data-subpos', v => { setVoiceSettings({ subtitlePos: v }); onSubtitlePosition?.(v); });
  $id('gp-voice-toggle').onclick = () => { const on = !voiceState.voiceOn; setVoiceSettings({ voiceOn: on }); onVoiceToggle?.(on); };
  $id('gp-remote').onclick = () => { if (!remoteAvailable) return; onRemoteToggle?.(!remoteOn); };
  $id('gp-model').onchange = () => onModelChange?.($id('gp-model').value);
  $id('gp-clear').onclick = clear;
  $id('gp-stop').onclick = () => onStop?.();
  $id('gp-ask').addEventListener('submit', e => { e.preventDefault(); ask(); });
  // ESC 收起（移动端抽屉尤其需要）。
  el.addEventListener('keydown', e => { if (e.key === 'Escape' && !input.value) close(); });

  setFontSize('m');
  setSubtitleEnabled(true);
  setVoiceSettings({});
  setRemoteAvailable(false); // 默认未配置态（置灰 + 提示），agent 构造时按环境配置同步

  return {
    el, fab, open, close, toggle, get isOpen() { return !el.hidden; },
    setObject, setRecommendations, ask, beginAnswer, endAnswer, resetPlayback,
    streamDelta, fallbackNotice,
    setRemoteAvailable, setRemoteOn, setModels,
    get remoteAvailable() { return remoteAvailable; },
    get remoteOn() { return remoteOn; },
    clear, setBusy, setFontSize, get fontSize() { return FONT_STEPS[fontIndex][0]; },
    setSubtitleEnabled, get subtitleEnabled() { return subtitleOn; },
    setVoiceSettings, get voiceSettings() { return { ...voiceState }; },
    get input() { return input; }, get list() { return answers; }
  };
}