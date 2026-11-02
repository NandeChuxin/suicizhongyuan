import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', e.stack ? e.stack.slice(0, 600) : String(e).slice(0, 300)));
await page.goto('https://porcelain-reunion.app.workbuddy.host/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="exhibit"]')?.click(); });
await page.waitForTimeout(2000);
await page.evaluate(() => { document.querySelectorAll('#exhibit-rail .exhibit-rail-item')[2]?.click(); });
await page.waitForTimeout(3000);
// 场景里当前可见的模型是哪个 GLB：通过给 three 场景打标不可行，改用贴图/几何特征——直接对比模型包围盒
const info = await page.evaluate(() => {
  const c = document.querySelector('#vessel-stage canvas');
  return { canvas: !!c };
});
console.log(info);
await browser.close();
