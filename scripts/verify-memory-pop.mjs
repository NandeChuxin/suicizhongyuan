// 验证「每归位一片 → 自动弹出该瓷片记忆」+ GLB 光泽参数对齐
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => document.querySelector('[data-go="cabinet"]')?.click());
await page.waitForTimeout(1200);
await page.evaluate(() => document.querySelector('.cabinet-card .primary')?.click());
await page.waitForTimeout(1200);
await page.evaluate(() => document.querySelector('#accept-commission')?.click());
await page.waitForTimeout(3500);

// 等待 GLB 就绪并采样釉面参数（检查任一碎片 envMap 被注入即视为对齐链路通了）
await page.waitForTimeout(3000);
const glaze = await page.evaluate(() => {
  for (const f of window.porcelain.fragments) {
    const m = Array.isArray(f.mesh.material) ? f.mesh.material[0] : f.mesh.material;
    if (m?.isMeshPhysicalMaterial) return { roughness: +m.roughness.toFixed(3), metalness: +m.metalness.toFixed(3), hasEnv: !!m.envMap, spec: m.specularColor ? [+m.specularColor.r.toFixed(2), +m.specularColor.g.toFixed(2), +m.specularColor.b.toFixed(2)] : null };
  }
  return null;
});
console.log('GLAZE', JSON.stringify(glaze));

// 循环 3 次：点击归位 → 断言自动进入记忆屏 → 关闭回拼合台
for (let round = 0; round < 3; round++) {
  const target = await page.evaluate(() => {
    const frs = window.porcelain.fragments, cam = window.porcelain.camera;
    const f = frs.find(x => !x.locked);
    if (!f) return null;
    const canvas = document.querySelector('#vessel-stage canvas');
    const rect = canvas.getBoundingClientRect();
    f.mesh.geometry.computeBoundingBox();
    const box = f.mesh.geometry.boundingBox;
    const v = new (cam.position.constructor)();
    const pts = [];
    for (const dx of [0.5, 0, 1]) for (const dy of [0.5, 0, 1]) for (const dz of [0.5, 0, 1]) {
      v.set(box.min.x + (box.max.x - box.min.x) * dx, box.min.y + (box.max.y - box.min.y) * dy, box.min.z + (box.max.z - box.min.z) * dz)
        .applyMatrix4(f.mesh.matrixWorld).project(cam);
      pts.push([rect.left + (v.x + 1) / 2 * rect.width, rect.top + (1 - v.y) / 2 * rect.height]);
    }
    return { pts, idx: f.index };
  });
  if (!target) break;
  let snapped = false;
  for (const [x, y] of target.pts) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(350);
    const st = await page.evaluate(i => window.porcelain.fragments[i].locked, target.idx);
    if (st) { snapped = true; break; }
  }
  if (!snapped) { console.log(`ROUND${round} SNAP-FAIL`); continue; }
  // 等自动弹记忆（850ms 延迟 + 转场）
  await page.waitForTimeout(2200);
  const mem = await page.evaluate(() => ({
    view: window.porcelain.view,
    title: document.getElementById('memory-title')?.textContent,
    year: document.getElementById('memory-year')?.textContent,
    pager: document.getElementById('memory-pager')?.textContent,
    textLen: document.getElementById('memory-text')?.textContent?.length ?? 0
  }));
  console.log(`ROUND${round} frag#${target.idx} →`, JSON.stringify(mem));
  if (mem.view === 'memory') {
    await page.evaluate(() => document.getElementById('memory-next')?.click());
    await page.waitForTimeout(1600);
    const back = await page.evaluate(() => window.porcelain.view);
    console.log(`ROUND${round} back to:`, back);
  }
}
await page.screenshot({ path: 'D:/数字媒体/碎瓷重圆/artifacts/verify-memory-pop.png' });
await browser.close();
console.log('DONE');
