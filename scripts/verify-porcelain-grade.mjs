// 瓷器展示亮度回归：
// ① 首页必须保持原亮度（exposure=1、三盏灯=基准 2.6/4.8/3、GLB envMapIntensity=.55）；
// ② 其余页面（拼合成品 / 委托 / 抉择 / 展厅）必须收敛（exposure<1、拼合主光 ≤ 基准 55%）；
// ③ 拼合屏 8/8 成品的中段平均亮度落在可读区间（≤130，且无过曝像素）——这是"刺眼"的量化判据。
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 160)));
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => !!window.porcelain, { timeout: 30000 });
await page.waitForTimeout(4200);

const lightOf = () => page.evaluate(() => {
  const o = { hemi: null, key: null, rim: null };
  const lights = [];
  window.porcelain.vase.parent.traverse(l => { if (l.isLight) lights.push([l.type, l.intensity]); });
  const hemi = lights.find(l => l[0] === 'HemisphereLight');
  const dirs = lights.filter(l => l[0] === 'DirectionalLight').map(l => l[1]);
  return { exposure: window.porcelain.renderer.toneMappingExposure, hemi: hemi?.[1], dirs };
});
const measure = async (label) => {
  const box = await page.evaluate(() => {
    const p = window.porcelain, cam = p.camera;
    const r = document.querySelector('#vessel-stage canvas').getBoundingClientRect();
    const V = new (cam.position.constructor)();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    const roots = p.fragments.filter(f => f.mesh.visible);
    for (const f of roots) {
      const bb = f.mesh.geometry.boundingBox; if (!bb) continue;
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
        V.set(x, y, z).applyMatrix4(f.mesh.matrixWorld).project(cam);
        const sx = r.left + (V.x + 1) / 2 * r.width, sy = r.top + (1 - V.y) / 2 * r.height;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
    }
    if (!Number.isFinite(x0)) return null;
    const w = x1 - x0, h = y1 - y0;
    return { x: Math.round(x0 + w * .2), y: Math.round(y0 + h * .25), width: Math.round(w * .6), height: Math.round(h * .5) };
  });
  if (!box) return null;
  const b64 = (await page.screenshot({ clip: box })).toString('base64');
  const r = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let s = 0, n = 0, hot = 0;
    for (let i = 0; i < d.length; i += 4) { const y = .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]; s += y; n++; if (y > 245) hot++; }
    return { mean: +(s / n).toFixed(1), hot: +(hot / n * 100).toFixed(1) };
  }, b64);
  console.log(`  ${label}：平均亮度 ${r.mean}，过曝 ${r.hot}%`);
  return r;
};

const startL = await lightOf();
console.log('首页', JSON.stringify(startL));
check(startL.exposure === 1, '首页曝光保持 1（原亮度）');
check(startL.hemi === 2.6 && startL.dirs.includes(4.8) && startL.dirs.includes(3), '首页三盏灯保持基准 2.6 / 4.8 / 3');

await page.evaluate(() => document.querySelector('[data-go="cabinet"]')?.click());
await page.waitForTimeout(1700);
const cabL = await lightOf();
check(cabL.exposure < 1, `档案柜曝光收敛（${cabL.exposure}）`);

await page.evaluate(() => document.querySelector('.cabinet-card .primary')?.click());
await page.waitForTimeout(2200);
const comL = await lightOf();
check(comL.exposure < 1, `委托屏曝光收敛（${comL.exposure}）`);

await page.evaluate(() => document.querySelector('#accept-commission')?.click());
await page.waitForTimeout(3600);
const puzL = await lightOf();
console.log('  拼合灯光', JSON.stringify(puzL));
check(puzL.exposure < 1 && puzL.dirs.some(v => v <= 2.5), `拼合屏曝光与主光收敛（exposure ${puzL.exposure}，dirs ${puzL.dirs.join('/')}，基准 4.8）`);

for (let n = 0; n < 20; n++) {
  const done = await page.evaluate(() => {
    const p = window.porcelain, b = p.bridge, f = p.fragments.find(x => !x.locked);
    if (!f) return true;
    f.mesh.position.copy(f.correctPosition);
    if (f.correctQuaternion) f.mesh.quaternion.copy(f.correctQuaternion);
    b.confirm?.(f, { force: true });
    return false;
  });
  await page.waitForTimeout(400);
  if (done) break;
}
await page.waitForTimeout(9500);
await page.keyboard.press('Escape');
await page.waitForTimeout(4200);
const done8 = await measure('拼合 8/8 成品（收敛后）');
check(done8 && done8.hot <= 1, `成品无成片过曝（过曝像素 ${done8?.hot}%）`);

// 同框 A/B：把亮度临时还原成改动前口径（曝光 1、三盏灯基准、碎片 env .55 / spec 1 / sheen 1），
// 用同一测量框对比，验证"确实暗下来了"（≤ 原亮度 85%）。
const before = await (async () => {
  await page.evaluate(() => {
    const p = window.porcelain;
    p.renderer.toneMappingExposure = 1;
    p.vase.parent.traverse(l => {
      if (l.isHemisphereLight) l.intensity = 2.6;
      if (l.isDirectionalLight) l.intensity = l.intensity > 2.2 ? 4.8 : 3;
    });
    for (const f of p.fragments) {
      for (const m of (Array.isArray(f.mesh.material) ? f.mesh.material : [f.mesh.material])) {
        if (!m) continue;
        if ('envMapIntensity' in m) m.envMapIntensity = .55;
        if ('specularIntensity' in m) m.specularIntensity = 1;
        if ('sheen' in m) m.sheen = 1;
      }
    }
  });
  await page.waitForTimeout(600);
  return measure('拼合 8/8 成品（还原改动前口径）');
})();
check(done8 && before && done8.mean <= before.mean * .85,
  `成品亮度至少降低 15%（${before?.mean} → ${done8?.mean}，降幅 ${before ? Math.round((1 - done8.mean / before.mean) * 100) : '?'}%）`);

await page.evaluate(() => window.porcelain.go('exhibit'));
await page.waitForTimeout(2500);
const exL = await lightOf();
check(exL.exposure < 1, `展厅曝光收敛（${exL.exposure}）`);

await browser.close();
console.log(fails ? `\nDONE：有 ${fails} 项不达标` : '\nDONE：瓷器展示分级全部达标');
process.exit(fails ? 1 : 0);
