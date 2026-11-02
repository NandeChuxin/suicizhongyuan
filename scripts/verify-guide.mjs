import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const vis = sel => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return 'missing';
  return getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
}, sel);

// ① 讲解面板：展开 → 收起
await page.click('#guide-fab', { force: true });
await page.waitForTimeout(400);
const opened = await vis('#guide-panel');
await page.click('#gp-close', { force: true });
await page.waitForTimeout(400);
const closed = await vis('#guide-panel');
console.log(`讲解面板: 展开=${opened} 收起后=${closed}`, opened && !closed ? 'PASS' : 'FAIL');

// ② 面板内按钮响应（字号/字幕/清空）
await page.click('#guide-fab', { force: true });
await page.waitForTimeout(300);
const font0 = await page.textContent('#gp-font');
await page.click('#gp-font', { force: true });
const font1 = await page.textContent('#gp-font');
const sub0 = await page.textContent('#gp-subtitle');
await page.click('#gp-subtitle', { force: true });
const sub1 = await page.textContent('#gp-subtitle');
console.log(`字号按钮: ${font0}→${font1}`, font0 !== font1 ? 'PASS' : 'FAIL', `| 字幕按钮: ${sub0}→${sub1}`, sub0 !== sub1 ? 'PASS' : 'FAIL');

// ③ 自动导览条：启动 → 退出
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="exhibit"]')?.click(); });
await page.waitForTimeout(2000);
await page.click('#tour-start', { force: true });
await page.waitForTimeout(800);
const barOn = await vis('#exhibit-tourbar');
await page.click('#tour-exit', { force: true });
await page.waitForTimeout(800);
const barOff = await vis('#exhibit-tourbar');
console.log(`导览条: 启动=${barOn} 退出后=${barOff}`, barOn && !barOff ? 'PASS' : 'FAIL');

// ④ 展厅热点按钮可点
await page.waitForTimeout(1500);
const hs = await page.evaluate(() => document.querySelector('.hotspot-btn')?.getBoundingClientRect());
if (hs) {
  await page.mouse.click(hs.x + hs.width / 2, hs.y + hs.height / 2);
  await page.waitForTimeout(600);
  const drawerOrPanel = await page.evaluate(() => !!document.querySelector('#knowledge-drawer:not([hidden])') || document.querySelectorAll('.gp-answer').length > 0);
  console.log('展厅热点点击:', drawerOrPanel ? 'PASS（有响应）' : 'WARN（无明显响应，需人工确认）');
} else console.log('展厅热点: 本器物无热点');
await browser.close();
