import { openApp, Recorder, Actor, sleep, ROOT, FFMPEG } from './lib.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const dir = path.join(ROOT, 'takes', 'A2-choice-cert');
fs.rmSync(dir, { recursive: true, force: true });

const seed = {
  'porcelain-reunion-progress-v1': JSON.stringify({
    completed: {}, certificates: {}, userName: '沈砚', currentVesselId: 'meiping',
    puzzle3d: { meiping: [0, 1, 2, 3, 4, 5, 6, 7] },
  }),
};
const { browser, page, errors } = await openApp({ seed });
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
const rec = new Recorder(page, dir);
let actor;
const log = (...a) => console.log(...a);

const canvasCenter = () => page.evaluate(() => {
  const c = [...document.querySelectorAll('canvas')].find(x => getComputedStyle(x).pointerEvents === 'auto');
  const r = c.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const rayAt = (x, y) => page.evaluate(([x, y]) => window.__workshopRay?.(x, y), [x, y]);
const markers = () => page.evaluate(() => window.__workshopDebug?.() || []);

async function workshop() {
  // 逐步：点标记；被器身挡住就转动器身再看
  for (let guard = 0; guard < 24; guard++) {
    const glazeReady = await page.evaluate(() => { const r = document.querySelector('#work-glaze-row'); return r && !r.hidden; });
    if (glazeReady) break;
    const ms = await markers();
    if (!ms.length) { await actor.wait(500); continue; }
    let clicked = false;
    for (const m of ms) {
      const r = await rayAt(m.x, m.y);
      const ok = r && r.marker >= 0 && (!r.vaseD || r.markerD <= r.vaseD + 0.22);
      if (!ok) continue;
      await actor.moveTo(m.x, m.y, 420);
      await actor.wait(220);
      await actor.mouseDown();
      await actor.wait(60);
      await actor.mouseUp();
      await actor.wait(700);
      clicked = true;
      break;
    }
    if (!clicked) {
      const c = await canvasCenter();
      await actor.drag(c.x + 150, c.y, c.x - 170, c.y, 1000);
      await actor.wait(600);
    }
  }
  await actor.wait(400);
}

try {
  await sleep(5000);
  await page.evaluate(() => window.porcelain.go('choice'));
  await sleep(9000);
  await page.evaluate(() => window.porcelain.go('choice'));
  await rec.start();
  actor = new Actor(page, rec);
  actor.mark('choice');
  await actor.wait(1200);
  await actor.moveTo(880, 520, 1200);
  await actor.wait(600);
  await actor.hoverSel('.choice-option[data-mode="traditional"]', 900, 1400);
  await actor.hoverSel('.choice-option[data-mode="kintsugi"]', 850, 1500);
  await actor.clickSel('#knock-choice', { hover: 600, settle: 1700 });
  await actor.clickSel('.choice-option[data-mode="kintsugi"]', { hover: 800, settle: 2400 });
  let opened = await page.evaluate(() => !!document.querySelector('#work-bar'));
  if (!opened) {
    log('workshop not opened, retry');
    await actor.clickSel('.choice-option[data-mode="kintsugi"]', { hover: 500, settle: 2400 });
    opened = await page.evaluate(() => !!document.querySelector('#work-bar'));
  }
  log('workshop opened:', opened);
  await actor.wait(1400);
  actor.mark('workshop');
  await workshop();

  const gb = await page.$('#work-glaze');
  if (gb) {
    const b = await gb.boundingBox();
    if (b) {
      await actor.moveTo(b.x + b.width / 2, b.y + b.height / 2, 700);
      await actor.wait(350);
      await page.mouse.down();
      await actor.wait(3900);
      await page.mouse.up();
    }
  }
  let cert = false;
  for (let i = 0; i < 40; i++) { if (await page.evaluate(() => window.porcelain.view === 'certificate')) { cert = true; break; } await actor.wait(300); }
  log('certificate reached:', cert);
  await actor.wait(3800);
  actor.mark('certificate');

  await actor.type('#cert-note', '愿裂痕被看见，也被善待。', 110);
  await actor.wait(1500);
  await actor.clickSel('#download', { hover: 700, settle: 3000 });
  await actor.wait(1800);
  await actor.clickSel('#exhibit', { hover: 700, settle: 2500 });
  await actor.wait(3200);
  await actor.clickSel('#close-drawer', { hover: 400, settle: 900 });
  await actor.wait(500);
  await actor.clickSel('#archive-card', { hover: 600, settle: 2400 });
  await actor.wait(2800);
  await page.evaluate(() => { const el = document.querySelector('#drawer-body'); if (el) el.scrollTop = el.scrollHeight * 0.42; });
  await actor.wait(2800);
  await actor.clickSel('#close-drawer', { hover: 400, settle: 800 });
  await actor.wait(1600);
} catch (e) {
  log('TAKE ERROR', String(e).slice(0, 300));
} finally {
  const data = await rec.stop();
  log('frames', data.frames.length, 'duration', (data.frames.at(-1)?.t ?? 0) / 1000);
  log('marks', JSON.stringify(data.marks));
  const v = await rec.toVideo();
  execFileSync(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', v.listPath, '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', v.out], { stdio: 'ignore' });
  log('errors', errors.filter(e => !/404/.test(e)).slice(0, 8));
  await browser.close();
}
