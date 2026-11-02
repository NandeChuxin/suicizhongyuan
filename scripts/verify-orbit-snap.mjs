// 拼合屏交互验证：360° 拖动旋转（任意起点）、点击归位、归位标记、粘合中可旋转、弹窗延后、视角保留、页脚移除
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });

const state = p => p.evaluate(() => ({
  view: window.porcelain.view,
  repaired: window.porcelain.repaired,
  yaw: window.porcelain.bridge?.orbit?.yaw ?? null,
  pitch: window.porcelain.bridge?.orbit?.pitch ?? null,
  zoom: window.porcelain.bridge?.view?.zoom ?? null,
  rotating: !!window.porcelain.bridge?.isRotating,
  flags: window.porcelain.bridge?.snapFlags?.length ?? null,
  status: document.getElementById('status')?.textContent || '',
  footer: !!document.querySelector('footer'),
  memoryOpen: !document.querySelector('[data-screen="memory"]')?.hidden
}));
const nd = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };

const enterPuzzle = async (p) => {
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(2400);
  for (let i = 0; i < 8; i++) {
    const cur = await p.evaluate(() => window.porcelain.view);
    if (cur === 'puzzle') break;
    const sel = { start: '[data-go="cabinet"]', cabinet: '.cabinet-card .primary', commission: '#accept-commission' }[cur];
    if (sel) await p.mouse.click(...await p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel));
    await p.waitForTimeout(1900);
  }
  await p.waitForTimeout(2600);
};

const dragAt = async (p, x, y, dx, dy, steps = 16) => {
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x + dx, y + dy, { steps });
  await p.mouse.up();
};

const run = async (w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 240)));
  await enterPuzzle(page);
  const log = [];
  const canvas = await page.evaluate(() => { const r = document.querySelector('#vessel-stage canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  const P = (fx, fy) => [canvas[0] + canvas[2] * fx, canvas[1] + canvas[3] * fy];
  const s0 = await state(page);
  log.push(`初始: view=${s0.view} yaw=${s0.yaw?.toFixed(3)} footer=${s0.footer} 碎片数=${s0.repaired === null ? '?' : ''}`);

  // ① 从「全息瓶之上」起拖 → 旋转
  await dragAt(page, ...P(.5, .3), 180, 0);
  await page.waitForTimeout(300);
  let s = await state(page);
  log.push(`① 全息瓶上拖动: Δyaw=${nd(s.yaw, s0.yaw).toFixed(3)} rad 归位数=${s.repaired} 仍在旋转标记=${s.rotating}`);

  // ② 连续拖动 → 偏航可超过一圈（360° 自由）
  for (let i = 0; i < 5; i++) await dragAt(page, ...P(.5, .5), 260, 0, 24);
  await page.waitForTimeout(300);
  s = await state(page);
  log.push(`② 连续拖动后 yaw=${s.yaw.toFixed(3)} rad（>2π 即超过一圈：${Math.abs(s.yaw) > Math.PI * 2}）`);

  // ③ 点击碎片（不拖动）→ 归位 + 金环 + 部位提示
  const clickFrag = await page.evaluate(() => {
    const cam = window.porcelain.camera, frs = window.porcelain.fragments;
    const f = frs.find(x => !x.locked);
    const r = document.querySelector('#vessel-stage canvas').getBoundingClientRect();
    f.mesh.geometry.computeBoundingBox();
    const b = f.mesh.geometry.boundingBox, v = new (cam.position.constructor)();
    for (const dx of [.5, .25, .75]) for (const dy of [.5, .3, .7]) for (const dz of [.5, .25]) {
      v.set(b.min.x + (b.max.x - b.min.x) * dx, b.min.y + (b.max.y - b.min.y) * dy, b.min.z + (b.max.z - b.min.z) * dz).applyMatrix4(f.mesh.matrixWorld).project(cam);
      const x = r.left + (v.x + 1) / 2 * r.width, y = r.top + (1 - v.y) / 2 * r.height;
      if (x > r.left + 10 && x < r.right - 10 && y > r.top + 10 && y < r.bottom - 10) return { idx: f.index, pt: [x, y] };
    }
    return { idx: f.index, pt: null };
  });
  const beforeSnap = (await state(page)).repaired;
  if (clickFrag.pt) {
    await page.mouse.move(...clickFrag.pt);
    await page.mouse.down(); await page.mouse.up();   // 纯点击（无位移）
  }
  await page.waitForTimeout(900);
  s = await state(page);
  log.push(`③ 点击碎片#${clickFrag.idx}: 归位 ${beforeSnap}→${s.repaired} 金环数=${s.flags} 提示="${s.status}"`);

  // ④ 归位动画/刚归位期间继续拖动 → 视角照常旋转
  const yawBefore = s.yaw;
  await dragAt(page, ...P(.5, .6), 150, 40, 12);
  await page.waitForTimeout(200);
  s = await state(page);
  log.push(`④ 粘合过程中拖动: Δyaw=${nd(s.yaw, yawBefore).toFixed(3)} rad（应>0.5）归位数=${s.repaired}`);

  // ⑤ 拖动不停 → 记忆弹窗延后；停手后弹出
  const yawKeep = (await state(page)).yaw;
  // 真正按住不放：按下后连续小幅移动 3 秒，期间弹窗应被持续让位
  await page.mouse.move(...P(.5, .5));
  await page.mouse.down();
  let during = null;
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(...P(.5 + (i % 2 ? .06 : -.06), .5), { steps: 4 });
    await page.waitForTimeout(300);
    during = await state(page);
    if (during.memoryOpen) break;
  }
  await page.mouse.up();
  log.push(`⑤ 按住拖动 3s 期间记忆屏=${during.memoryOpen}（应 false，说明延后生效）`);
  await page.waitForTimeout(2600);
  s = await state(page);
  log.push(`   停手后记忆屏=${s.memoryOpen}`);

  // ⑥ 关闭记忆屏 → 回到拼合屏且保留刚才的观察角度
  const yawAtLeave = yawKeep;
  if (s.memoryOpen) { await page.mouse.click(...await page.evaluate(() => { const r = document.getElementById('memory-next').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })); }
  await page.waitForTimeout(2600);
  s = await state(page);
  log.push(`⑥ 返回拼合屏: view=${s.view} yaw=${s.yaw?.toFixed(3)}（离开前 ${yawAtLeave?.toFixed(3)}，差 ${s.yaw != null ? nd(s.yaw, yawAtLeave).toFixed(3) : '?'}）`);

  console.log(`\n=== ${w}x${h} ===`);
  for (const l of log) console.log(' ', l);
  await page.screenshot({ path: `D:/数字媒体/碎瓷重圆/artifacts/puzzle-after-${w}x${h}.png` });
  await page.close();
};

await run(1280, 800);
await run(1440, 900);
await browser.close();
console.log('\nDONE');
