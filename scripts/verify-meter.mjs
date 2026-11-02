// 进度条功能与遮挡回归：进度随归位推进 + 与碎片零重叠 + 碎片可点
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const run = async (w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2300);
  await page.evaluate(() => window.porcelain.openVessel(window.porcelain.VESSELS[0]));
  await page.evaluate(() => window.porcelain.go('puzzle'));
  await page.waitForTimeout(3200);
  const read = () => page.evaluate(() => {
    const m = document.querySelector('.repair-meter').getBoundingClientRect();
    const cam = window.porcelain.camera, canvas = document.querySelector('#vessel-stage canvas').getBoundingClientRect();
    const V = new (cam.position.constructor)();
    let hitMeter = 0, total = 0;
    for (const f of window.porcelain.fragments) {
      const g = f.mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        V.set(x, y, z).applyMatrix4(f.mesh.matrixWorld).project(cam);
        const px = canvas.left + (V.x + 1) / 2 * canvas.width, py = canvas.top + (1 - V.y) / 2 * canvas.height;
        total++;
        if (px >= m.left && px <= m.right && py >= m.top && py <= m.bottom) hitMeter++;
      }
    }
    return {
      pct: document.getElementById('rp-value').textContent,
      count: document.getElementById('rp-count').textContent,
      aria: document.getElementById('repair-progress').getAttribute('aria-valuenow'),
      fillW: document.getElementById('rp-fill').getBoundingClientRect().width,
      trackW: document.querySelector('.rm-track').getBoundingClientRect().width,
      pointsInMeter: hitMeter, pointsTotal: total, repaired: window.porcelain.repaired
    };
  });
  const s0 = await read();
  // 点两片
  for (let k = 0; k < 2; k++) {
    const pt = await page.evaluate(() => {
      const cam = window.porcelain.camera, frs = window.porcelain.fragments;
      const f = frs.find(x => !x.locked); if (!f) return null;
      const r = document.querySelector('#vessel-stage canvas').getBoundingClientRect();
      f.mesh.geometry.computeBoundingBox(); const b = f.mesh.geometry.boundingBox, v = new (cam.position.constructor)();
      for (const dx of [.5, .3, .7]) for (const dy of [.5, .3, .7]) for (const dz of [.5, .3]) {
        v.set(b.min.x + (b.max.x - b.min.x) * dx, b.min.y + (b.max.y - b.min.y) * dy, b.min.z + (b.max.z - b.min.z) * dz).applyMatrix4(f.mesh.matrixWorld).project(cam);
        const x = r.left + (v.x + 1) / 2 * r.width, y = r.top + (1 - v.y) / 2 * r.height;
        if (x > r.left + 8 && x < r.right - 8 && y > r.top + 8 && y < r.bottom - 8) return [x, y];
      }
      return null;
    });
    if (!pt) break;
    await page.mouse.click(pt[0], pt[1]);
    await page.waitForTimeout(1100);
    // 关掉记忆屏继续
    const mem = await page.evaluate(() => !document.querySelector('[data-screen="memory"]')?.hidden);
    if (mem) { await page.mouse.click(...await page.evaluate(() => { const r = document.getElementById('memory-next').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })); await page.waitForTimeout(2200); }
  }
  const s1 = await read();
  console.log(`${w}x${h}`);
  console.log(`  初始: ${s0.pct} ${s0.count} aria=${s0.aria} fill=${Math.round(s0.fillW)}/${Math.round(s0.trackW)} 落在进度条内的碎片角点=${s0.pointsInMeter}/${s0.pointsTotal}`);
  console.log(`  归位2片后: ${s1.pct} ${s1.count} aria=${s1.aria} fill=${Math.round(s1.fillW)}/${Math.round(s1.trackW)} repaired=${s1.repaired} 角点在条内=${s1.pointsInMeter}/${s1.pointsTotal}`);
  await page.screenshot({ path: `D:/数字媒体/碎瓷重圆/artifacts/meter-final-${w}x${h}.png` });
  await page.close();
};
await run(1280, 800);
await run(1024, 768);
await run(430, 900);
await browser.close();
console.log('DONE');
