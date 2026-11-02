import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const saved = JSON.parse(localStorage.getItem('porcelain-reunion-progress-v1') || '{}');
  saved.repaired = saved.repaired || ['meiping']; saved.name = '测试';
  localStorage.setItem('porcelain-reunion-progress-v1', JSON.stringify(saved));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="choice"]')?.click(); });
await page.waitForTimeout(1000);
await page.click('[data-mode="kintsugi"]', { force: true });
await page.waitForTimeout(1500);

let stuck = 0;
for (let round = 0; round < 60; round++) {
  const glazeRow = await page.evaluate(() => !document.getElementById('work-glaze-row')?.hidden);
  if (glazeRow) break;
  const pts = await page.evaluate(() => window.__workshopDebug?.() || []);
  if (!pts.length) { await page.waitForTimeout(400); continue; }
  const before = JSON.stringify(pts[0]);
  await page.mouse.click(pts[0].x, pts[0].y);
  await page.waitForTimeout(450);
  const after = await page.evaluate(() => window.__workshopDebug?.() || []);
  if (JSON.stringify(after[0]) === before) {
    stuck++;
    if (stuck >= 2) { // 同一个点两次点不掉 → 在背面，拖转器身
      await page.mouse.move(640, 420); await page.mouse.down();
      await page.mouse.move(640 + 260, 420, { steps: 10 }); await page.mouse.up();
      await page.waitForTimeout(500);
      stuck = 0;
    }
  } else stuck = 0;
}
const step = await page.evaluate(() => ({
  glazeRow: !document.getElementById('work-glaze-row')?.hidden,
  tip: document.getElementById('work-tip')?.textContent?.slice(0, 30)
}));
console.log('清创+落金完成:', JSON.stringify(step));
if (step.glazeRow) {
  const btn = await page.evaluate(() => { const b = document.getElementById('work-glaze'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(btn.x, btn.y); await page.mouse.down();
  await page.waitForTimeout(2300);
  await page.mouse.up();
  await page.waitForTimeout(2500);
  const final = await page.evaluate(() => document.querySelector('.screen:not([hidden])')?.dataset.screen);
  console.log(final === 'certificate' ? 'PASS: GLB 模型上全流程走通（含背面拖转），已进证书页' : `FAIL: 最终屏=${final}`);
} else console.log('FAIL: 未进入上釉步');
await page.screenshot({ path: 'artifacts/glb-cert.png' });
await browser.close();
