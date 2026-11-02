import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="certificate"]')?.click(); });
await page.waitForTimeout(3000);
await page.click('#certificate', { force: true, position: { x: 400, y: 200 } });
await page.waitForTimeout(700);
console.log(await page.evaluate(() => {
  const el = document.getElementById('certificate');
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { rect: { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, position: cs.position, translate: cs.translate, transform: cs.transform.slice(0, 60), left: cs.left, top: cs.top, class: el.className, style: el.getAttribute("style"), right: cs.right, zIndex: cs.zIndex };
}));
await browser.close();
