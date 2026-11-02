import { chromium, devices } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, hasTouch: true, isMobile: false });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2400);
const tap = async sel => { const c = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel); await page.touchscreen.tap(c[0], c[1]); };
for (let i = 0; i < 8; i++) {
  const cur = await page.evaluate(() => window.porcelain.view);
  if (cur === 'puzzle') break;
  const sel = { start: '[data-go="cabinet"]', cabinet: '.cabinet-card .primary', commission: '#accept-commission' }[cur];
  if (sel) { await tap(sel); await page.waitForTimeout(1900); }
}
await page.waitForTimeout(2600);
const st = () => page.evaluate(() => ({ view: window.porcelain.view, yaw: window.porcelain.bridge?.orbit?.yaw ?? null, repaired: window.porcelain.repaired, rotating: !!window.porcelain.bridge?.isRotating }));
const before = await st();
// 单指拖动（触屏）：从碎片密集的台面区域起拖 → 应旋转而不是归位
const canvas = await page.evaluate(() => { const r = document.querySelector('#vessel-stage canvas').getBoundingClientRect(); return [r.left + r.width * .5, r.top + r.height * .82, r.left + r.width * .2, r.top + r.height * .5]; });
await page.touchscreen.tap(canvas[2], canvas[3]); // 单指轻点空白
await page.waitForTimeout(400);
// 用 CDP 派发触摸拖动
await page.evaluate(async ({ x, y }) => {
  const c = document.querySelector('#vessel-stage canvas');
  const fire = (type, cx, cy) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true }));
  fire('pointerdown', x, y);
  for (let i = 1; i <= 14; i++) { fire('pointermove', x + i * 14, y); await new Promise(r => requestAnimationFrame(r)); }
  fire('pointerup', x + 196, y);
}, { x: canvas[0], y: canvas[1] });
await page.waitForTimeout(400);
const afterDrag = await st();
console.log(`触屏单指拖动（碎片区起拖）: Δyaw=${Math.abs(afterDrag.yaw - before.yaw).toFixed(3)} rad（应>0.5） 归位数=${before.repaired}→${afterDrag.repaired}（应不变，说明拖动不会误归位）`);
// 单指轻点碎片 → 归位
const pt = await page.evaluate(() => {
  const cam = window.porcelain.camera, frs = window.porcelain.fragments;
  const f = frs.find(x => !x.locked); if (!f) return null;
  const r = document.querySelector('#vessel-stage canvas').getBoundingClientRect();
  f.mesh.geometry.computeBoundingBox(); const b = f.mesh.geometry.boundingBox, v = new (cam.position.constructor)();
  for (const dx of [.5, .3, .7]) for (const dy of [.5, .3, .7]) for (const dz of [.5, .3]) {
    v.set(b.min.x + (b.max.x - b.min.x) * dx, b.min.y + (b.max.y - b.min.y) * dy, b.min.z + (b.max.z - b.min.z) * dz).applyMatrix4(f.mesh.matrixWorld).project(cam);
    const x = r.left + (v.x + 1) / 2 * r.width, y = r.top + (1 - v.y) / 2 * r.height;
    if (x > r.left + 8 && x < r.right - 8 && y > r.top + 8 && y < r.bottom - 8) return [x, y];
  }
  return null;
});
if (pt) { await page.evaluate(({ x, y }) => { const c = document.querySelector('#vessel-stage canvas'); const fire = (t, cx, cy) => c.dispatchEvent(new PointerEvent(t, { pointerId: 8, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy, button: 0, buttons: t === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true })); fire('pointerdown', x, y); fire('pointerup', x, y); }, { x: pt[0], y: pt[1] }); }
await page.waitForTimeout(1000);
const afterTap = await st();
console.log(`触屏轻点碎片: 归位 ${afterDrag.repaired}→${afterTap.repaired}（应+1）`);
console.log(`提示栏: ${(await page.evaluate(() => document.getElementById('status').textContent)).slice(0, 46)}`);
await browser.close();
