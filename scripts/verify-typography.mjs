// 验收：整体字号放大后的排版体检（溢出 / 裁切 / 文字块重叠 / 越界）
// 用法：先起开发服务器（npm run dev，默认 5173），再执行
//   node scripts/verify-typography.mjs [宽] [高]
// 输出：artifacts/typography/*.png 与逐项问题清单。
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:5173/';
const sizes = process.argv[2] ? [[Number(process.argv[2]), Number(process.argv[3] || 900)]] : [[1366, 768], [1440, 900], [1920, 1080], [1024, 768], [430, 900]];
const OUT = 'artifacts/typography/';
mkdirSync(OUT, { recursive: true });

const VIEWS = ['start', 'cabinet', 'commission', 'puzzle', 'memory', 'choice', 'certificate', 'exhibit'];

const AUDIT = () => {
  const vis = el => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (r.width <= 1 || r.height <= 1 || s.visibility === 'hidden' || s.display === 'none') return false;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false;
    return parseFloat(s.opacity) > .05;
  };
  const label = el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className || '').split(' ').filter(Boolean).slice(0, 2).join('.')}`;
  const hasText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  // 关掉的 <details>（如「十秒读懂」「锔瓷工序」）内容不计入排版问题：浏览器只隐藏绘制，仍有布局盒
  const hiddenByDetails = el => Boolean(el.closest('details:not([open])'));
  const SKIP = '.gc-label,#guide-fab,.share-fab,.hotspot-btn,#notice';
  const skip = el => Boolean(el.closest(SKIP)) || hiddenByDetails(el);
  const out = { pageOverflow: document.documentElement.scrollWidth - innerWidth, clippedX: [], clippedY: [], offscreen: [], overlaps: [] };
  const inHScroller = el => {
    let n = el.parentElement;
    while (n) { const s = getComputedStyle(n); if (['auto', 'scroll'].includes(s.overflowX) && n.scrollWidth > n.clientWidth + 1) return true; n = n.parentElement; }
    return false;
  };

  // ① 文字被横向裁切（overflow hidden / clip）
  for (const el of document.querySelectorAll('body *')) {
    if (!hasText(el) || !vis(el) || skip(el)) continue;
    const s = getComputedStyle(el);
    if (['hidden', 'clip'].includes(s.overflowX) && el.scrollWidth > el.clientWidth + 3 && !inHScroller(el)) {
      out.clippedX.push(`${label(el)} scrollW=${el.scrollWidth} clientW=${el.clientWidth} «${el.textContent.trim().slice(0, 24)}»`);
    }
    // ② 文字被纵向裁切
    if (['hidden', 'clip'].includes(s.overflowY) && el.scrollHeight > el.clientHeight + 3) {
      out.clippedY.push(`${label(el)} scrollH=${el.scrollHeight} clientH=${el.clientHeight} «${el.textContent.trim().slice(0, 24)}»`);
    }
    // ③ 文字块越出视口（横向滚动容器内的条目除外）
    const r = el.getBoundingClientRect();
    if ((r.right > innerWidth + 2 || r.left < -2) && !inHScroller(el)) {
      out.offscreen.push(`${label(el)} rect=${Math.round(r.left)}..${Math.round(r.right)} vw=${innerWidth} «${el.textContent.trim().slice(0, 20)}»`);
    }
  }

  // ④ 真正会「压字」的重叠：只比较叶子文字块，且排除包含关系与浮动控件
  const visibleRect = el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    let r = range.getBoundingClientRect();
    if (!r.width || !r.height) r = el.getBoundingClientRect();
    let n = el.parentElement;
    while (n) {
      const s = getComputedStyle(n);
      if (['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowY) || ['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowX)) {
        const nr = n.getBoundingClientRect();
        r = { left: Math.max(r.left, nr.left), right: Math.min(r.right, nr.right), top: Math.max(r.top, nr.top), bottom: Math.min(r.bottom, nr.bottom) };
        if (r.right <= r.left || r.bottom <= r.top) return null;
      }
      n = n.parentElement;
    }
    return r;
  };
  const leaves = [...document.querySelectorAll('body *')].filter(el => vis(el) && hasText(el) && !skip(el) && ![...el.children].some(c => vis(c) && hasText(c)));
  const inter = (a, b) => {
    const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return x * y;
  };
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], b = leaves[j];
    if (a.contains(b) || b.contains(a)) continue;
    const ra = visibleRect(a), rb = visibleRect(b);
    if (!ra || !rb) continue;
    const area = inter(ra, rb);
    if (area > 40) out.overlaps.push(`${label(a)} × ${label(b)} 重叠 ${Math.round(area)}px² «${a.textContent.trim().slice(0, 16)}» / «${b.textContent.trim().slice(0, 16)}»`);
  }
  return out;
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
let problems = 0;
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  // 预置全部归位的梅瓶进度：记忆屏可进入
  await page.addInitScript(() => {
    localStorage.setItem('porcelain-reunion-progress-v1', JSON.stringify({
      completed: {}, certificates: {}, userName: '排版验收', currentVesselId: null,
      puzzle3d: { meiping: [0, 1, 2, 3, 4, 5, 6, 7] }
    }));
  });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5500);
  for (const view of VIEWS) {
    await page.evaluate(name => document.querySelector(`[data-preview="${name}"]`)?.click(), view);
    await page.waitForTimeout(view === 'start' ? 2200 : 2600);
    const res = await page.evaluate(AUDIT);
    await page.screenshot({ path: `${OUT}${w}-${view}.png` });
    const issues = [
      ...res.clippedX.map(x => '横向裁切 ' + x),
      ...res.clippedY.map(x => '纵向裁切 ' + x),
      ...res.offscreen.map(x => '越出视口 ' + x),
      ...res.overlaps.map(x => '文字块重叠 ' + x)
    ];
    if (res.pageOverflow > 2) issues.unshift(`页面横向溢出 ${res.pageOverflow}px`);
    if (issues.length || errs.length) {
      problems += issues.length + errs.length;
      console.log(`\n[${w}x${h} ${view}]`);
      issues.slice(0, 12).forEach(i => console.log('  ✗ ' + i));
      if (errs.length) console.log('  JS错误: ' + errs.join(' | '));
    }
  }
  await page.close();
}
await browser.close();
console.log(problems ? `\n共发现 ${problems} 项排版问题` : '\n排版体检通过：无溢出 / 裁切 / 越界 / 文字块重叠');
process.exit(problems ? 1 : 0);
