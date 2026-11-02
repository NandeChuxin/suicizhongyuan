// 「扫描成器 + 循痕识位」浏览器验收：
// ① 归位 6/8 前按钮置灰、达标后可点；② 扫描 → 半透明推演预览 + 数字示意标注；
// ③ 拖动接近正确位置出现匹配分与箭头；④ 提示位置 = 淡金水印且不自动吸附。
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('artifacts/scanfix', { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

// 进拼合页
await page.evaluate(() => { window.porcelain.go('puzzle'); });
await page.waitForTimeout(1500);

// ① 未达标：按钮置灰
const gate = await page.evaluate(() => ({ disabled: document.getElementById('scan-btn').disabled, title: document.getElementById('scan-btn').title }));
console.log('未达标按钮:', JSON.stringify(gate));

// 归位 6 片（引擎直呼 attemptSnap，等价玩家吸附；不写存档）
await page.evaluate(() => {
  const P = window.porcelain;
  for (const f of P.fragments.slice(0, 6)) {
    f.mesh.position.copy(f.correctPosition);
    f.mesh.rotation.z = f.correctRotation;
    P.attemptSnap(f);
  }
});
await page.waitForTimeout(800);
const after6 = await page.evaluate(() => ({
  repaired: window.porcelain.repaired,
  disabled: document.getElementById('scan-btn').disabled,
  title: document.getElementById('scan-btn').title,
  storage: localStorage.getItem('porcelain-reunion-progress-v1')?.length ?? 0
}));
console.log('归位6片后:', JSON.stringify(after6));
await page.screenshot({ path: 'artifacts/scanfix/1-gate.png' });

// ② 回到拼合页（吸附后 550ms 会自动跳记忆页）→ 点扫描 → 等动效 → 预览 + 标注
await page.evaluate(() => window.porcelain.go('puzzle'));
await page.waitForTimeout(800);
await page.click('#scan-btn');
await page.waitForTimeout(2600);
const scan = await page.evaluate(() => {
  const note = document.getElementById('scan-note');
  return { noteVisible: !note.hidden, noteText: note.textContent, btn: document.getElementById('scan-btn').textContent, status: document.getElementById('status').textContent };
});
console.log('扫描后:', JSON.stringify(scan));
await page.screenshot({ path: 'artifacts/scanfix/2-preview.png' });

// ③ 选中第 7 片，用真实鼠标拖到正确位置附近 → 匹配分与箭头
const dragPt = await page.evaluate(() => {
  const P = window.porcelain, f = P.fragments[6];
  const canvas = P.renderer.domElement, r = canvas.getBoundingClientRect();
  const cam = P.camera;
  // THREE.Matrix4 没有 DOMMatrixInit 的 m11 属性，直接传给 matrixTransform 是恒等变换——
  // 必须经 elements（列主序）重建 DOMMatrix。
  const viewM = new DOMMatrix(Array.from(cam.matrixWorldInverse.elements));
  const projM = new DOMMatrix(Array.from(cam.projectionMatrix.elements));
  const toClient = (wx, wy) => {
    const eye = new DOMPoint(wx, wy, 0, 1).matrixTransform(viewM);
    const clip = eye.matrixTransform(projM);
    return [r.left + (clip.x / clip.w + 1) / 2 * r.width, r.top + (1 - clip.y / clip.w) / 2 * r.height];
  };
  f.mesh.position.set(f.correctPosition.x + .3, f.correctPosition.y + .15, 0);
  f.mesh.rotation.z = f.correctRotation + .05;
  // 把另一片未归位碎片挪出画面，避免射线命中时按 renderOrder 抓错
  P.fragments[7].mesh.position.set(-9, 9, 0);
  f.mesh.updateMatrixWorld();
  const c3 = f.mesh.geometry.boundingBox.getCenter(new (f.mesh.position.constructor)());
  const rot = f.mesh.rotation.z, cos = Math.cos(rot), sin = Math.sin(rot);
  const lc = { x: c3.x * cos - c3.y * sin, y: c3.x * sin + c3.y * cos }; // 抓取点相对原点的世界偏移
  const from = toClient(f.mesh.position.x + lc.x, f.mesh.position.y + lc.y);
  const to = toClient(f.correctPosition.x + lc.x, f.correctPosition.y + lc.y);
  return { from, to };
});
await page.mouse.move(dragPt.from[0], dragPt.from[1]);
await page.mouse.down();
await page.mouse.move(dragPt.to[0], dragPt.to[1], { steps: 8 });
await page.waitForTimeout(300);
const drag = await page.evaluate(() => ({
  arrowVisible: !document.getElementById('hint-arrow').hidden,
  status: document.getElementById('status').textContent
}));
console.log('拖动提示:', JSON.stringify(drag));
await page.screenshot({ path: 'artifacts/scanfix/3-hint.png' });

// ④ 提示位置：淡金水印（不吸附）
await page.evaluate(() => { window.porcelain.go('puzzle'); }); // noop 保持视图
await page.evaluate(() => document.getElementById('locate').click());
await page.waitForTimeout(400);
const locate = await page.evaluate(() => {
  const P = window.porcelain, f = P.fragments[6];
  return { repaired: P.repaired, status: document.getElementById('status').textContent, stillUnlocked: !f.locked, ghostGold: true };
});
console.log('提示位置:', JSON.stringify(locate));
await page.screenshot({ path: 'artifacts/scanfix/4-locate.png' });

// ⑤ 归位后推演纹理刷新 + 第 8 片归位走正常流程
const final = await page.evaluate(() => {
  const P = window.porcelain, f = P.fragments[7];
  f.mesh.position.copy(f.correctPosition); f.mesh.rotation.z = f.correctRotation;
  P.attemptSnap(f);
  return { repaired: P.repaired };
});
console.log('全部归位:', JSON.stringify(final));
console.log('页面错误:', errs.length ? errs.join(' | ') : '无');
console.log(!gate.disabled === false && after6.disabled === false && scan.noteVisible && drag.arrowVisible && locate.stillUnlocked && errs.length === 0 ? 'PASS' : 'CHECK');
await browser.close();
