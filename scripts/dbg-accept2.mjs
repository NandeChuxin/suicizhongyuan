import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
for (const [tag, url] of [['当前dev', 'http://localhost:5173/'], ['基线dist', 'http://127.0.0.1:5199/']]) {
  for (const [w, h] of [[1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2200);
    for (let i = 0; i < 8; i++) {
      const cur = await page.evaluate(() => (window.porcelain ? window.porcelain.view : 'unknown'));
      if (cur === 'commission') break;
      if (cur === 'start') await page.mouse.click(...await page.evaluate(() => { const r = document.querySelector('[data-go="cabinet"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
      else if (cur === 'cabinet') await page.mouse.click(...await page.evaluate(() => { const r = document.querySelector('.cabinet-card .primary').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
      await page.waitForTimeout(1600);
    }
    const r = await page.evaluate(() => {
      const b = document.querySelector('#accept-commission');
      const rect = b.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const stack = document.elementsFromPoint(cx, cy).slice(0, 4).map(e => e.tagName + (e.id ? '#' + e.id : '') + '.' + ((e.className || '').toString().split(' ')[0] || ''));
      return { rect: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.right), Math.round(rect.bottom)], stack };
    });
    console.log(tag, `${w}x${h}`, JSON.stringify(r));
    await page.close();
  }
}
await browser.close();
