import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let errs = 0;
page.on('pageerror', e => { errs++; console.log('[pageerror]', String(e).slice(0, 200)); });
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => !!window.porcelain, { timeout: 30000 });
await page.waitForTimeout(2600);
await page.screenshot({ path: 'artifacts/final2-start.png' });
await page.evaluate(() => window.porcelain.openVessel(window.porcelain.VESSELS[0]));
await page.evaluate(() => window.porcelain.go('puzzle'));
await page.waitForTimeout(3600);
await page.screenshot({ path: 'artifacts/final2-puzzle0.png' });
// 全部归位
for (let n = 0; n < 20; n++) {
  const done = await page.evaluate(() => {
    const p = window.porcelain, b = p.bridge, f = p.fragments.find(x => !x.locked);
    if (!f) return true;
    f.mesh.position.copy(f.correctPosition);
    if (f.correctQuaternion) f.mesh.quaternion.copy(f.correctQuaternion);
    b.confirm?.(f, { force: true });
    return false;
  });
  await page.waitForTimeout(420);
  if (done) break;
}
await page.waitForTimeout(1500);
await page.screenshot({ path: 'artifacts/final2-puzzle8-mid.png' });
await page.waitForTimeout(9000);
await page.keyboard.press('Escape');
await page.waitForTimeout(4200);
await page.screenshot({ path: 'artifacts/final2-puzzle8-done.png' });
// 记忆 → 抉择 → 证书 → 展厅
await page.evaluate(() => window.porcelain.go('memory'));
await page.waitForTimeout(1600);
await page.evaluate(() => window.porcelain.go('choice'));
await page.waitForTimeout(2400);
await page.screenshot({ path: 'artifacts/final2-choice.png' });
await page.evaluate(() => window.porcelain.go('certificate'));
await page.waitForTimeout(3000);
await page.screenshot({ path: 'artifacts/final2-certificate.png' });
await page.evaluate(() => window.porcelain.go('exhibit'));
await page.waitForTimeout(2600);
await page.screenshot({ path: 'artifacts/final2-exhibit.png' });
console.log('pageerrors:', errs);
await browser.close();
