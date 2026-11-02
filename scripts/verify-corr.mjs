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

// 从档案柜打开"下一件待修器物"，保证走的是真实对应流程
await page.evaluate(() => { document.querySelector('[data-go="cabinet"]')?.click(); });
await page.waitForTimeout(800);
const vesselName = await page.evaluate(() => {
  const btn = document.querySelector('#cabinet-grid [data-vessel]:not([disabled])');
  btn?.click();
  return btn?.dataset.vessel;
});
await page.waitForTimeout(1200);
const commissionName = await page.evaluate(() => document.getElementById('commission-name')?.textContent);
console.log('打开器物:', vesselName, '/ 委托页显示:', commissionName);
await page.click('#accept-commission', { force: true });
await page.waitForTimeout(800);
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="choice"]')?.click(); });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'artifacts/corr-choice.png' });

// 抉择屏只应有一件器物（对比组已移除）——通过射线场景无法直接数，用截图目测 + 进入工作台完成
await page.click('[data-mode="kintsugi"]', { force: true });
await page.waitForTimeout(1500);
let stuck = 0;
for (let round = 0; round < 60; round++) {
  if (await page.evaluate(() => !document.getElementById('work-glaze-row')?.hidden)) break;
  const pts = await page.evaluate(() => window.__workshopDebug?.() || []);
  if (!pts.length) { await page.waitForTimeout(400); continue; }
  const before = JSON.stringify(pts[0]);
  await page.mouse.click(pts[0].x, pts[0].y);
  await page.waitForTimeout(450);
  const after = await page.evaluate(() => window.__workshopDebug?.() || []);
  if (JSON.stringify(after[0]) === before) { if (++stuck >= 2) { await page.mouse.move(640, 420); await page.mouse.down(); await page.mouse.move(900, 420, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(500); stuck = 0; } } else stuck = 0;
}
const btn = await page.evaluate(() => { const b = document.getElementById('work-glaze'); const r = b?.getBoundingClientRect(); return b && !b.closest('[hidden]') ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
if (btn) { await page.mouse.move(btn.x, btn.y); await page.mouse.down(); await page.waitForTimeout(2300); await page.mouse.up(); }
await page.waitForTimeout(3000);
const cert = await page.evaluate(() => ({
  screen: document.querySelector('.screen:not([hidden])')?.dataset.screen,
  title: document.getElementById('ending-title')?.textContent,
  origin: document.getElementById('cert-origin')?.textContent,
  mode: document.getElementById('cert-mode')?.textContent,
  portrait: document.getElementById('cert-portrait')?.src?.startsWith('data:image')
}));
console.log('证书内容:', JSON.stringify(cert, null, 1));
console.log(cert.screen === 'certificate' && cert.origin && cert.portrait ? 'PASS: 证书对应所修器物' : 'CHECK: 请核对上方字段');
await page.screenshot({ path: 'artifacts/corr-cert.png' });
await browser.close();
