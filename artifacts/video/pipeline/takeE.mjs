import { openApp, Recorder, Actor, sleep, settle, ROOT, FFMPEG } from './lib.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const W = 430, H = 932;   // 手机竖屏（宽 430 = 短屏口径）
const name = process.argv[2] || 'E-mobile';
const dir = path.join(ROOT, 'takes', name);
fs.rmSync(dir, { recursive: true, force: true });
const { browser, page, errors } = await openApp({ width: W, height: H });
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
const rec = new Recorder(page, dir, { width: W, height: H });
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
  await sleep(5000);
  await settle(page);
  await rec.start();
  actor = new Actor(page, rec);
  actor.mark('mobile');
  await actor.wait(1400);
  await actor.moveTo(W * 0.5, H * 0.35, 1100);
  await actor.wait(500);
  await page.evaluate(() => window.scrollBy({ top: 380, behavior: 'smooth' }));
  await actor.wait(1500);
  await page.evaluate(() => window.scrollBy({ top: 420, behavior: 'smooth' }));
  await actor.wait(1600);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await actor.wait(1200);
  await click('[data-go="cabinet"]', { hover: 800, settle: 2400 });
  await actor.wait(2400);
  await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
  await actor.wait(1800);
  await click('#cabinet-grid .cabinet-card:first-child [data-vessel]', { hover: 800, settle: 2600 });
  await actor.wait(2600);
  await page.evaluate(() => window.scrollBy({ top: 260, behavior: 'smooth' }));
  await actor.wait(2200);
  await page.evaluate(() => window.scrollBy({ top: 320, behavior: 'smooth' }));
  await actor.wait(2400);
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
