import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2200);
for (let i = 0; i < 8; i++) {
  const cur = await page.evaluate(() => window.porcelain.view);
  if (cur === 'commission') break;
  if (cur === 'start') await page.mouse.click(...await page.evaluate(() => { const r = document.querySelector('[data-go="cabinet"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
  else if (cur === 'cabinet') await page.mouse.click(...await page.evaluate(() => { const r = document.querySelector('.cabinet-card .primary').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
  await page.waitForTimeout(1600);
}
const test = async (label, cssRules) => {
  await page.evaluate((rules) => {
    document.getElementById('__probe')?.remove();
    const st = document.createElement('style'); st.id = '__probe'; st.textContent = rules; document.head.append(st);
  }, cssRules);
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const b = document.querySelector('#accept-commission');
    const rect = b.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const e = document.elementFromPoint(cx, cy);
    const names = document.elementsFromPoint(cx, cy).slice(0, 3).map(x => x.tagName + (x.id ? '#' + x.id : '') + '.' + ((x.className || '').toString().split(' ')[0] || ''));
    return { hit: e ? e.tagName + (e.id ? '#' + e.id : '') : 'null', names };
  });
  console.log(label.padEnd(46), JSON.stringify(r));
};
await test('基线（无干预）', '');
await test('禁用 .primary:after', '.primary:after{display:none!important}');
await test('按钮 overflow:visible', '#accept-commission{overflow:visible!important}');
await test('按钮 position:static', '#accept-commission{position:static!important}');
await test('按钮 z-index:1 + relative', '#accept-commission{z-index:1!important}');
await test('卡片 transform-style:flat', '.side-card.paper-card{transform-style:flat!important}');
await test('卡片 backdrop-filter:none', '.side-card.paper-card{backdrop-filter:none!important}');
await test('卡片 translate 去掉 z 分量', '.side-card.paper-card{translate:none!important}');
await test('卡片 isolation:isolate', '.side-card.paper-card{isolation:isolate!important}');
await browser.close();
