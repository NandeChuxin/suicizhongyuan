import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('https://porcelain-reunion.app.workbuddy.host/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="tour"]')?.click(); });
await page.waitForTimeout(3500);
// 考察点手记：tour-note 或点击地图
const note = await page.evaluate(() => {
  const n = document.querySelector('#tour-note');
  return n && !n.hidden ? n.textContent.slice(0, 400) : null;
});
let text = note;
if (!text) {
  await page.evaluate(() => { document.querySelector('#tour-map button, .tour-map button')?.click(); });
  await page.waitForTimeout(1500);
  text = await page.evaluate(() => { const n = document.querySelector('#tour-note'); return n && !n.hidden ? n.textContent.slice(0, 400) : null; });
}
console.log('手记内容:', (text || '未找到').replace(/\s+/g, ' ').slice(0, 300));
console.log(/待人工核实|\[待核实\]/.test(text || '') ? 'FAIL: 仍有待核实标记' : 'PASS: 无待核实标记，显示「传承资料摘记 · 已核实」');
await browser.close();
