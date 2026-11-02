import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.goto('https://porcelain-reunion.app.workbuddy.host/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="certificate"]')?.click(); });
await page.waitForTimeout(3000);

// ① 点击证书 → 聚焦到正中
await page.click('#certificate', { force: true, position: { x: 400, y: 200 } });
await page.waitForTimeout(700);
const focused = await page.evaluate(() => {
  const el = document.getElementById('certificate');
  const r = el.getBoundingClientRect();
  const body = document.body.classList.contains('cert-focus');
  const charHidden = getComputedStyle(document.querySelector('.guide-character')).opacity === '0';
  return { body, cx: Math.abs(r.left + r.width / 2 - innerWidth / 2) < 10, cy: Math.abs(r.top + r.height / 2 - innerHeight / 2) < 10, charHidden, w: Math.round(r.width) };
});
await page.screenshot({ path: 'artifacts/cert-focus.png' });

// ② 再点还原
await page.click('#certificate', { force: true, position: { x: 400, y: 200 } });
await page.waitForTimeout(700);
const restored = await page.evaluate(() => !document.body.classList.contains('cert-focus'));
// ③ Esc 也能退出
await page.click('#certificate', { force: true, position: { x: 400, y: 200 } });
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const escExit = await page.evaluate(() => !document.body.classList.contains('cert-focus'));

console.log('聚焦:', JSON.stringify(focused));
console.log(`还原=${restored} Esc退出=${escExit} 页面错误: ${errs.length ? errs.join('||') : '无'}`);
console.log(focused.body && focused.cx && focused.cy && focused.charHidden && restored && escExit && errs.length === 0 ? 'PASS: 点击居中/还原/Esc 全部正常' : 'CHECK: 见上');
await browser.close();
