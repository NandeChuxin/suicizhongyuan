// 录制工具库：Chromium(Edge) + CDP screencast 抓帧 + 真实指针操作 + 章节标记
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = 'D:\\数字媒体\\_videotools';
export const FFMPEG = 'C:\\Users\\17355\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe';
export const FFPROBE = 'C:\\Users\\17355\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffprobe.exe';
export const BASE = process.env.BASE || 'http://127.0.0.1:5173/';
export const W = 1920, H = 1080;

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function openApp({ seed = null, width = W, height = H } = {}) {
  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars',
      '--force-color-profile=srgb', '--mute-audio', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1,
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
  });
  if (seed) {
    await context.addInitScript((payload) => {
      try {
        for (const [k, v] of Object.entries(payload)) localStorage.setItem(k, v);
      } catch (e) { /* noop */ }
    }, seed);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !!window.porcelain, { timeout: 90000 });
  await page.waitForFunction(() => window.porcelain.fragments.length > 0 || window.porcelain.view !== 'start', { timeout: 30000 }).catch(() => {});
  return { browser, context, page, errors, width, height };
}

// —— 录制器：抓帧 + 指针日志 ——
export class Recorder {
  constructor(page, outDir, opts = {}) {
    this.page = page;
    this.dir = outDir;
    this.w = opts.width || W;
    this.h = opts.height || H;
    this.frames = [];
    this.pointer = [];
    this.marks = [];
    this.pending = [];
    this.index = 0;
    this.recording = false;
  }
  async start() {
    fs.mkdirSync(path.join(this.dir, 'frames'), { recursive: true });
    const cdp = await this.page.context().newCDPSession(this.page);
    this.cdp = cdp;
    this.buffers = [];
    this.bytes = 0;
    cdp.on('Page.screencastFrame', (ev) => {
      cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
      if (!this.recording) return;
      const buf = Buffer.from(ev.data, 'base64');
      this.buffers.push({ t: Date.now(), data: buf });
      this.bytes += buf.length;
      if (this.bytes > 3.2e9) this.flushSoon();   // 内存兜底
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: this.w, maxHeight: this.h, everyNthFrame: 1 });
    this.recording = true;
  }
  async flushSoon() {
    this.flushing = true;
    const batch = this.buffers.splice(0, 2000);
    this.bytes = this.buffers.reduce((a, b) => a + b.data.length, 0);
    const tasks = [];
    for (const f of batch) {
      const file = `frames/${String(this.frames.length).padStart(6, '0')}.jpg`;
      this.frames.push({ t: f.t, file });
      tasks.push(fs.promises.writeFile(path.join(this.dir, file), f.data).catch(() => {}));
    }
    await Promise.all(tasks);
    this.flushing = false;
  }
  mark(label) { this.marks.push({ t: Date.now(), label }); return this; }
  logPointer(x, y, type = 'move') { this.pointer.push({ t: Date.now(), x: Math.round(x), y: Math.round(y), type }); }
  async stop() {
    await this.cdp.send('Page.stopScreencast');
    this.recording = false;
    while (this.buffers.length) await this.flushSoon();
    await Promise.all(this.pending);
    const t0 = this.frames.length ? this.frames[0].t : 0;
    const data = {
      t0,
      frames: this.frames.map(f => ({ t: +(f.t - t0).toFixed(4), file: f.file })),
      pointer: this.pointer.map(p => ({ ...p, t: +(p.t - t0).toFixed(4) })),
      marks: this.marks.map(m => ({ label: m.label, t: +(m.t - t0).toFixed(4) })),
    };
    fs.writeFileSync(path.join(this.dir, 'timing.json'), JSON.stringify(data));
    return data;
  }
  async toVideo(fps = 30) {
    // JPEG 序列 + 变帧时长 → CFR 视频（帧时间对齐真实时间）
    const timing = JSON.parse(fs.readFileSync(path.join(this.dir, 'timing.json'), 'utf8'));
    const fr = timing.frames;
    const lines = [];
    for (let i = 0; i < fr.length; i++) {
      const next = i + 1 < fr.length ? fr[i + 1].t : fr[i].t + 500;
      const dur = Math.max(0.001, (next - fr[i].t) / 1000);
      lines.push(`file '${fr[i].file}'`, `duration ${dur.toFixed(5)}`);
    }
    lines.push(`file '${fr[fr.length - 1].file}'`);
    const listPath = path.join(this.dir, 'concat.txt');
    fs.writeFileSync(listPath, lines.join('\n'));
    const out = path.join(this.dir, 'take.mp4');
    return { listPath, out, lastT: fr[fr.length - 1].t };
  }
}

