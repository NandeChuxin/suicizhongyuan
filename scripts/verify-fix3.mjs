import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const saved = JSON.parse(localStorage.getItem('porcelain-reunion-progress-v1') || '{}');
  saved.repaired = saved.repaired || ['meiping']; saved.name = '测试';
  localStorage.setItem('porcelain-reunion-progress-v1', JSON.stringify(saved));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// ① 证书肖像
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="certificate"]')?.click(); });
await page.waitForTimeout(3000);
const cert = await page.evaluate(() => {
  const img = document.getElementById('cert-portrait');
  return { visible: img.getBoundingClientRect().width > 50 && getComputedStyle(img).display !== 'none' && img.src.startsWith('data:image') };
});
console.log('证书肖像图:', cert.visible ? 'PASS' : 'FAIL');

// ② 工序工作台（金线表达进入 repairBench，有标记点与调试钩子）
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="choice"]')?.click(); });
await page.waitForTimeout(800);
await page.click('[data-mode="kintsugi"]', { force: true });
await page.waitForTimeout(1500);
const dbg0 = await page.evaluate(() => { const d = window.__workshopRay?.(640,420); return d ? { active: d.active, rot: d.vaseRot } : { missing: typeof window.__workshopDebug, screen: document.querySelector('.screen:not([hidden])')?.dataset.screen, bar: !!document.querySelector('.juci-bar') }; });
console.log('工作台状态:', JSON.stringify(dbg0));
const y0 = dbg0?.rot?.y;
await page.waitForTimeout(2500);
const y1 = (await page.evaluate(() => window.__workshopRay?.(640,420)))?.vaseRot?.y;
console.log(`静置2.5s rotation.y: ${y0} → ${y1}`, y0 === undefined ? 'SKIP' : Math.abs(y1 - y0) < .01 ? 'PASS: 无自转' : 'FAIL: 仍在自转');
// 手动拖动
const before = (await page.evaluate(() => window.__workshopRay?.(640,420)))?.vaseRot?.y;
await page.mouse.move(640, 420); await page.mouse.down();
await page.mouse.move(780, 420, { steps: 10 }); await page.mouse.up();
await page.waitForTimeout(300);
const afterDrag = (await page.evaluate(() => window.__workshopRay?.(640,420)))?.vaseRot?.y;
console.log(`拖动 rotation.y: ${before} → ${afterDrag}`, Math.abs(afterDrag - before) > .3 ? 'PASS: 手动拖动可旋转' : 'FAIL: 拖动无效');
await page.screenshot({ path: 'artifacts/fix3-bench.png' });
await browser.close();
