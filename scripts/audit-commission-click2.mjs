// 委托屏遮挡全量审计：含左侧常驻导航（重圆）与叠加层，输出命中栈
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });

const desc = `el => {
  if (!el) return 'null';
  const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().trim().split(/\\s+/).slice(0, 3).join('.');
  return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '');
}`;

const audit = async (w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('[data-go="cabinet"]')?.click());
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('.cabinet-card .primary')?.click());
  await page.waitForTimeout(1800);

  const res = await page.evaluate((descSrc) => {
    const desc = eval(descSrc);
    const out = { view: window.porcelain?.view, items: [], boxes: {} };
    const probe = (label, el, extra = {}) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const inView = cx > 0 && cx < innerWidth && cy > 0 && cy < innerHeight;
      const stack = inView ? document.elementsFromPoint(cx, cy).slice(0, 4).map(desc) : [];
      const top = inView ? document.elementsFromPoint(cx, cy)[0] : null;
      const hitSelf = top === el || el.contains(top) || (top && top.contains(el));
      out.items.push({ label, ...extra, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], inView, clickable: hitSelf, stack });
    };
    document.querySelectorAll('.atelier-rail button').forEach((el, i) => probe(`导航-${el.textContent.trim().slice(2)}`, el, { disabled: el.disabled }));
    document.querySelectorAll('#commission-rail .rail-item').forEach((el, i) => probe(`轨道-${el.textContent.trim().slice(0, 4)}`, el, { disabled: el.disabled }));
    for (const [label, sel] of [['接受委托', '#accept-commission'], ['署名输入框', '#name'], ['轻叩瓷身', '#knock-commission'], ['窑火问答', '#guide-entry'], ['分享', '#share-fab']]) {
      const el = document.querySelector(sel);
      if (el) probe(label, el);
    }
    document.querySelectorAll('[data-preview]').forEach(el => { if (el.closest('.atelier-rail')) return; probe(`预览-${el.textContent.trim().slice(0, 4)}`, el); });
    for (const sel of ['.atelier-rail', '.commission-rail', '.proto-card', '.side-card.paper-card', '.craft-note', '.knock-btn', '.share-fab', '#halo', '.stage-hint']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      out.boxes[sel] = { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], pos: cs.position, z: cs.zIndex, pe: cs.pointerEvents, disp: cs.display };
    }
    return out;
  }, desc);

  console.log(`\n=== ${w}x${h} view=${res.view} ===`);
  console.log('boxes', JSON.stringify(res.boxes, null, 0));
  for (const it of res.items) {
    const flag = it.clickable ? 'OK     ' : (it.inView ? 'BLOCKED' : 'OFFSCRN');
    console.log(`${flag} ${it.label}${it.disabled ? '(disabled)' : ''} rect=${JSON.stringify(it.rect)} stack=${JSON.stringify(it.stack)}`);
  }
  await page.screenshot({ path: `D:/数字媒体/碎瓷重圆/artifacts/audit2-commission-${w}x${h}.png` });
  await page.close();
};

await audit(1440, 900);
await audit(1366, 768);
await audit(1280, 800);
await browser.close();
console.log('\nDONE');
