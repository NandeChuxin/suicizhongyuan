import { openApp, Recorder, Actor, sleep, settle, ROOT, FFMPEG } from './lib.mjs';
import { SEED } from './picks.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const dir = path.join(ROOT, 'takes', 'B-tour');
fs.rmSync(dir, { recursive: true, force: true });
const { browser, page, errors } = await openApp({ seed: SEED.allDone() });
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
const rec = new Recorder(page, dir);
let actor;
const log = (...a) => console.log(...a);

const clickNth = async (sel, n, opts = {}) => {
  const b = await page.evaluate(([sel, n]) => {
    const el = document.querySelectorAll(sel)[n];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, [sel, n]);
  if (!b) return false;
  await actor.click(b.x, b.y, opts);
  return true;
};
const dismissNote = async () => {
  const open = await page.evaluate(() => { const n = document.querySelector('#tour-note'); return n ? !n.hidden : false; });
  if (!open) return false;
  const b = await page.evaluate(() => {
    const n = document.querySelector('#tour-note');
    const r = n.getBoundingClientRect();
    return { x: r.x + r.width * 0.12, y: r.y + r.height * 0.3 };
  });
  await actor.click(b.x, b.y, { hover: 500, settle: 1200 });
  return true;
};
const waitArrive = async () => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.porcelain.ensureTour().moving))) break;
    await actor.wait(350);
  }
  await actor.wait(2200);
};

try {
  await sleep(4000);
  await page.evaluate(() => window.porcelain.go('tour'));
  await sleep(14000);
  await settle(page);
  await rec.start();
  actor = new Actor(page, rec);
  actor.mark('tour');
  await actor.wait(1000);
  const cv = await page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].filter(x => x.getBoundingClientRect().width > 600).pop();
    const r = c.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await dismissNote();
  await actor.wait(1800);
  await actor.moveTo(cv.x + 260, cv.y - 130, 1200);
  await actor.wait(300);
  await actor.drag(cv.x + 240, cv.y - 40, cv.x - 150, cv.y - 20, 1700);
  await actor.wait(900);
  await clickNth('#tour-console [data-row="camera"] .fw-btn', 1, { hover: 800, settle: 2000 });
  await actor.wait(600);
  await clickNth('#tour-console [data-row="light"] .fw-btn', 2, { hover: 700, settle: 2600 });
  await actor.wait(900);
  await clickNth('#tour-console [data-row="camera"] .fw-btn', 2, { hover: 600, settle: 2200 });
  await actor.wait(800);
  // 构件溯源：对准建筑
  await actor.moveTo(cv.x + 40, cv.y + 110, 900);
  await actor.wait(1600);

  // 古窑
  await clickNth('#tour-map .tour-chip', 1, { hover: 800, settle: 1600 });
  await waitArrive();
  await dismissNote();
  await actor.wait(900);
  await actor.drag(cv.x + 160, cv.y + 10, cv.x - 150, cv.y + 30, 1500);
  await actor.wait(800);
  await clickNth('#tour-console [data-row="camera"] .fw-btn', 3, { hover: 600, settle: 2200 });
  await actor.wait(700);

  // 陶溪川（最后一站 → 终局成就）
  await clickNth('#tour-map .tour-chip', 2, { hover: 800, settle: 1600 });
  await waitArrive();
  await dismissNote();
  await actor.wait(700);
  await actor.drag(cv.x + 130, cv.y, cv.x - 120, cv.y + 20, 1200);
  let ach = false;
  for (let i = 0; i < 16; i++) {
    ach = await page.evaluate(() => { const a = document.querySelector('#achievement'); return a ? !a.hidden : false; });
    if (ach) break;
    await actor.wait(400);
  }
  log('achievement', ach);
  await actor.wait(3000);
  await actor.moveTo(cv.x - 120, cv.y - 90, 1100);
  await actor.wait(3800);
} catch (e) {
  log('TAKE ERROR', String(e).slice(0, 300));
} finally {
  const data = await rec.stop();
  log('frames', data.frames.length, 'duration', (data.frames.at(-1)?.t ?? 0) / 1000);
  log('marks', JSON.stringify(data.marks));
  const v = await rec.toVideo();
  execFileSync(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', v.listPath, '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', v.out], { stdio: 'ignore' });
  log('errors', errors.filter(e => !/404/.test(e)).slice(0, 6));
  await browser.close();
}
