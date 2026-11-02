// 验收：拼合屏底部修复进度条 + 全部归位后统一展开的「器物长卷」（翻页式长故事）。
// 用法：先起开发服务器（npm run dev，默认 5173），再执行
//   node scripts/verify-longstory.mjs [宽] [高]
// 输出：artifacts/longstory/*.png 与逐项断言日志。
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:5173/';
const W = Number(process.argv[2] || 1440), H = Number(process.argv[3] || 900);
const OUT = 'artifacts/longstory/';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push('console: ' + m.text().slice(0, 300)); });
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) failed++; };

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3200);
await page.evaluate(() => document.querySelector('[data-go="cabinet"]')?.click());
await page.waitForTimeout(1400);
await page.evaluate(() => document.querySelector('.cabinet-card .primary')?.click());
await page.waitForTimeout(1400);
await page.evaluate(() => document.querySelector('#accept-commission')?.click());
await page.waitForTimeout(4600);

const state = () => page.evaluate(() => ({
  view: window.porcelain.view,
  repaired: window.porcelain.repaired,
  total: window.porcelain.fragments.length,
  value: document.querySelector('#repair-progress')?.getAttribute('aria-valuenow'),
  complete: document.querySelector('#repair-progress')?.classList.contains('complete'),
  count: document.querySelector('#rp-count')?.textContent,
}));

// 点击一片未归位瓷片（3D 点击即归位）：每次点击前重新投影，避免归位轻推导致坐标失效。
async function snapOnce() {
  const pts = await page.evaluate(() => {
    const P = window.porcelain, cam = P.camera, canvas = document.querySelector('#vessel-stage canvas');
    if (!canvas) return [];
    const frag = P.fragments.find(f => !f.locked); if (!frag) return [];
    frag.mesh.updateMatrixWorld(true);
    const g = frag.mesh.geometry, pos = g.attributes.position, rect = canvas.getBoundingClientRect();
    const Vec = cam.position.constructor, step = Math.max(1, Math.floor(pos.count / 60)), out = [];
    for (let i = 0; i < pos.count; i += step) {
      const v = new Vec(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(frag.mesh.matrixWorld).project(cam);
      const x = rect.left + (v.x + 1) / 2 * rect.width, y = rect.top + (1 - v.y) / 2 * rect.height;
      if (x <= rect.left + 2 || x >= rect.right - 2 || y <= rect.top + 2 || y >= rect.bottom - 2) continue;
      out.push([x, y]);
    }
    return out;
  });
  const before = await page.evaluate(() => window.porcelain.fragments.filter(f => f.locked).length);
  for (const [x, y] of pts.slice(0, 20)) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(360);
    const after = await page.evaluate(() => window.porcelain.fragments.filter(f => f.locked).length);
    if (after > before) return true;
  }
  return false;
}

// 1) 单片归位：只推进进度条，不弹记忆
ok(await snapOnce(), '第 1 片归位');
await page.waitForTimeout(800);
let st = await state();
ok(st.view === 'puzzle', `单片归位后仍留在拼合台（${st.view}）`);
ok(st.value === String(Math.round(1 / st.total * 100)), `进度条实时更新（${st.value}%）`);
ok(!st.complete, '未全部归位时进度条不是完成态');
ok(await page.evaluate(() => document.querySelector('[data-screen="memory"]').hidden), '1/8 时未弹出长故事界面');

// 2) 未完成时入口被拦下
const gate = await page.evaluate(() => {
  document.querySelector('#read-memory')?.click();
  const byButton = window.porcelain.view;
  document.querySelector('[data-preview="memory"]')?.click();
  return { byButton, byRail: window.porcelain.view };
});
ok(gate.byButton === 'puzzle' && gate.byRail === 'puzzle', '未全部归位时长故事入口不可用');

// 3) 继续归位，直到全部完成（某一片在背面/被挡时换视角再试）
async function snapAll() {
  for (let round = 0; round < 30; round++) {
    const now = await state();
    if (now.repaired >= now.total && await page.evaluate(() => window.porcelain.fragments.every(f => f.locked))) return true;
    const advanced = await snapOnce();
    if (!advanced) {
      await page.evaluate(() => window.porcelain.bridge?.rotateView(Math.PI / 5));
      await page.waitForTimeout(500);
    }
    // 归位滑行动画结束后 repaired 才追平，稍等再进入下一轮
    for (let i = 0; i < 12; i++) {
      const n = await state();
      if (n.repaired >= n.total || n.repaired > now.repaired) break;
      await page.waitForTimeout(300);
    }
  }
  return false;
}
await snapAll();
for (let i = 0; i < 40; i++) {
  const n = await state();
  if (n.repaired >= n.total) break;
  await page.waitForTimeout(300);
}
st = await state();
ok(st.repaired === st.total, `全部瓷片归位（${st.repaired}/${st.total}）`);
ok(st.value === '100' && st.complete, '进度条 100% 并进入完成态');
await page.screenshot({ path: `${OUT}${W}-puzzle-complete.png` });

// 4) 长故事自动展开（全息终章播完）
for (let i = 0; i < 40; i++) { await page.waitForTimeout(500); if (await page.evaluate(() => window.porcelain.view) === 'memory') break; }
const vol = await page.evaluate(() => ({
  view: window.porcelain.view,
  pager: document.querySelector('#memory-pager')?.textContent,
  dots: document.querySelectorAll('#memory-dots .memory-dot').length,
  title: document.querySelector('#memory-title')?.textContent,
  prev: document.querySelector('#memory-prev')?.disabled,
  nextPage: document.querySelector('#memory-next-page')?.disabled,
  primary: document.querySelector('#memory-next')?.textContent,
}));
ok(vol.view === 'memory', '全部归位后自动展开器物长卷');
ok(vol.dots === 8 && (vol.pager || '').includes('1 / 8'), `长卷页码就位（${vol.pager}）`);
await page.screenshot({ path: `${OUT}${W}-vol-1.png` });

// 5) 逐页翻读：按钮 / 页码点 / 键盘
await page.evaluate(() => document.querySelector('#memory-next-page')?.click());
await page.waitForTimeout(800);
ok((await page.evaluate(() => document.querySelector('#memory-pager')?.textContent) || '').includes('2 / 8'), '「下一页」翻到第 2 页');
await page.evaluate(() => document.querySelectorAll('#memory-dots .memory-dot')[7]?.click());
await page.waitForTimeout(800);
const last = await page.evaluate(() => ({
  pager: document.querySelector('#memory-pager')?.textContent,
  nextPage: document.querySelector('#memory-next-page')?.disabled,
  primary: document.querySelector('#memory-next')?.textContent,
}));
ok((last.pager || '').includes('8 / 8') && last.nextPage, '页码点直达末页且后翻禁用');
ok(last.primary.includes('读完全卷'), `末页主动作：${last.primary}`);
await page.screenshot({ path: `${OUT}${W}-vol-last.png` });

await page.evaluate(() => document.querySelector('#memory-next')?.click());
await page.waitForTimeout(1800);
ok(await page.evaluate(() => window.porcelain.view) === 'choice', '读完全卷进入修复抉择');
ok(errs.length === 0, `无运行时错误${errs.length ? '：' + errs.join(' | ') : ''}`);
await browser.close();
console.log(failed ? `\n验收失败 ${failed} 项` : '\n验收通过');
process.exit(failed ? 1 : 0);
