import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[页面]', m.type(), m.text().slice(0, 200)); });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });

// 解锁到抉择页并进入锔瓷工作台
await page.evaluate(() => {
  const saved = JSON.parse(localStorage.getItem('porcelain-reunion-progress-v1') || '{}');
  saved.repaired = saved.repaired || ['meiping'];
  saved.name = '测试';
  localStorage.setItem('porcelain-reunion-progress-v1', JSON.stringify(saved));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('[data-go="cabinet"]', { force: true });
await page.waitForTimeout(600);
await page.evaluate(() => { document.querySelector('#cabinet-grid [data-vessel]')?.click(); });
await page.waitForTimeout(800);
await page.click('#accept-commission', { force: true });
await page.waitForTimeout(800);
console.log('当前屏:', await page.evaluate(() => document.querySelector('.screen:not([hidden])')?.dataset.screen));
// 经侧栏预览直接进入抉择屏（正式流程需先拼合，验证脚本走预览通道）
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="choice"]')?.click(); });
await page.waitForTimeout(1200);
await page.click('#choose-juci', { force: true });
await page.waitForTimeout(2500);
console.log('选择屏点击后:', await page.evaluate(() => ({
  screen: document.querySelector('.screen:not([hidden])')?.dataset.screen,
  bar: !!document.querySelector('.juci-bar'),
  juciHidden: [...document.querySelectorAll('.juci-hidden')].length
})));

// 工作台状态
const info = await page.evaluate(() => {
  const bar = document.querySelector('.juci-bar');
  const barRect = bar.getBoundingClientRect();
  const pts = window.__workshopDebug?.() || [];
  // 取每个标记点的屏幕坐标，看 elementFromPoint 命中的是不是标记点而不是引导卡
  return { barRect: { x: barRect.x, y: barRect.y, w: barRect.width, h: barRect.height }, pts };
});
console.log('bar位置:', JSON.stringify(info.barRect));
console.log('标记点数:', info.pts.length);

let blocked = 0;
for (const p of info.pts) {
  const hit = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.tagName + '.' + (el.className?.toString?.().slice(0, 30) || '') : 'null';
  }, [p.x, p.y]);
  const isBar = hit.includes('.juci-bar') || (hit.includes('button') && false);
  console.log(`标记 (${p.x},${p.y}) → elementFromPoint: ${hit}${isBar ? '  ❌被引导卡挡住' : ''}`);
  if (isBar) blocked++;
}

// 真实鼠标点击器身中心，验证锔钉能落钉（juci 模式无预设标记点）
const vc = await page.evaluate(() => {
  const c = document.querySelector('#stage canvas') || document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
});
console.log('画布中心:', JSON.stringify(vc));
await page.mouse.click(vc.x, vc.y);
await page.waitForTimeout(500);
const staple = await page.evaluate(() => document.getElementById('juci-count')?.textContent);
console.log(staple === '1' ? 'PASS: 引导卡移开后器身可正常落钉 (1/4)' : `点击器身后 juci-count=${staple}`);
console.log(blocked === 0 ? 'PASS: 引导卡未遮挡任何标记点' : `FAIL: ${blocked} 个标记点被遮挡`);
await browser.close();
