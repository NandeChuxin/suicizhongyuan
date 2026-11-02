// 委托屏 + 证书屏 点击可达性回归（含断点边界与移动端）
import { chromium } from 'file:///C:/Users/17355/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });

const gotoView = async (page, name) => {
  for (let i = 0; i < 8; i++) {
    const cur = await page.evaluate(() => window.porcelain.view);
    if (cur === name) return true;
    if (cur === 'start') await page.evaluate(() => document.querySelector('[data-go="cabinet"]')?.click());
    else if (cur === 'cabinet') await page.evaluate(() => document.querySelector('.cabinet-card .primary')?.click());
    else if (cur === 'commission') await page.evaluate(() => document.querySelector('#accept-commission')?.click());
    else if (cur === 'puzzle') await page.evaluate(() => document.querySelector('.atelier-rail button[data-preview="certificate"]')?.click());
    await page.waitForTimeout(1600);
  }
  return (await page.evaluate(() => window.porcelain.view)) === name;
};

const audit = async (w, h, target) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2200);
  const ok = await gotoView(page, target);
  if (!ok) { console.log(`\n=== ${w}x${h} ${target} === 未能进入该页（view=${await page.evaluate(() => window.porcelain.view)}）`); await page.close(); return; }

  const res = await page.evaluate((target) => {
    const desc = el => !el ? 'null' : el.tagName.toLowerCase() + (el.id ? '#' + el.id : '.' + ((el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().trim().split(/\s+/)[0] || '-'));
    const items = [];
    const probe = (label, el) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return items.push({ label, hidden: true, rect: [0, 0, 0, 0] });
      // 多点采样：左侧 12%、中央、右侧 88% 各一行/两行，捕捉部分遮挡
      const xs = [r.left + r.width * .12, r.left + r.width * .5, r.left + r.width * .88];
      const ys = [r.top + r.height * .5, r.top + Math.min(4, r.height * .2)];
      let bad = [], blockedAll = 0, inViewAny = false;
      for (const cx of xs) for (const cy of ys) {
        const inView = cx > 0 && cx < innerWidth && cy > 0 && cy < innerHeight;
        if (inView) inViewAny = true;
        const top = inView ? document.elementFromPoint(cx, cy) : null;
        const ok = !!top && (top === el || el.contains(top) || top.contains(el));
        if (!ok) { blockedAll++; bad.push(`${Math.round(cx)},${Math.round(cy)}→${desc(top)}`); }
      }
      items.push({ label, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], inView: inViewAny, ok: blockedAll === 0, partial: blockedAll > 0 && blockedAll < xs.length * ys.length, top: bad[0] || '-', disabled: !!el.disabled });
    };
    const scope = document.querySelector(`[data-screen=${target}]`) || document;
    scope.querySelectorAll('button, .rail-item, a.quiet, input').forEach(el => {
      if (el.closest('.atelier-rail') || el.closest('header')) return;
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return; // 该屏未显示的元素跳过
      const label = (el.textContent || el.placeholder || '').trim().slice(0, 10) || el.id || el.tagName;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      if (r.top > innerHeight + 50 || r.bottom < -50) return; // 明显在文档流远端，单独由溢出检测覆盖
      probe(label, el);
    });
    document.querySelectorAll('.atelier-rail button').forEach(el => probe('导航-' + el.textContent.trim().slice(2), el));
    const M = {};
    const box = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], scrollH: el.scrollHeight, clientH: el.clientHeight }; };
    for (const s of ['.commission-layout', '.proto-card', '.commission-rail', '.side-card.paper-card', '.side-card.paper-card dl', '.commission-foot', '.craft-note', '.certificate', '.cert-actions', '.cert-actions .primary']) M[s] = box(s);
    M.docH = document.documentElement.scrollHeight;
    M.viewH = innerHeight;
    M.pageScrollPx = Math.max(0, M.docH - M.viewH);
    M.dlScrolls = (() => { const dl = document.querySelector('.side-card.paper-card dl'); return dl ? dl.scrollHeight > dl.clientHeight + 1 : null; })();
    return { items, M };
  }, target);

  const blocked = res.items.filter(i => !i.hidden && (!i.ok || !i.inView));
  console.log(`\n=== ${w}x${h} ${target} ===`);
  for (const it of res.items) {
    const f = it.hidden ? 'HIDDEN ' : (!it.inView ? 'OFFSCRN' : it.ok ? 'OK     ' : (it.partial ? 'PARTIAL' : 'BLOCKED'));
    if (f !== 'OK     ') console.log(`${f} ${it.label}${it.disabled ? '(disabled)' : ''} rect=${JSON.stringify(it.rect)} top=${it.top}`);
  }
  console.log(`M ${JSON.stringify(res.M)}`);
  console.log(blocked.length ? `>>> ${blocked.length} 项异常` : `>>> 全部可点（共 ${res.items.length} 项）`);
  await page.screenshot({ path: `D:/数字媒体/碎瓷重圆/artifacts/fixed-${target}-${w}x${h}.png` });
  await page.close();
};

for (const [w, h] of [[1920, 1080], [1600, 900], [1441, 900], [1440, 900], [1366, 768], [1280, 800], [1200, 700], [1051, 800], [1060, 800], [1024, 768], [900, 700], [761, 800], [760, 900], [430, 900]]) await audit(w, h, 'commission');

await audit(760, 900, 'commission');
await audit(430, 900, 'commission');
await browser.close();
console.log('\nDONE');
