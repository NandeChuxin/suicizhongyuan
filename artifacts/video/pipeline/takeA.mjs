import { openApp, Recorder, Actor, sleep, ROOT, FFMPEG } from './lib.mjs';
import { FRAG_PICK } from './picks.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const dir = path.join(ROOT, 'takes', 'A-main');
fs.rmSync(dir, { recursive: true, force: true });
const { browser, page, errors } = await openApp();
const rec = new Recorder(page, dir);
let actor;

const expectView = async (name, timeout = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(v => window.porcelain.view === v, name)) return true;
    await sleep(150);
  }
  return false;
};

async function snapOne(opts = {}) {
  const before = await page.evaluate(() => window.porcelain.fragments.filter(f => f.locked).length);
  const list = await page.evaluate(FRAG_PICK);
  list.sort((a, b) => a.cy - b.cy);
  const f = list[0];
  if (!f) return false;
  for (const pt of f.usable.slice(0, 4)) {
    await actor.moveTo(pt.x, pt.y, opts.hover ?? 560);
    await actor.wait(260);
    await actor.mouseDown();
    await actor.wait(70);
    await actor.mouseUp();
    await actor.wait(opts.settle ?? 760);
    const now = await page.evaluate(() => window.porcelain.fragments.filter(x => x.locked).length);
    if (now > before) return true;
  }
  await page.evaluate(() => {
    const p = window.porcelain;
    const f = p.fragments.find(x => !x.locked);
    if (f) { f.mesh.position.copy(f.correctPosition); p.bridge.confirm(f, { force: true }); }
  });
  await actor.wait(opts.settle ?? 760);
  return true;
}