// —— 操作器：真实指针 + 记录 ——
export class Actor {
  constructor(page, rec) { this.page = page; this.rec = rec; }
  log(x, y, type) { this.rec?.logPointer(x, y, type); }
  async wait(ms) { await sleep(ms); }
  async waitFor(fn, timeout = 30000, arg) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await this.page.evaluate(fn, arg).catch(() => false)) return true;
      await sleep(100);
    }
    return false;
  }
  async moveTo(x, y, ms = 700) {
    const steps = Math.max(2, Math.round(ms / 16));
    const from = this.last || { x: x - 120, y: y - 60 };
    for (let i = 1; i <= steps; i++) {
      const p = i / steps;
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
      const nx = from.x + (x - from.x) * e + Math.sin(i * 0.7) * 1.2;
      const ny = from.y + (y - from.y) * e + Math.cos(i * 0.9) * 1.0;
      await this.page.mouse.move(nx, ny);
      this.log(nx, ny);
      await sleep(ms / steps);
    }
    this.last = { x, y };
    this.log(x, y);
  }
  async click(x, y, { hover = 500, settle = 400 } = {}) {
    await this.moveTo(x, y, hover);
    await sleep(220);
    this.log(x, y, 'press');
    await this.page.mouse.down();
    await sleep(70);
    this.log(x, y, 'release');
    await this.page.mouse.up();
    await sleep(settle);
  }
  async box(selector) {
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      const el = await this.page.$(selector);
      if (el) {
        const b = await el.boundingBox();
        if (b && b.width > 1 && b.height > 1) return b;
      }
      await sleep(120);
    }
    throw new Error('no box: ' + selector);
  }
  async clickSel(selector, opts = {}) {
    const b = await this.box(selector);
    const x = b.x + b.width / 2 + (opts.dx || 0);
    const y = b.y + b.height / 2 + (opts.dy || 0);
    await this.click(x, y, opts);
    return { x, y };
  }
  async hoverSel(selector, ms = 600, settle = 300) {
    const b = await this.box(selector);
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await this.moveTo(x, y, ms);
    await sleep(settle);
    return { x, y };
  }
  async type(selector, text, delay = 130) {
    await this.clickSel(selector, { hover: 400, settle: 200 });
    for (const ch of text) {
      await this.page.keyboard.type(ch);
      await sleep(delay);
    }
    await sleep(250);
  }
  async drag(x1, y1, x2, y2, ms = 900) {
    await this.moveTo(x1, y1, 350);
    this.log(x1, y1, 'press');
    await this.page.mouse.down();
    const steps = Math.max(4, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const p = i / steps;
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const x = x1 + (x2 - x1) * e, y = y1 + (y2 - y1) * e;
      await this.page.mouse.move(x, y);
      this.log(x, y, 'drag');
      await sleep(ms / steps);
    }
    this.log(x2, y2, 'release');
    await this.page.mouse.up();
    await sleep(300);
  }
  async wheel(x, y, delta, times = 1, gap = 180) {
    await this.moveTo(x, y, 400);
    for (let i = 0; i < times; i++) { await this.page.mouse.wheel(0, delta); await sleep(gap); }
  }
  async mouseDown() { this.log(this.last?.x ?? 0, this.last?.y ?? 0, 'press'); await this.page.mouse.down(); }
  async mouseUp() { this.log(this.last?.x ?? 0, this.last?.y ?? 0, 'release'); await this.page.mouse.up(); await sleep(120); }
  async press(key) { await this.page.keyboard.press(key); await sleep(300); }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  mark(label) { this.rec?.mark(label); }
}

export { sleep };

// 等待页面主线程空闲（连续多次快速往返 CDP），避免在着色器编译/模型解析的卡顿期开始录制
export async function settle(page, { quiet = 8, gap = 150, maxWait = 180000 } = {}) {
  let fast = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < maxWait) {
    const a = Date.now();
    try { await page.evaluate(() => 1); } catch { /* ignore */ }
    const dt = Date.now() - a;
    if (dt < 45) fast++; else fast = 0;
    if (fast >= quiet) return true;
    await sleep(gap);
  }
  return false;
}
