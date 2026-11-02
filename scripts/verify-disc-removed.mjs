// 圆盘台面移除回归：任何一屏的主场景里都不得出现那块"圆盘"（宽而扁的圆柱台面 / 大半径圆环）。
// 判定：① 逐屏扫描场景图元，圆盘特征（半径 > 3 且高度 < .3 的柱/圆/环，或半径 > 3 的环）必须为 0；
//       ② 顺带截图，便于目视确认模型从上到下完整。
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 160)));
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => !!window.porcelain, { timeout: 30000 }).catch(() => { });
await page.waitForTimeout(2600);

let bad = 0;
const scan = async (label) => {
  const r = await page.evaluate(() => {
    const p = window.porcelain;
    const scene = p.vase?.parent || null;
    const discs = [];
    if (scene) scene.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      // 祖先链任一不可见 → 实际不可见
      for (let up = o; up; up = up.parent) if (!up.visible) return;
      const g = o.geometry, t = g?.type, par = g?.parameters || {};
      if (t === 'CylinderGeometry') {
        const rMax = Math.max(par.radiusTop || 0, par.radiusBottom || 0);
        if (rMax > 3 && (par.height || 1e9) < .3) discs.push({ t, rMax, h: par.height, parent: o.parent?.name || o.parent?.type });
      } else if (t === 'CircleGeometry' || t === 'RingGeometry') {
        const rMax = Math.max(par.radius || 0, par.outerRadius || 0);
        if (rMax > 3) discs.push({ t, rMax, parent: o.parent?.name || o.parent?.type });
      } else if (t === 'TorusGeometry') {
        const R = par.radius || 0;
        if (R > 3) discs.push({ t, R, parent: o.parent?.name || o.parent?.type });
      }
    });
    return { view: p.view, hasBridge: !!p.bridge, discs };
  });
  const ok = r.discs.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${label} [${r.view}] 圆盘图元 ${r.discs.length} 个${r.discs.length ? '：' + JSON.stringify(r.discs) : ''}`);
  await page.screenshot({ path: `artifacts/verify-nodisc-${label}.png` });
};

await scan('start');
await page.evaluate(() => document.querySelector('[data-go="cabinet"]')?.click());
await page.waitForTimeout(1700);
await scan('cabinet');
await page.evaluate(() => document.querySelector('.cabinet-card .primary')?.click());
await page.waitForTimeout(2100);
await scan('commission');
await page.evaluate(() => document.querySelector('#accept-commission')?.click());
await page.waitForTimeout(3600);
await scan('puzzle');
await page.evaluate(() => window.porcelain.go('choice'));
await page.waitForTimeout(2400);
await scan('choice');
await page.evaluate(() => window.porcelain.go('exhibit'));
await page.waitForTimeout(2400);
await scan('exhibit');
await browser.close();
console.log(bad === 0 ? '\nDONE：全部屏幕均无圆盘台面' : `\nDONE：有 ${bad} 屏仍存在圆盘`);