async function workshopRound(round) {
  let done = false;
  for (let attempt = 0; attempt < 4 && !done; attempt++) {
    const ms = await page.evaluate(() => window.__workshopDebug?.() || []);
    if (!ms.length) { done = true; break; }
    const first = ms[0];
    for (const m of ms) {
      await actor.moveTo(m.x, m.y, 380);
      await actor.wait(200);
      await actor.mouseDown();
      await actor.wait(60);
      await actor.mouseUp();
      await actor.wait(round === 0 ? 720 : 620);
    }
    // 是否进入下一步
    done = await page.evaluate(() => {
      const step = document.querySelector('#work-steps i.on')?.textContent || '';
      return !/清创/.test(step) || Boolean(document.querySelector('#work-glaze-row') && !document.querySelector('#work-glaze-row').hidden);
    });
    if (!done) {
      // 有标记在背面：按住器身拖动，把它转过来
      const cv = await page.evaluate(() => {
        const c = [...document.querySelectorAll('canvas')].find(x => getComputedStyle(x).pointerEvents === 'auto');
        const r = c.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await actor.drag(cv.x + 120, cv.y, cv.x - 160, cv.y, 900);
    }
  }
  await actor.wait(600);
}

try {
  await sleep(7000);
  await rec.start();
  actor = new Actor(page, rec);
  actor.mark('start');

  // —— 启程 ——
  await actor.wait(1200);
  await actor.moveTo(760, 300, 1400);
  await actor.wait(400);
  await actor.moveTo(1240, 640, 1600);
  await actor.wait(600);
  await actor.clickSel('details.hero-culture summary', { hover: 700, settle: 600 });
  await actor.wait(2600);
  await actor.clickSel('details.hero-culture summary', { hover: 500, settle: 900 });
  await actor.wait(600);
  await actor.clickSel('[data-go="cabinet"]', { hover: 800, settle: 2200 });
  await expectView('cabinet');
  await actor.wait(2600);
  actor.mark('cabinet');

  // —— 档案柜 ——
  await actor.hoverSel('#cabinet-grid .cabinet-card:nth-child(5)', 900, 700);
  await actor.wait(700);
  await actor.hoverSel('#cabinet-grid .cabinet-card:nth-child(6)', 700, 500);
  await actor.wait(400);
  await actor.clickSel('#cabinet-grid .cabinet-card:first-child [data-vessel]', { hover: 900, settle: 2200 });
  await expectView('commission');
  await actor.wait(2400);
  actor.mark('commission');

  // —— 委托 ——
  await actor.hoverSel('.proto-card', 900, 1500);
  await actor.type('#name', '沈砚', 160);
  await actor.wait(700);
  await actor.clickSel('#knock-commission', { hover: 700, settle: 1500 });
  const cv = await page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].find(x => getComputedStyle(x).pointerEvents === 'auto');
    const r = c.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await actor.drag(cv.x + 60, cv.y - 60, cv.x - 240, cv.y - 40, 1400);
  await actor.wait(500);
  await actor.drag(cv.x - 160, cv.y, cv.x + 120, cv.y + 20, 1200);
  await actor.wait(700);
  await actor.clickSel('#accept-commission', { hover: 900, settle: 1800 });
  await expectView('puzzle');
  await actor.wait(7000);
  actor.mark('puzzle');

  // —— 拼合 ——
  await actor.moveTo(1200, 420, 900);
  await actor.wait(600);
  await actor.drag(1290, 400, 1010, 430, 1500);
  await actor.wait(700);
  await actor.drag(1010, 430, 1120, 420, 900);
  await actor.wait(500);
  await actor.wheel(960, 620, -120, 2, 260);
  await actor.wait(500);
  await actor.wheel(960, 620, 120, 2, 260);
  await actor.wait(600);
  await actor.clickSel('#pattern-ref', { hover: 800, settle: 2400 });
  await actor.wait(1600);
  await actor.clickSel('#close-drawer', { hover: 500, settle: 900 });
  await actor.wait(400);
  for (let i = 0; i < 6; i++) {
    await snapOne({ hover: i < 2 ? 700 : 460, settle: 820 });
    console.log('snap', i + 1, await page.evaluate(() => window.porcelain.fragments.filter(f => f.locked).length));
  }
  await actor.wait(900);
  await actor.clickSel('#scan-btn', { hover: 800, settle: 3200 });
  await actor.wait(900);
  await actor.clickSel('#scan-btn', { hover: 500, settle: 1200 });
  await actor.wait(500);
  for (let i = 0; i < 2; i++) {
    await snapOne({ hover: 700, settle: 900 });
    await actor.wait(500);
  }
  console.log('locked total', await page.evaluate(() => window.porcelain.fragments.filter(f => f.locked).length));
  await expectView('memory', 22000);
  await actor.wait(2600);
  actor.mark('memory');

  // —— 器物长卷 ——
  await actor.clickSel('#memory-next-page', { hover: 700, settle: 1500 });
  await actor.wait(500);
  await actor.clickSel('#memory-next-page', { hover: 500, settle: 1300 });
  await actor.wait(500);
  const dots = await page.$$('#memory-dots button');
  if (dots.length >= 8) {
    const b = await dots[7].boundingBox();
    await actor.click(b.x + b.width / 2, b.y + b.height / 2, { hover: 700, settle: 1900 });
  }
  await actor.wait(700);
  await actor.clickSel('#memory-next', { hover: 800, settle: 2200 });
  await expectView('choice');
  await actor.wait(2600);
  actor.mark('choice');

  // —— 修复抉择 ——
  await actor.hoverSel('.choice-option[data-mode="traditional"]', 900, 1600);
  await actor.hoverSel('.choice-option[data-mode="kintsugi"]', 800, 1700);
  await actor.clickSel('#knock-choice', { hover: 600, settle: 1700 });
  await actor.clickSel('.choice-option[data-mode="kintsugi"]', { hover: 800, settle: 2400 });
  await actor.wait(2000);
  actor.mark('workshop');

  // —— 修复工序 ——
  await workshopRound(0);
  await workshopRound(1);
  const gb = await page.$('#work-glaze');
  if (gb) {
    const b = await gb.boundingBox();
    await actor.moveTo(b.x + b.width / 2, b.y + b.height / 2, 700);
    await actor.wait(300);
    await page.mouse.down();
    await actor.wait(3900);
    await page.mouse.up();
  }
  await expectView('certificate', 20000);
  await actor.wait(3400);
  actor.mark('certificate');

  // —— 证书 ——
  await actor.type('#cert-note', '愿裂痕被看见，也被善待。', 110);
  await actor.wait(1200);
  await actor.clickSel('#download', { hover: 700, settle: 2800 });
  await actor.wait(1400);
  await actor.clickSel('#exhibit', { hover: 700, settle: 2400 });
  await actor.wait(2800);
  await actor.clickSel('#close-drawer', { hover: 400, settle: 800 });
  await actor.wait(300);
  await actor.clickSel('#archive-card', { hover: 600, settle: 2200 });
  await actor.wait(2600);
  await page.evaluate(() => { const el = document.querySelector('#drawer-body'); if (el) el.scrollTop = el.scrollHeight * 0.45; });
  await actor.wait(2200);
  await actor.clickSel('#close-drawer', { hover: 400, settle: 700 });
  await actor.wait(1400);
} catch (e) {
  console.log('TAKE ERROR', String(e).slice(0, 300));
} finally {
  const data = await rec.stop();
  console.log('frames', data.frames.length, 'duration', (data.frames.at(-1)?.t ?? 0) / 1000);
  console.log('marks', JSON.stringify(data.marks));
  const v = await rec.toVideo();
  execFileSync(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', v.listPath, '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', v.out], { stdio: 'ignore' });
  fs.rmSync(path.join(dir, 'frames'), { recursive: true, force: true });
  console.log('errors', errors.slice(0, 6));
  await browser.close();
}
