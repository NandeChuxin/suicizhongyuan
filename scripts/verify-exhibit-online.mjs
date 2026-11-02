import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="exhibit"]')?.click(); });
await page.waitForTimeout(2500);

// 打开讲解面板，记录初始讲解对象
await page.click('#guide-fab', { force: true });
await page.waitForTimeout(500);
const obj0 = await page.textContent('#gp-object');
const name0 = await page.textContent('#exhibit-name');
await page.screenshot({ path: 'artifacts/exhibit-0.png' });

// 点击展签列表第 3 项（青花云龙纹罐）
await page.evaluate(() => { document.querySelectorAll('#exhibit-rail .exhibit-rail-item')[2]?.click(); });
await page.waitForTimeout(2500);
const name2 = await page.textContent('#exhibit-name');
const obj2 = await page.textContent('#gp-object');
const era2 = await page.textContent('#exhibit-era');
await page.screenshot({ path: 'artifacts/exhibit-2.png' });

// 再切第 5 项（釉里红高足转杯）确认连续切换
await page.evaluate(() => { document.querySelectorAll('#exhibit-rail .exhibit-rail-item')[4]?.click(); });
await page.waitForTimeout(2500);
const name4 = await page.textContent('#exhibit-name');
const obj4 = await page.textContent('#gp-object');
await page.screenshot({ path: 'artifacts/exhibit-4.png' });

console.log(`初始: ${name0} | 讲解对象: ${obj0}`);
console.log(`点第3项: 展签=${name2}(${era2}) | 讲解对象: ${obj2}`);
console.log(`点第5项: 展签=${name4} | 讲解对象: ${obj4}`);
const pass = name0 !== name2 && name2 !== name4 && obj2.includes(name2.slice(0, 4)) && obj4.includes(name4.slice(0, 4));
console.log(pass ? 'PASS: 点击器型 → 模型/展签/讲解对象三者联动' : 'CHECK: 请看截图核对');
await browser.close();
