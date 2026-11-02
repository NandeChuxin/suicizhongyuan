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

// ① 证书页：纸面肖像图已显示且有内容
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="certificate"]')?.click(); });
await page.waitForTimeout(3000);
const cert = await page.evaluate(() => {
  const img = document.getElementById('cert-portrait');
  const r = img.getBoundingClientRect();
  const style = getComputedStyle(img);
  return { display: style.display, srcLen: (img.src || '').length, w: Math.round(r.width), visible: r.width > 50 && style.display !== 'none' && img.src.startsWith('data:image') };
});
console.log('证书肖像图:', JSON.stringify(cert), cert.visible ? 'PASS' : 'FAIL');

// ② 工作台：器身不自转
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="choice"]')?.click(); });
await page.waitForTimeout(800);
await page.click('#choose-juci', { force: true });
await page.waitForTimeout(400);
const rot0 = await page.evaluate(() => window.__vaseRot || null);
// 读取 vase.rotation.y：通过调试钩子
const y0 = await page.evaluate(() => { const d = window.__workshopDebug?.(); return d ? d.camType : null; });
// 直接从 three 场景读：用 canvas 上拖动前后对比 —— 这里用简单办法：等 2.5 秒看是否有自动旋转（对比截图不可行，用射线调试对象的 markerWorld 变化）
const before = await page.evaluate(() => window.__workshopDebug?.()?.markerWorld);
await page.waitForTimeout(2500);
const after = await page.evaluate(() => window.__workshopDebug?.()?.markerWorld);
const moved = before && after && (Math.abs(before.x - after.x) > .01 || Math.abs(before.z - after.z) > .01);
console.log(`静置2.5s标记世界坐标: 前(${before?.x?.toFixed(3)},${before?.z?.toFixed(3)}) 后(${after?.x?.toFixed(3)},${after?.z?.toFixed(3)})`, moved ? 'FAIL: 器身仍在自转' : 'PASS: 器身静止');
// 手动拖动应能旋转
await page.mouse.move(640, 420); await page.mouse.down();
await page.mouse.move(740, 420, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(300);
const afterDrag = await page.evaluate(() => window.__workshopDebug?.()?.markerWorld);
const dragMoved = afterDrag && after && (Math.abs(afterDrag.x - after.x) > .05 || Math.abs(afterDrag.z - after.z) > .05);
console.log('手动拖动:', dragMoved ? 'PASS: 拖动可旋转器身' : 'FAIL: 拖动无效');
await page.screenshot({ path: 'artifacts/fix2-choice.png' });
await browser.close();
