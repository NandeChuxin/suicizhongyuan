// 真实鼠标点击回归：覆盖各屏关键交互（所有点击都用渲染坐标真实点击）
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });

const center = (p, sel) => p.evaluate(s => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
const st = p => p.evaluate(() => ({
  view: window.porcelain.view, repaired: window.porcelain.repaired,
  notice: document.getElementById('notice')?.textContent?.slice(0, 24) || '',
  craft: !!document.querySelector('.craft-note')?.open,
  memory: !document.querySelector('[data-screen="memory"]')?.hidden,
  certFocus: document.body.classList.contains('cert-focus'),
  timelineLit: document.querySelectorAll('.memory-timeline li.lit').length
}));
const clickAt = async (p, sel, tag, log, offset = [0, 0]) => {
  const c = await center(p, sel);
  if (!c) { log.push(`${tag}: 元素缺失`); return false; }
  await p.mouse.click(c[0] + offset[0], c[1] + offset[1]);
  await p.waitForTimeout(900);
  return true;
};

const run = async (w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2400);
  const log = [];

  // 启程屏：开始修复（hero-card 内按钮，同属视差层）
  await page.mouse.click(...await center(page, '[data-go="cabinet"]'));
  await page.waitForTimeout(1600);
  log.push(`启程→档案柜: ${(await st(page)).view}`);

  // 档案柜：接受委托
  await page.mouse.click(...await center(page, '.cabinet-card .primary'));
  await page.waitForTimeout(1800);
  log.push(`档案柜→委托: ${(await st(page)).view}`);

  // 委托屏：轻叩瓷身 / 工艺注解 / 六器轨道 / 接受委托
  await clickAt(page, '#knock-commission', '轻叩瓷身', log);
  log.push(`  轻叩 notice="${(await st(page)).notice}"`);
  await clickAt(page, '.craft-note summary', '工艺注解展开', log);
  log.push(`  展开=${(await st(page)).craft}`);
  await clickAt(page, '.craft-note summary', '工艺注解收起', log);
  await page.mouse.click(...await center(page, '#commission-rail .rail-item:nth-child(1)'));
  await page.waitForTimeout(1100);
  log.push(`  六器轨道(第1件)点击后仍为委托屏: ${(await st(page)).view}`);
  // 左侧常驻导航「重圆」
  const rail = await page.evaluate(() => { const b = [...document.querySelectorAll('.atelier-rail button')].find(x => x.textContent.includes('重圆')); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  if (rail) { await page.mouse.click(...rail); await page.waitForTimeout(1500); log.push(`导航「重圆」: ${(await st(page)).view}`); }
  await page.mouse.click(...await center(page, '[data-preview="commission"]'));
  await page.waitForTimeout(1500);
  // 接受委托（真实点击，含左上角内侧点）
  await page.mouse.click(...await center(page, '#accept-commission'));
  await page.waitForTimeout(1800);
  log.push(`委托→拼合: ${(await st(page)).view}`);

  // 拼合屏：翻阅碎片记忆 / 提示位置 / 重新散落（puzzle-panel 内按钮，同属视差层）
  await clickAt(page, '#read-memory', '翻阅碎片记忆', log);
  log.push(`  记忆屏=${(await st(page)).memory}`);
  await page.mouse.click(...await center(page, '#memory-close'));
  await page.waitForTimeout(1500);
  log.push(`  关闭记忆→${(await st(page)).view}`);
  await clickAt(page, '#locate', '提示位置', log);
  log.push(`  notice="${(await st(page)).notice}"`);
  await clickAt(page, '#reset', '重新散落', log);
  log.push(`  repaired=${(await st(page)).repaired}`);

  // 证书屏（经导航直达）：下载按钮真实点击
  const certNav = await page.evaluate(() => { const b = [...document.querySelectorAll('.atelier-rail button')].find(x => x.textContent.includes('重圆')); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.click(...certNav);
  await page.waitForTimeout(1600);
  log.push(`到证书屏: ${(await st(page)).view}`);
  await clickAt(page, '#archive-card', '我读懂的器物档案', log);
  const drawerOpen = await page.evaluate(() => !document.getElementById('knowledge-drawer')?.hidden);
  log.push(`  档案抽屉打开=${drawerOpen}`);
  await page.mouse.click(...await center(page, '#close-drawer'));
  await page.waitForTimeout(600);

  console.log(`\n=== ${w}x${h} ===`);
  for (const l of log) console.log(' ', l);
  await page.screenshot({ path: `D:/数字媒体/碎瓷重圆/artifacts/realclick2-${w}x${h}.png` });
  await page.close();
};

await run(1280, 800);
await run(1366, 768);
await run(1051, 800);
await run(1024, 768);
await browser.close();
console.log('\nDONE');
