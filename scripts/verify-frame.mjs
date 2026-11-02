import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4500);

// ① 器灵全身可见性：画布非空（有像素）、容器不被视口裁切
const geo = await page.evaluate(() => {
  const el = document.querySelector('.guide-character');
  const c = document.querySelector('.gc-3d');
  const r = el.getBoundingClientRect();
  return {
    visible: !el.hidden && getComputedStyle(el).display !== 'none',
    canvasShown: c && c.style.display === 'block',
    inViewport: r.bottom <= window.innerHeight && r.top >= 0,
    bottom: Math.round(window.innerHeight - r.bottom), w: Math.round(r.width)
  };
});
await page.screenshot({ path: 'artifacts/frame-full.png', clip: { x: 640, y: 460, width: 640, height: 340 } });

// ② 稳定性：模拟 WebGL 上下文丢失 → 应回退剪影且角色仍可见
await page.evaluate(() => {
  const c = document.querySelector('.gc-3d');
  c.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
});
await page.waitForTimeout(600);
const fallback = await page.evaluate(() => {
  const ink = document.querySelector('.gc-ink');
  return { inkVisible: parseFloat(getComputedStyle(ink).opacity) > 0.5 };
});
await page.screenshot({ path: 'artifacts/frame-fallback.png', clip: { x: 640, y: 460, width: 640, height: 340 } });

// ③ 点击器灵仍能打开知识库
await page.click('.guide-character', { force: true });
await page.waitForTimeout(500);
const panelOpen = await page.evaluate(() => !document.getElementById('guide-panel').hidden);

console.log('取景:', JSON.stringify(geo));
console.log('上下文丢失回退:', JSON.stringify(fallback));
console.log(`点击开面板: ${panelOpen} | 页面错误: ${errs.length ? errs.join('||') : '无'}`);
console.log(geo.visible && geo.canvasShown && geo.inViewport && fallback.inkVisible && panelOpen && errs.length === 0 ? 'PASS: 全身入画 + 丢上下文自动回退' : 'CHECK: 见上');
await browser.close();
