import { openApp, Recorder, Actor, sleep, settle, ROOT, FFMPEG } from './lib.mjs';
import { SEED } from './picks.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const dir = path.join(ROOT, 'takes', 'C-exhibit');
fs.rmSync(dir, { recursive: true, force: true });
const { browser, page, errors } = await openApp({ seed: SEED.oneDone() });
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
const clickAt = async (p, opts = {}) => { if (!p) return false; await actor.click(p.x, p.y, opts); return true; };
const click = async (sel, opts = {}, n = 0) => { const p = await pos(sel, n); if (!p) { log('missing', sel, n); return false; } await actor.click(p.x, p.y, opts); return true; };

try {
  await sleep(4000);
  await page.evaluate(() => window.porcelain.go('exhibit'));
  await sleep(12000);
  await settle(page);
  await rec.start();
  actor = new Actor(page, rec);
  actor.mark('exhibit');
  await actor.wait(1400);
  await actor.moveTo(900, 520, 1300);
  await actor.wait(500);
  await actor.hoverSel('.exhibit-placard', 800, 1200);
  await click('#exhibit-rail button', { hover: 900, settle: 2600 }, 2);
  await actor.wait(2400);
  await actor.moveTo(760, 560, 900);
  await actor.wait(600);
  const hs = await page.$$('.hotspot-btn');
  log('hotspots', hs.length);
  await click('.hotspot-btn', { hover: 900, settle: 3200 }, 0);
  await actor.wait(2200);
  // 展开来源
  await click('.gp-sources summary', { hover: 800, settle: 2000 }, 0);
  await actor.wait(1600);
  await page.evaluate(() => { const el = document.querySelector('.gp-scroll'); if (el) el.scrollTop = el.scrollHeight * 0.35; });
  await actor.wait(2200);
  // 相关追问
  await click('.gp-reco', { hover: 800, settle: 3000 }, 0);
  await actor.wait(2600);
  await page.evaluate(() => { const el = document.querySelector('.gp-scroll'); if (el) el.scrollTop = el.scrollHeight; });
  await actor.wait(2400);
  // 关闭面板，回到展厅，开启自动导览
  await page.evaluate(() => { const b = document.querySelector('#gp-close'); if (b) b.click(); });
  await actor.wait(1500);
  await click('#tour-start', { hover: 800, settle: 2600 });
  await actor.wait(2600);
  await click('#tour-toggle', { hover: 700, settle: 1800 });
  await actor.wait(1800);
  await click('#tour-toggle', { hover: 500, settle: 1800 });
  await actor.wait(2200);
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
