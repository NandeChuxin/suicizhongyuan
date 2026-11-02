import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 150)); });
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const saved = JSON.parse(localStorage.getItem('porcelain-reunion-progress-v1') || '{}');
  saved.repaired = saved.repaired || ['meiping']; saved.name = '测试';
  localStorage.setItem('porcelain-reunion-progress-v1', JSON.stringify(saved));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="choice"]')?.click(); });
await page.waitForTimeout(800);
const st = await page.evaluate(() => ({
  screen: document.querySelector('.screen:not([hidden])')?.dataset.screen,
  modes: [...document.querySelectorAll('[data-mode]')].map(b => ({ m: b.dataset.mode, visible: b.getBoundingClientRect().width > 0, disabled: b.disabled }))
}));
console.log(JSON.stringify(st, null, 1));
await page.click('[data-mode="kintsugi"]', { force: true });
await page.waitForTimeout(1500);
console.log(await page.evaluate(() => ({
  screen: document.querySelector('.screen:not([hidden])')?.dataset.screen,
  bar: !!document.querySelector('.juci-bar'),
  debug: typeof window.__workshopDebug,
  active: !!document.querySelector('.juci-bar')
})));
await browser.close();
