import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

// ① 器灵常驻可见 + 位置/尺寸
const geo = await page.evaluate(() => {
  const el = document.querySelector('.guide-character');
  const r = el.getBoundingClientRect();
  return { visible: !el.hidden && getComputedStyle(el).display !== 'none', right: Math.round(window.innerWidth - r.right), bottom: Math.round(window.innerHeight - r.bottom), w: Math.round(r.width), h: Math.round(r.height), label: el.querySelector('.gc-label')?.textContent, cursor: getComputedStyle(el).cursor, has3d: !!document.querySelector('.gc-3d') };
});
console.log('器灵几何:', JSON.stringify(geo));

// ② 点击器灵 → 弹出知识库面板
await page.click('.guide-character', { force: true });
await page.waitForTimeout(600);
const panelOpen = await page.evaluate(() => { const p = document.getElementById('guide-panel'); return !p.hidden && getComputedStyle(p).display !== 'none'; });
const recos = await page.evaluate(() => document.querySelectorAll('.gp-reco').length);
await page.screenshot({ path: 'artifacts/entry-click.png' });
console.log(`点击器灵 → 面板打开=${panelOpen} 推荐问题=${recos}`);

// ③ 再点关闭
await page.click('#gp-close', { force: true });
await page.waitForTimeout(400);
const closed = await page.evaluate(() => document.getElementById('guide-panel').hidden);
const stillVisible = await page.evaluate(() => !document.querySelector('.guide-character').hidden);
console.log(`收起面板=${closed} | 器灵仍可见=${stillVisible}`);
console.log(`页面错误: ${errs.length ? errs.join(' || ') : '无'}`);
console.log(geo.visible && geo.bottom < 20 && geo.w <= 185 && panelOpen && recos >= 3 && closed && stillVisible && errs.length === 0 ? 'PASS' : 'CHECK');
await browser.close();
