// 无语音服务回退验证：字幕仍正常、音色置灰、语速作用于字幕滚动；移动端布局
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });

const openAndPlay = async (page) => {
  await page.evaluate(() => document.querySelector('#guide-entry')?.click());
  await page.waitForTimeout(700);
  const reco = await page.evaluate(() => { const b = document.querySelector('#gp-recos .gp-reco'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  if (reco) { await page.mouse.click(reco[0], reco[1]); await page.waitForTimeout(1600); }
  const play = await page.evaluate(() => { const b = document.querySelector('.gp-play'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  if (play) { await page.mouse.click(play[0], play[1]); await page.waitForTimeout(500); }
  return !!play;
};
const click = async (page, sel) => { const p = await page.evaluate(s => { const b = document.querySelector(s); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel); if (p) { await page.mouse.click(p[0], p[1]); await page.waitForTimeout(350); } return !!p; };
// 在 2s 内字幕推进了几段（衡量字幕滚动速率）
const advance = async (page, ms = 2000) => {
  const idx = () => page.evaluate(() => { const m = document.querySelector('.guide-sub .gs-meta')?.textContent || ''; const n = m.match(/(\d+)\s*\/\s*(\d+)/); return n ? Number(n[1]) : -1; });
  const a = await idx();
  await page.waitForTimeout(ms);
  const b = await idx();
  return { from: a, to: b, advanced: b - a };
};

// ① 无语音服务（删除 speechSynthesis）
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    try { delete window.speechSynthesis; } catch {}
    try { window.speechSynthesis = undefined; } catch {}
    try { delete window.SpeechSynthesisUtterance; } catch {}
    try { window.SpeechSynthesisUtterance = undefined; } catch {}
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2400);
  console.log('语音服务可用:', await page.evaluate(() => !!window.speechSynthesis));
  const ok = await openAndPlay(page);
  const st = await page.evaluate(() => ({
    toneDisabled: [...document.querySelectorAll('[data-tone]')].every(b => b.disabled),
    toneTitle: document.querySelector('[data-tone]')?.title || '',
    voiceBtn: document.querySelector('#gp-voice-toggle')?.textContent,
    subHidden: document.querySelector('.guide-sub')?.hidden,
    lines: [...document.querySelectorAll('.guide-sub .gs-l')].map(n => n.textContent),
    fs: getComputedStyle(document.querySelector('.guide-sub .gs-text')).fontSize
  }));
  console.log('① 回退：播放按钮=', ok, JSON.stringify(st));
  // 语速作用于字幕滚动：0.8× 与 1.2× 各测 2s 推进段数
  // 精确口径：字幕推进速率 = 档案 cps × 语速档 × 音色速率（与 utterance.rate 同一系数）
  const cpsAt = async rate => {
    await click(page, '[data-rate="' + rate + '"]');
    return page.evaluate(() => ({ rate: window.porcelain.guideVoice.rate, cps: +window.porcelain.guideVoice.cps().toFixed(3) }));
  };
  const c8 = await cpsAt('0.8');
  const c12 = await cpsAt('1.2');
  console.log(`② 字幕推进速率 0.8×=${c8.cps}/s  1.2×=${c12.cps}/s  比值=${(c12.cps / c8.cps).toFixed(3)}（应=1.5）  rate 字段=${c8.rate}/${c12.rate}`);
  // 同起点计时（粗粒度佐证）：重新播放，计时到第 3 段
  const timeToSeg3 = async (rate) => {
    await click(page, '[data-rate="' + rate + '"]');
    const stopBtn = await page.$('.gp-stopplay:not([hidden])');
    if (stopBtn) { await stopBtn.click(); await page.waitForTimeout(300); }
    const play2 = await page.$('.gp-play:not([hidden])');
    if (play2) { await play2.click(); }
    const t0 = Date.now();
    for (let i = 0; i < 60; i++) {
      const idx = await page.evaluate(() => { const m = document.querySelector('.guide-sub .gs-meta')?.textContent || ''; const n = m.match(/(\d+)\s*\/\s*(\d+)/); return n ? Number(n[1]) : -1; });
      if (idx >= 3) break;
      await page.waitForTimeout(100);
    }
    return Date.now() - t0;
  };
  const tSlow = await timeToSeg3('0.8');
  const tFast = await timeToSeg3('1.2');
  console.log(`② 到第 3 段耗时 0.8×=${tSlow}ms  1.2×=${tFast}ms  比值=${(tSlow / Math.max(1, tFast)).toFixed(2)}（应≈1.5）`);
  await page.screenshot({ path: 'D:/数字媒体/碎瓷重圆/artifacts/guide-fallback.png' });
  await ctx.close();
}

// ③ 移动端布局：设置条换行 + 字幕条位置
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 160)));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2400);
  await openAndPlay(page);
  const r = await page.evaluate(() => {
    const sub = document.querySelector('.guide-sub');
    const panel = document.querySelector('.guide-panel');
    const strip = document.querySelector('.gp-voice');
    const b = n => { if (!n) return null; const x = n.getBoundingClientRect(); return [Math.round(x.left), Math.round(x.top), Math.round(x.right), Math.round(x.bottom)]; };
    return { sub: b(sub), subPos: sub?.dataset.pos, subH: sub ? Math.round(sub.getBoundingClientRect().height) : null, panel: b(panel), strip: b(strip), stripH: strip ? Math.round(strip.getBoundingClientRect().height) : null, overflowX: document.documentElement.scrollWidth > innerWidth };
  });
  console.log('③ 移动端:', JSON.stringify(r));
  await page.screenshot({ path: 'D:/数字媒体/碎瓷重圆/artifacts/guide-mobile.png' });
  await page.close();
}
await browser.close();
console.log('DONE');
