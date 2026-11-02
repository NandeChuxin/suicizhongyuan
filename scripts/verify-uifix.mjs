// 观感修复验收：三档宽度 × 面板开合，逐屏截图 + 自动重叠/字号审计
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:5199/';
const WIDTHS = [[1366, 768], [1920, 1080], [2560, 1440]];
const SCREENS = ['start', 'commission', 'puzzle', 'memory', 'choice', 'certificate', 'tour', 'exhibit'];
mkdirSync('artifacts/uifix', { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = [];

// 页面内审计函数：字号下限 / 矩形相交
const AUDIT = () => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0.05; };
  const rect = el => el.getBoundingClientRect();
  const inter = (a, b) => { const ax = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)); const ay = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)); return ax * ay; };
  const name = el => el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0, 2).join('.');
  const out = { tinyFonts: [], overlaps: [] };
  // ① 字号扫描：可见文本节点 < 11px
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length && ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    if (!vis(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 11) out.tinyFonts.push(`${name(el)}:${fs}px`);
  }
  // ② 关键重叠对
  const q = s => [...document.querySelectorAll(s)].filter(vis);
  const pairs = [
    ['.tour-console', '.tour-title', '考察控制台与标题叠'],
    ['#gyro', '#guide-tour', '右下按钮互叠'],
    ['.guide-character', '.side-card,.exhibit-placard,.hero-card,.puzzle-panel', '器灵与正文卡叠'],
    ['#tour-note', '.tour-console', '手记卡与控制台叠'],
    ['.tour-note', '.tour-hint', '手记卡与提示叠'],
  ];
  for (const [a, b, label] of pairs) for (const ea of q(a)) for (const eb of q(b)) {
    if (ea.contains(eb) || eb.contains(ea)) continue;
    const area = inter(rect(ea), rect(eb));
    if (area > 200) {
      const za = parseFloat(getComputedStyle(ea).zIndex) || 0;
      // 器灵(z3, fixed) 在 .screen(z4) 之下 → 卡片文字必然在器灵之上 =「文字在上」合规
      const compliant = label.includes('器灵') && za === 3;
      out.overlaps.push(`${label} ${name(ea)}×${name(eb)} area=${Math.round(area)}${compliant ? ' [文字在上·合规]' : ' [违规]'}`);
    }
  }
  return out;
};

for (const [w, h] of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  for (const s of SCREENS) {
    await page.evaluate(v => { document.querySelector(`[data-preview="${v}"]`)?.click(); }, s);
    await page.waitForTimeout(s === 'tour' ? 4500 : 1600);
    // 面板关
    await page.screenshot({ path: `artifacts/uifix/${w}-${s}-closed.png` });
    let a = await page.evaluate(AUDIT);
    report.push({ w, screen: s, state: 'closed', ...a, errs: [...errs] });
    // 面板开
    await page.evaluate(() => { const f = document.getElementById('guide-fab'); if (f && document.getElementById('guide-panel').hidden) f.click(); });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `artifacts/uifix/${w}-${s}-open.png` });
    a = await page.evaluate(AUDIT);
    // 面板开启时：卡片/场景文字不得被面板（右侧 376px）压住；同时证书不得溢出视口
    const under = await page.evaluate(() => {
      const p = document.getElementById('guide-panel');
      if (!p || p.hidden) return [];
      const pr = p.getBoundingClientRect(); const out = [];
      const vis = el => { const r = el.getBoundingClientRect(); return r.width && r.height && getComputedStyle(el).display !== 'none' && parseFloat(getComputedStyle(el).opacity) > .5; };
      for (const el of document.querySelectorAll('.side-card,.exhibit-placard,.hero-card,.tour-map,.tour-console,.certificate,.puzzle-panel,.tour-note')) {
        if (!vis(el)) continue; const r = el.getBoundingClientRect();
        const cut = Math.min(r.right, pr.right) - Math.max(r.left, pr.left);
        if (cut > 8) out.push(`${String(el.className).split(' ').slice(0, 2).join('.')} 被面板压住 ${Math.round(cut)}px`);
      }
      const c = document.querySelector('.certificate');
      if (c && vis(c) && c.getBoundingClientRect().right > innerWidth - 4) out.push('证书溢出视口右缘 ' + Math.round(c.getBoundingClientRect().right - innerWidth) + 'px');
      return out;
    });
    report.push({ w, screen: s, state: 'open', ...a, underPanel: under, errs: [...errs] });
    await page.evaluate(() => document.getElementById('gp-close')?.click());
    await page.waitForTimeout(400);
  }
  await page.close();
}
await browser.close();

let bad = 0;
for (const r of report) {
  const issues = [...r.tinyFonts.slice(0, 6), ...r.overlaps.filter(o => !o.includes('合规')), ...(r.underPanel || [])];
  if (issues.length || r.errs.length) {
    bad++;
    console.log(`\n[${r.w} ${r.screen} ${r.state}]`);
    issues.forEach(i => console.log('  ✗ ' + i));
    if (r.errs.length) console.log('  JS错误: ' + r.errs.join(' | '));
  }
}
const compliant = report.flatMap(r => r.overlaps.filter(o => o.includes('合规')).map(o => `${r.w}/${r.screen}: ${o}`));
compliant.forEach(o => console.log('· ' + o));
console.log(`\n共 ${report.length} 项检查，异常 ${bad} 项`);
