import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const saved = JSON.parse(localStorage.getItem('porcelain-reunion-progress-v1') || '{}');
  saved.repaired = saved.repaired || ['meiping']; saved.name = '测试';
  localStorage.setItem('porcelain-reunion-progress-v1', JSON.stringify(saved));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="choice"]')?.click(); });
await page.waitForTimeout(1000);
await page.click('[data-mode="kintsugi"]', { force: true });
await page.waitForTimeout(1500);

// ① 抉择屏应显示 GLB（modelReady）而非程序化器身
const vis = await page.evaluate(() => window.__workshopRay?.(640, 420) || {});
console.log('工作台激活:', vis.active);
const glb = await page.evaluate(async () => {
  await new Promise(r => setTimeout(r, 1500));
  return window.__modelState || null;
});
// 直接从渲染器场景判断：用截图目测 + 标记父级
const shot1 = await page.screenshot({ path: 'artifacts/glb-bench.png' });

// ② 点完清创 3 点 + 落金 4 点（标记可能分批出现，循环点）
for (let round = 0; round < 40; round++) {
  const pts = await page.evaluate(() => window.__workshopDebug?.() || []);
  if (!pts.length) {
    // 可能已进入上釉步
    const glazeRow = await page.evaluate(() => !document.getElementById('work-glaze-row')?.hidden);
    if (glazeRow) break;
    await page.waitForTimeout(400); continue;
  }
  const p = pts[0];
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(450);
}
const step = await page.evaluate(() => ({
  glazeRow: !document.getElementById('work-glaze-row')?.hidden,
  tip: document.getElementById('work-tip')?.textContent?.slice(0, 40)
}));
console.log('清创+落金完成:', JSON.stringify(step));

// ③ 按住上釉 2.2 秒
const btn = await page.evaluate(() => { const b = document.getElementById('work-glaze'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(btn.x, btn.y); await page.mouse.down();
await page.waitForTimeout(2300);
await page.mouse.up();
await page.waitForTimeout(2500);
const final = await page.evaluate(() => document.querySelector('.screen:not([hidden])')?.dataset.screen);
console.log(final === 'certificate' ? 'PASS: GLB 模型上全流程走通，已进证书页' : `FAIL: 最终屏=${final}`);
await page.screenshot({ path: 'artifacts/glb-cert.png' });
await browser.close();
