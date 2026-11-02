import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => !!window.porcelain, { timeout: 30000 }).catch(() => { });
await page.waitForTimeout(2300);
await page.evaluate(() => window.porcelain.openVessel(window.porcelain.VESSELS[0]));
await page.evaluate(() => window.porcelain.go('puzzle'));
await page.waitForTimeout(3600);
await page.screenshot({ path: 'artifacts/final-puzzle-0.png' });
for (let n = 0; n < 20; n++) {
  const done = await page.evaluate(() => {
    const p = window.porcelain, b = p.bridge, f = p.fragments.find(x => !x.locked);
    if (!f) return true;
    f.mesh.position.copy(f.correctPosition);
    if (f.correctQuaternion) f.mesh.quaternion.copy(f.correctQuaternion);
    b.confirm?.(f, { force: true });
    return false;
  });
  await page.waitForTimeout(450);
  if (done) break;
}
await page.waitForTimeout(1500);
await page.screenshot({ path: 'artifacts/final-puzzle-8-during.png' });
await page.waitForTimeout(9000);
await page.keyboard.press('Escape');
await page.waitForTimeout(4500);
await page.screenshot({ path: 'artifacts/final-puzzle-8.png' });
await browser.close();
console.log('done');
