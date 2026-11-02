import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') console.log('[控制台]', m.text().slice(0, 220)); });
await page.goto('https://porcelain-reunion.app.workbuddy.host/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="exhibit"]')?.click(); });
await page.waitForTimeout(2000);
await page.click('#guide-fab', { force: true });
await page.waitForTimeout(400);

// ① 器物问题 + 播放讲解 → 阿圆 3D 出现
await page.fill('#gp-input', '这件器物为什么采用这种器型？');
await page.click('#gp-send', { force: true });
await page.waitForTimeout(1000);
await page.click('.gp-answer .gp-play', { force: true });
await page.waitForTimeout(5000); // 等待 3D 加载与呈现
const label1 = await page.textContent('.gc-label');
const has3d = await page.evaluate(() => !!document.querySelector('.gc-3d'));
const charVisible = await page.evaluate(() => { const el = document.querySelector('.guide-character'); return !el.hidden && getComputedStyle(el).display !== 'none'; });
const canvasShown = await page.evaluate(() => { const c = document.querySelector('.gc-3d'); return c && c.style.display === 'block'; });
await page.screenshot({ path: 'artifacts/qiling-3d.png' });

// ② 工艺问题 + 播放 → 切回阿墨剪影
await page.fill('#gp-input', '青花是怎么画上去的？');
await page.click('#gp-send', { force: true });
await page.waitForTimeout(1200);
const cards = await page.$$('.gp-answer .gp-play');
await cards[cards.length - 1].click({ force: true });
await page.waitForTimeout(1200);
const label2 = await page.textContent('.gc-label');
const inkVisible = await page.evaluate(() => { const i = document.querySelector('.gc-ink'); return i && parseFloat(getComputedStyle(i).opacity) > 0.5; });
await page.screenshot({ path: 'artifacts/amo-2d.png' });

console.log(`① 器物讲解: 标签=${label1} | 3D画布=${has3d}/${canvasShown} | 角色可见=${charVisible}`);
console.log(`② 工艺讲解: 标签=${label2} | 剪影可见=${inkVisible}`);
console.log(`页面错误: ${errs.length ? errs.join(' || ') : '无'}`);
console.log(/阿圆/.test(label1) && /阿墨/.test(label2) && has3d && canvasShown && charVisible && errs.length === 0 ? 'PASS: 3D 阿圆 ↔ 2D 阿墨 双角色切换正常' : 'CHECK: 见上');
await browser.close();
