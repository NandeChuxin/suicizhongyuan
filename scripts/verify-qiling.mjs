import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// 器物上下文提问 → 应回落/加载 3D 阿圆
await page.evaluate(() => { document.querySelector('.atelier-rail [data-preview="exhibit"]')?.click(); });
await page.waitForTimeout(2000);
await page.click('#guide-fab', { force: true });
await page.waitForTimeout(400);
await page.fill('#gp-input', '这件器物为什么采用这种器型？');
await page.click('#gp-send', { force: true });
await page.waitForTimeout(1200);
const label1 = await page.textContent('.gc-label');
await page.waitForTimeout(4000); // 等模型加载
const has3d = await page.evaluate(() => !!document.querySelector('.gc-3d'));
const charVisible = await page.evaluate(() => {
  const el = document.querySelector('.guide-character');
  return !el.hidden && getComputedStyle(el).display !== 'none';
});
await page.screenshot({ path: 'artifacts/qiling-3d.png' });

// 工艺问题 → 应切回阿墨（2D 剪影）
await page.fill('#gp-input', '锔瓷和金缮有什么不同？');
await page.click('#gp-send', { force: true });
await page.waitForTimeout(1500);
const label2 = await page.textContent('.gc-label');
const inkVisible = await page.evaluate(() => { const i = document.querySelector('.gc-ink'); return i && getComputedStyle(i).opacity !== '0'; });
await page.screenshot({ path: 'artifacts/amo-2d.png' });

// 播放讲解 → 触发器灵音色路由（无语音服务的 headless 下走字幕，但状态机应正常）
await page.click('.gp-answer .gp-play', { force: true }).catch(() => {});
await page.waitForTimeout(800);
const lineShown = await page.evaluate(() => document.querySelector('.gc-line')?.textContent?.length || 0);

console.log(`器物提问 → 角色标签: ${label1} | 3D画布: ${has3d} | 角色可见: ${charVisible}`);
console.log(`工艺提问 → 角色标签: ${label2} | 剪影可见: ${inkVisible}`);
console.log(`播放讲解 → 字幕行字数: ${lineShown}`);
console.log(`页面错误: ${errs.length ? errs.join(' || ') : '无'}`);
const pass = /阿圆/.test(label1) && /阿墨/.test(label2) && charVisible && errs.length === 0;
console.log(pass ? 'PASS: 双角色切换 + 3D 形象接入正常' : 'CHECK: 见上');
await browser.close();
