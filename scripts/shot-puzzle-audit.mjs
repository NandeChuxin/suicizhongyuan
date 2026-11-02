import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', e.stack ? e.stack.slice(0, 500) : String(e).slice(0, 300)));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
// start -> cabinet
await page.evaluate(() => { document.querySelector('[data-go="cabinet"]')?.click(); });
await page.waitForTimeout(1500);
// 第一件器物进入委托
await page.evaluate(() => { document.querySelector('.cabinet-card .primary')?.click(); });
await page.waitForTimeout(1500);
// 接受委托 -> puzzle
await page.evaluate(() => { document.querySelector('#accept-commission')?.click(); });
await page.waitForTimeout(3500);
const info = await page.evaluate(() => {
  const cam = window.porcelain?.camera;
  const bridge = window.porcelain?.bridge;
  const frs = window.porcelain?.fragments || [];
  return {
    view: window.porcelain?.view,
    zoom: cam?.zoom, panY: bridge?.view?.panY,
    camTop: cam?.top, camBottom: cam?.bottom, camLeft: cam?.left, camRight: cam?.right,
    camY: cam?.position?.y,
    benchRadius: undefined, // 台面圆盘已移除：布局半径口径改读 P3D.benchRadiusFor，见 puzzle3d.js
    asmY: frs[0]?.correctPosition?.y,
    fragCount: frs.length,
  };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: 'artifacts/audit-puzzle-before.png' });
await browser.close();
