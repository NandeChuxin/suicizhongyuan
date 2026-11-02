import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', e.stack ? e.stack.slice(0, 500) : String(e).slice(0, 300)));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => { document.querySelector('[data-go="cabinet"]')?.click(); });
await page.waitForTimeout(1500);
await page.evaluate(() => { document.querySelector('.cabinet-card .primary')?.click(); });
await page.waitForTimeout(1500);
await page.evaluate(() => { document.querySelector('#accept-commission')?.click(); });
await page.waitForTimeout(3500);

// 取景校验：全息瓶顶/台面底都应在视野内
const info = await page.evaluate(() => {
  const cam = window.porcelain.camera, bridge = window.porcelain.bridge, frs = window.porcelain.fragments;
  const half = (cam.top - cam.bottom) / 2 / cam.zoom;
  const cy = cam.position.y;
  const visibleTop = cy + half, visibleBot = cy - half;
  let geoTop = -Infinity;
  for (const f of frs) geoTop = Math.max(geoTop, f.mesh.geometry.boundingBox.max.y);
  const vesselTop = frs[0].correctPosition.y + geoTop;
  const benchBot = -0.54;
  const btns = {};
  for (const id of ['turn-left', 'turn-right', 'tap-mode']) { const el = document.getElementById(id); btns[id] = el ? el.hidden : 'missing'; }
  return { visibleTop, visibleBot, vesselTop, fitsTop: visibleTop >= vesselTop, fitsBot: visibleBot <= benchBot, btns };
});
console.log('FRAMING', JSON.stringify(info));

await page.screenshot({ path: 'D:/数字媒体/碎瓷重圆/artifacts/audit-puzzle-after.png' });

// 点击归位校验：在页面内对碎片包围盒投影区域做射线扫描，找到一个确定命中的像素
const clickResult = await page.evaluate(() => {
  const THREE = window.three ?? null;
  const frs = window.porcelain.fragments;
  const cam = window.porcelain.camera;
  const canvas = document.querySelector('#vessel-stage canvas');
  const rect = canvas.getBoundingClientRect();
  const f = frs.find(x => !x.locked);
  // 世界包围盒角点投影，取投影矩形内网格扫描，用相机射线验证命中
  f.mesh.geometry.computeBoundingBox();
  const box = f.mesh.geometry.boundingBox;
  const v = new (cam.position.constructor)();
  const proj = (wx, wy, wz) => {
    v.set(wx, wy, wz).applyMatrix4(f.mesh.matrixWorld).project(cam);
    return [rect.left + (v.x + 1) / 2 * rect.width, rect.top + (1 - v.y) / 2 * rect.height];
  };
  const pts = [];
  for (const dx of [0, .5, 1]) for (const dy of [0, .5, 1]) for (const dz of [0, .5, 1])
    pts.push(proj(box.min.x + (box.max.x - box.min.x) * dx, box.min.y + (box.max.y - box.min.y) * dy, box.min.z + (box.max.z - box.min.z) * dz));
  // 用页面里的 raycast 逻辑验证：临时监听，直接试 pointerdown 更直接——逐点试点并检查 locked
  return { pts, idx: f.index };
});
for (const [x, y] of clickResult.pts) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
  const st = await page.evaluate((idx) => ({ locked: window.porcelain.fragments[idx].locked, repaired: window.porcelain.repaired }), clickResult.idx);
  if (st.locked) { console.log('CLICK-SNAP ok at', [x | 0, y | 0], JSON.stringify(st)); break; }
}
const after = await page.evaluate((idx) => ({
  repaired: window.porcelain.repaired,
  locked0: window.porcelain.fragments[idx].locked,
  dist: window.porcelain.fragments[idx].mesh.position.distanceTo(window.porcelain.fragments[idx].correctPosition),
}), clickResult.idx);
console.log('CLICK-SNAP final', JSON.stringify({ clicked: clickResult.idx, ...after }));
await page.screenshot({ path: 'D:/数字媒体/碎瓷重圆/artifacts/audit-puzzle-snapped.png' });
await browser.close();
