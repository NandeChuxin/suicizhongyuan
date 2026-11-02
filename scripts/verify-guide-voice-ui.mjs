// 窑火问答 · 语音与字幕体验验证：语速三档 / 音色两档 / 字幕字号·位置·开关 / 语音开关 / 持久化
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 240)));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2600);

const click = async sel => {
  const c = await page.evaluate(s => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  if (!c) { console.log('  缺失元素', sel); return false; }
  await page.mouse.click(c[0], c[1]);
  await page.waitForTimeout(500);
  return true;
};
const subState = () => page.evaluate(() => {
  const el = document.querySelector('.guide-sub');
  if (!el) return null;
  const cs = getComputedStyle(el);
  const lines = [...el.querySelectorAll('.gs-l')].map(n => n.textContent);
  return {
    hidden: el.hidden, pos: el.dataset.pos, fontSize: cs.fontSize,
    lines, maxLine: lines.reduce((m, l) => Math.max(m, Array.from(l).length), 0),
    marked: !!el.querySelector('mark.gs-cur'), meta: el.querySelector('.gs-meta')?.textContent || '',
    box: (() => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; })()
  };
});
const panelState = () => page.evaluate(() => {
  const q = s => document.querySelector(s);
  const pressed = sel => [...document.querySelectorAll(sel)].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent);
  return {
    rate: pressed('[data-rate]'), tone: pressed('[data-tone]'), size: pressed('[data-subsize]'), pos: pressed('[data-subpos]'),
    toneDisabled: [...document.querySelectorAll('[data-tone]')].every(b => b.disabled),
    voiceBtn: q('#gp-voice-toggle')?.textContent, subtitleBtn: q('#gp-subtitle')?.textContent,
    stored: (() => { try { return localStorage.getItem('guide-settings-v1'); } catch { return 'n/a'; } })()
  };
});

// 打开问答面板并播一段讲解
await click('#guide-entry');
await page.waitForTimeout(600);
console.log('面板设置条可见:', await page.evaluate(() => !!document.querySelector('.gp-voice')));
// 点第一个推荐问题 → 得到回答 → 播放讲解
const reco = await page.evaluate(() => { const b = document.querySelector('#gp-recos .gp-reco'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
if (reco) { await page.mouse.click(reco[0], reco[1]); await page.waitForTimeout(1600); }
const played = await click('.gp-play');
await page.waitForTimeout(900);
let s = await subState();
console.log('① 播放讲解 → 字幕:', JSON.stringify(s ? { hidden: s.hidden, marked: s.marked, fontSize: s.fontSize, maxLine: s.maxLine, meta: s.meta.slice(0, 30), lines: s.lines.length } : null));
console.log('   面板初始:', JSON.stringify(await panelState()));

// ② 语速三档
for (const r of ['0.8', '1.2', '1']) { await click(`[data-rate="${r}"]`); }
s = await subState();
let p = await panelState();
console.log('② 语速切换后 面板选中=', JSON.stringify(p.rate), '存储=', p.stored);

// ③ 音色两档
await click('[data-tone="bright"]');
p = await panelState();
console.log('③ 音色切换后 选中=', JSON.stringify(p.tone), '音色按钮禁用=', p.toneDisabled, '存储=', p.stored);

// ④ 字幕字号 14 / 18
await click('[data-subsize="14"]'); s = await subState(); console.log('④ 字号14 →', s.fontSize, '（字幕显示中=', !s.hidden, '）');
await click('[data-subsize="18"]'); s = await subState(); console.log('   字号18 →', s.fontSize);

// ⑤ 位置 顶部 / 底部
await click('[data-subpos="top"]'); s = await subState(); console.log('⑤ 位置顶部 → data-pos=', s.pos, 'box=', JSON.stringify(s.box));
await click('[data-subpos="bottom"]'); s = await subState(); console.log('   位置底部 → data-pos=', s.pos, 'box=', JSON.stringify(s.box));

// ⑥ 字幕关 / 语音关 互不影响
await click('#gp-subtitle'); s = await subState(); p = await panelState();
console.log('⑥ 关字幕 → 字幕hidden=', s.hidden, '语音按钮=', p.voiceBtn, '字幕按钮=', p.subtitleBtn);
await click('#gp-subtitle'); s = await subState();
console.log('   重新开字幕 → hidden=', s.hidden, '当前句仍在=', s.marked);
await click('#gp-voice-toggle'); p = await panelState(); s = await subState();
console.log('   关语音 → 语音按钮=', p.voiceBtn, '字幕仍在=', !s.hidden && s.marked);
await click('#gp-voice-toggle');

// ⑦ 刷新后设置是否保留
const before = await panelState();
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2400);
await page.evaluate(() => document.querySelector('#guide-entry')?.click());
await page.waitForTimeout(700);
const after = await panelState();
console.log('⑦ 刷新前后对比: 之前=', JSON.stringify({ rate: before.rate, tone: before.tone, size: before.size, pos: before.pos }), '之后=', JSON.stringify({ rate: after.rate, tone: after.tone, size: after.size, pos: after.pos }));
await page.screenshot({ path: 'D:/数字媒体/碎瓷重圆/artifacts/guide-voice-settings.png' });
await browser.close();
console.log('DONE');
