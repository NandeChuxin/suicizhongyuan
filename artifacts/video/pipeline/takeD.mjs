import { openApp, Recorder, Actor, sleep, settle, ROOT, FFMPEG } from './lib.mjs';
import { SEED } from './picks.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const dir = path.join(ROOT, 'takes', 'D-system');
fs.rmSync(dir, { recursive: true, force: true });
const { browser, page, errors } = await openApp({ seed: SEED.slots() });
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
const rec = new Recorder(page, dir);
let actor;
const log = (...a) => console.log(...a);
const pos = async (sel, n = 0) => page.evaluate(([sel, n]) => {
  const el = document.querySelectorAll(sel)[n];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, [sel, n]);
const click = async (sel, opts = {}, n = 0) => { const p = await pos(sel, n); if (!p) { log('missing', sel, n); return false; } await actor.click(p.x, p.y, opts); return true; };

try {
  await sleep(4000);
  await page.evaluate(() => window.porcelain.go('cabinet'));
  await sleep(6000);
  await settle(page);
  await rec.start();
  actor = new Actor(page, rec);
  actor.mark('system');
  await actor.wait(1200);
  await actor.moveTo(1200, 700, 1100);
  await actor.wait(400);
  await click('#save-entry', { hover: 900, settle: 2600 });
  await actor.wait(1600);
  await actor.hoverSel('.slot-cards .slot-card', 700, 1200);
  await click('.slot-cards .slot-card', { hover: 700, settle: 2600 }, 1);   // 切到槽位 2
  await actor.wait(2000);
  await click('.slot-cards .slot-card', { hover: 700, settle: 2200 }, 2);   // 空格位 3
  await actor.wait(1800);
  await click('.slot-cards .slot-card', { hover: 600, settle: 2200 }, 0);   // 回到槽位 1
  await actor.wait(1600);
  await click('#export-save', { hover: 800, settle: 2600 });
  await actor.wait(1400);
  await click('#copy-share', { hover: 700, settle: 2200 });
  await actor.wait(2200);
  await actor.moveTo(1000, 900, 800);
  await actor.wait(1800);
  await click('#save-close', { hover: 500, settle: 1200 });
  await actor.wait(1400);
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
