import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4500);

const geo = await page.evaluate(() => {
  const el = document.querySelector('.guide-character');
  const r = el.getBoundingClientRect();
  const vs = document.getElementById('vessel-stage').getBoundingClientRect();
  const overlap = !(r.left > vs.right || r.right < vs.left || r.top > vs.bottom || r.bottom < vs.top);
  return { top: Math.round(r.top), right: Math.round(window.innerWidth - r.right), w: Math.round(r.width), overlapVessel: overlap, cursor: getComputedStyle(el).cursor, canvas: document.querySelector('.gc-3d')?.style.display };
});
console.log('位置:', JSON.stringify(geo));
await page.screenshot({ path: 'artifacts/pos-topright.png' });

await page.click('.guide-character', { force: true });
await page.waitForTimeout(600);
const panel = await page.evaluate(() => !document.getElementById('guide-panel').hidden);
const shifted = await page.evaluate(() => Math.round(window.innerWidth - document.querySelector('.guide-character').getBoundingClientRect().right));
console.log(`点击开面板=${panel} | 面板展开时角色右距=${shifted}（应≈390）`);
console.log(`页面错误: ${errs.length ? errs.join('||') : '无'}`);
console.log(geo.top >= 80 && geo.top <= 120 && geo.right <= 20 && !geo.overlapVessel && panel && shifted >= 380 && errs.length === 0 ? 'PASS: 右上角就位、不挡瓷器、面板展开自动让位' : 'CHECK');
await browser.close();
