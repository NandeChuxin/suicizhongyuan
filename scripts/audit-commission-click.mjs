// 委托屏点击遮挡审计：对每个交互元素中心点做 elementFromPoint，找出真正的遮挡者
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });

const audit = async (w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('[data-go="cabinet"]')?.click());
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('.cabinet-card .primary')?.click());
  await page.waitForTimeout(1800);

  const res = await page.evaluate(() => {
    const out = { view: window.porcelain?.view, items: [], boxes: {} };
    const desc = el => el ? `${el.tagName.toLowerCase()}#${el.id || '-'}.${(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().trim().split(/\s+/).slice(0, 3).join('.')}` : 'null';
    for (const [label, sel] of [
      ['接受委托', '#accept-commission'],
      ['轻叩瓷身', '#knock-commission'],
      ['署名输入框', '#name'],
      ['指南入口', '#guide-entry'],
      ['步骤-重圆', '.steps button:nth-child(7)'],
      ['步骤-委托', '.steps button:nth-child(3)'],
      ['步骤-档案柜', '.steps button:nth-child(2)'],
    ]) {
      const el = document.querySelector(sel);
      if (!el) { out.items.push({ label, sel, missing: true }); continue; }
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const hitSelf = top === el || el.contains(top) || (top && top.contains(el));
      out.items.push({ label, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], top: desc(top), hitSelf, pe: getComputedStyle(el).pointerEvents });
    }
    // 轨道按钮逐个测
    document.querySelectorAll('#commission-rail .rail-item').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const hitSelf = top === el || el.contains(top);
      out.items.push({ label: `轨道按钮${i + 1}(${el.textContent.trim().slice(0, 4)})`, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], top: desc(top), hitSelf, pe: getComputedStyle(el).pointerEvents, disabled: el.disabled });
    });
    for (const sel of ['.side-card.paper-card', '.commission-rail', '.proto-card', '.commission-layout', '.screen[data-screen=commission]', '.steps', 'footer', '.stage-hint', '.craft-note']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out.boxes[sel] = { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], pos: cs.position, z: cs.zIndex, pe: cs.pointerEvents, overflow: cs.overflow };
    }
    out.docH = document.documentElement.scrollHeight;
    out.stageRect = (() => { const r = document.querySelector('#stage').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; })();
    return out;
  });
  console.log(`\n=== ${w}x${h} view=${res.view} ===`);
  console.log('boxes', JSON.stringify(res.boxes));
  for (const it of res.items) console.log(`${it.hitSelf ? 'OK  ' : 'BLOCKED'} ${it.label} rect=${JSON.stringify(it.rect)} top=${it.top} pe=${it.pe}${it.disabled ? ' disabled' : ''}`);
  await page.screenshot({ path: `D:/数字媒体/碎瓷重圆/artifacts/audit-commission-${w}x${h}.png` });
  await page.close();
};

await audit(1440, 900);
await audit(1280, 800);
await audit(1024, 768);
await browser.close();
console.log('\nDONE');
