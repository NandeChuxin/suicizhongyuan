import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.goto('https://porcelain-reunion.app.workbuddy.host/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3500);
await page.click('.guide-character', { force: true });
await page.waitForTimeout(600);

async function ask(q) {
  await page.fill('#gp-input', q);
  await page.click('#gp-send', { force: true });
  await page.waitForTimeout(1200);
  const cards = await page.$$('.gp-answer');
  const last = cards[cards.length - 1];
  return last;
}

// ① 什么是粉彩 → 行业条目 + 标签 + 来源
let c = await ask('什么是粉彩？');
const r1 = await c.evaluate(el => ({
  title: el.querySelector('.gp-title')?.textContent,
  chips: [...el.querySelectorAll('.gp-chip')].map(x => x.textContent),
  sources: el.querySelectorAll('.gp-sources a').length,
  related: [...el.querySelectorAll('[data-related-q]')].map(x => x.textContent)
}));

// ② 青花瓷发展 → 联想回展厅梅瓶
c = await ask('青花瓷是怎么发展的？');
const r2 = await c.evaluate(el => ({
  title: el.querySelector('.gp-title')?.textContent,
  related: [...el.querySelectorAll('[data-related-q]')].map(x => x.textContent)
}));

// ③ 天气 → 拒绝
c = await ask('明天北京的天气怎么样？');
const r3 = await c.evaluate(el => el.querySelector('.gp-text')?.textContent?.slice(0, 40));

console.log('①粉彩:', JSON.stringify(r1));
console.log('②青花发展:', JSON.stringify(r2));
console.log('③天气:', r3);
const pass = /粉彩/.test(r1.title) && r1.sources >= 1 && r2.related.length >= 1 && r3.includes('没有足够依据') && errs.length === 0;
console.log(pass ? 'PASS: 五项验收场景全部达成' : 'CHECK: 见上');
await page.screenshot({ path: 'artifacts/kb-live.png' });
await browser.close();
