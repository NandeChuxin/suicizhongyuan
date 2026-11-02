// 观感修复批处理：字号变量体系 + 定点替换（每条断言命中，防止静默漏改）
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'D:/数字媒体/碎瓷重圆/src/';
let failures = [];

function patch(file, pairs, { expect = 1 } = {}) {
  const path = ROOT + file;
  let css = readFileSync(path, 'utf8');
  for (const [oldStr, newStr, count = expect] of pairs) {
    const n = css.split(oldStr).length - 1;
    if (n !== count) { failures.push(`${file}: "${oldStr.slice(0, 60)}" 命中 ${n} 次（期望 ${count}）`); continue; }
    css = css.split(oldStr).join(newStr);
  }
  writeFileSync(path, css);
}

// ---------- immersive.css ----------
patch('immersive.css', [
  // :root 字号变量
  [':root{--blue:#2c4a7c;--paper:#faf8f3;--clay:#f5f2ea;--gold:#c9a961;--ink:#1a2332;',
   ':root{--blue:#2c4a7c;--paper:#faf8f3;--clay:#f5f2ea;--gold:#c9a961;--ink:#1a2332;--fs-min:11px;--fs-small:12px;--fs-body:14px;--fs-scene:clamp(13px,.95vw,16px);--fs-body-fluid:clamp(14px,.95vw,17px);'],
  // 基础小字
  ['.tiny{font:10px/1.7 Arial,sans-serif', '.tiny{font:var(--fs-min)/1.7 Arial,sans-serif'],
  ['.brand small{display:block;font:8px/2 Arial,sans-serif', '.brand small{display:block;font:var(--fs-min)/2 Arial,sans-serif'],
  ['.overline{font:9px/1.8 Arial,sans-serif', '.overline{font:var(--fs-min)/1.8 Arial,sans-serif'],
  ['.footer-note{font:8px Arial,sans-serif', '.footer-note{font:var(--fs-min) Arial,sans-serif'],
  ['.page-num{font:10px Arial,sans-serif', '.page-num{font:var(--fs-min) Arial,sans-serif'],
  ['.small-note{font-size:10px;line-height:1.9;color:#8493a5}', '.small-note{font-size:var(--fs-small);line-height:1.9;color:#8493a5}'],
  ['.muted{font-size:13px;line-height:2.3;color:#b9c2cd}', '.muted{font-size:var(--fs-body-fluid);line-height:2.2;color:#b9c2cd}'],
  ['dt{color:#8495aa;font-size:10px;letter-spacing:2px;margin-top:18px}', 'dt{color:#8495aa;font-size:var(--fs-small);letter-spacing:2px;margin-top:18px}'],
  ['.card-foot{margin-top:20px;font-size:10px;', '.card-foot{margin-top:20px;font-size:var(--fs-small);'],
  ['.hero-en{position:absolute;left:8%;bottom:12%;font:10px/2.1 Arial,sans-serif', '.hero-en{position:absolute;left:8%;bottom:12%;font:var(--fs-min)/2.1 Arial,sans-serif'],
  ['.steps button span{font:9px Arial,sans-serif', '.steps button span{font:var(--fs-min) Arial,sans-serif'],
  // 器物名标注：提字号 + 深色背板交给文末 v4 段（此处只提字号）
  ['.vessel-caption{position:absolute;left:50%;bottom:5%;transform:translateX(-50%);text-align:center;font-size:11px;', '.vessel-caption{position:absolute;left:50%;bottom:5%;transform:translateX(-50%);text-align:center;font-size:clamp(12px,.9vw,15px);'],
  ['.vessel-caption small{display:block;font:8px Arial,sans-serif', '.vessel-caption small{display:block;font:var(--fs-min) Arial,sans-serif'],
  // 标题 clamp
  ['h2{font-weight:400;font-size:30px;line-height:1.6;', 'h2{font-weight:400;font-size:clamp(26px,2.4vw,34px);line-height:1.6;'],
  ['.screen-title h2{margin:0;font-size:34px}', '.screen-title h2{margin:0;font-size:clamp(28px,2.6vw,38px)}'],
  ['.exhibit-placard h2{font-size:26px}', '.exhibit-placard h2{font-size:clamp(24px,1.9vw,30px)}'],
  ['.achievement-card h2{font-weight:400;font-size:30px;', '.achievement-card h2{font-weight:400;font-size:clamp(26px,2.4vw,34px);'],
  ['.tour-note h2{margin:8px 0 10px;font-weight:400;font-size:22px;', '.tour-note h2{margin:8px 0 10px;font-weight:400;font-size:clamp(20px,1.6vw,26px);'],
  // 考察屏
  ['.tour-title .muted{font-size:11px;color:#9fb0c0}', '.tour-title .muted{font-size:var(--fs-scene);color:#9fb0c0}'],
  ['.tour-chip{display:flex;flex-direction:column;align-items:flex-start;gap:2px;background:#0e1727cc;border:1px solid #faf8f31f;border-radius:3px;padding:8px 12px;color:#c6d2dd;font:inherit;font-size:12px;', '.tour-chip{display:flex;flex-direction:column;align-items:flex-start;gap:2px;background:#0e1727cc;border:1px solid #faf8f31f;border-radius:3px;padding:8px 12px;color:#c6d2dd;font:inherit;font-size:var(--fs-small);'],
  ['.tour-chip small{font-size:9px;', '.tour-chip small{font-size:var(--fs-min);'],
  ['.tour-hint{position:absolute;left:6%;bottom:20px;z-index:4;color:#8fa0b2;font-size:10px;', '.tour-hint{position:absolute;left:6%;bottom:20px;z-index:6;color:#8fa0b2;font-size:var(--fs-small);'],
  ['.fw-label{flex:0 0 30px;font-size:10px;', '.fw-label{flex:0 0 34px;font-size:var(--fs-small);'],
  ['.fw-btn{background:#141f31;border:1px solid #faf8f31f;border-radius:3px;padding:3px 9px;color:#c6d2dd;font:inherit;font-size:10px;', '.fw-btn{background:#141f31;border:1px solid #faf8f31f;border-radius:3px;padding:3px 9px;color:#c6d2dd;font:inherit;font-size:var(--fs-small);'],
  ['.fw-source{margin:8px 0 0;font-size:10px;', '.fw-source{margin:8px 0 0;font-size:var(--fs-scene);'],
  ['.fw-stats{margin:4px 0 0;font-size:10px;', '.fw-stats{margin:4px 0 0;font-size:var(--fs-small);'],
  ['.tour-note-text{color:#c9d4de;font-size:13px;line-height:2;margin:6px 0}', '.tour-note-text{color:#c9d4de;font-size:var(--fs-scene);line-height:2;margin:6px 0}'],
  ['.tour-note .small-note{color:#8fa0b2;font-size:10px;margin:4px 0 10px}', '.tour-note .small-note{color:#8fa0b2;font-size:var(--fs-small);margin:4px 0 10px}'],
  // 控制台与标题错位：下移
  ['.tour-console{position:absolute;left:6%;top:112px;', '.tour-console{position:absolute;left:6%;top:136px;'],
  // 档案柜 / 委托
  ['.cabinet-card .card-tags span{border:1px solid #faf8f322;padding:2px 8px;font-size:10px;', '.cabinet-card .card-tags span{border:1px solid #faf8f322;padding:2px 8px;font-size:var(--fs-min);'],
  ['.cabinet-card p{margin:0;font-size:11px;letter-spacing:1px}', '.cabinet-card p{margin:0;font-size:var(--fs-small);letter-spacing:1px}'],
  ['.cabinet-card .card-state small{color:#8fa0b2;font-size:10px}', '.cabinet-card .card-state small{color:#8fa0b2;font-size:var(--fs-min)}'],
  ['.rail-item small{font-size:9px;', '.rail-item small{font-size:var(--fs-min);'],
  ['color:#9fb0c0;font-size:11px;letter-spacing:2px;pointer-events:none;white-space:nowrap}', 'color:#9fb0c0;font-size:var(--fs-small);letter-spacing:2px;pointer-events:none;white-space:nowrap}'],
  ['background:#0e1727cc;color:var(--gold);font-size:11px;letter-spacing:2px}', 'background:#0e1727cc;color:var(--gold);font-size:var(--fs-small);letter-spacing:2px}'],
  // 记忆
  ['.memory-pager{color:#8d7a4e;font-size:11px;letter-spacing:2px}', '.memory-pager{color:#8d7a4e;font-size:var(--fs-small);letter-spacing:2px}'],
  ['.memory-levels span{border:1px solid #ad986d88;padding:3px 7px;color:#88764f;font-size:10px;', '.memory-levels span{border:1px solid #ad986d88;padding:3px 7px;color:#88764f;font-size:var(--fs-min);'],
  ['.preserve-choice{position:absolute;left:50%;bottom:12%;transform:translateX(-50%);border:0;border-bottom:1px solid #8e99a655;background:none;color:#8e99a6;font-size:11px;', '.preserve-choice{position:absolute;left:50%;bottom:12%;transform:translateX(-50%);border:0;border-bottom:1px solid #8e99a655;background:none;color:#8e99a6;font-size:var(--fs-small);'],
  ['.memory-timeline li{position:relative;width:12.5%;padding-top:20px;text-align:center;color:#77899d;font:9px/1.5 Arial,sans-serif;', '.memory-timeline li{position:relative;width:12.5%;padding-top:20px;text-align:center;color:#77899d;font:var(--fs-min)/1.5 Arial,sans-serif;'],
  ['.memory-year{display:block;color:#a18149;font:11px/1.8 Arial,sans-serif;', '.memory-year{display:block;color:#a18149;font:var(--fs-small)/1.8 Arial,sans-serif;'],
  // 证书
  ['.certificate .overline{text-align:center;font-size:8px}', '.certificate .overline{text-align:center;font-size:var(--fs-min)}'],
  ['.cert-id{font:9px/1.8 monospace;', '.cert-id{font:var(--fs-min)/1.8 monospace;'],
  ['.cert-actions small{display:block;color:#8e99a6;font-size:9px;line-height:1.7;margin-top:4px;letter-spacing:.5px}', '.cert-actions small{display:block;color:#8e99a6;font-size:var(--fs-min);line-height:1.7;margin-top:4px;letter-spacing:.5px}'],
  ['.cert-note-label{display:block;color:#8d8267;font-size:10px;letter-spacing:1.5px;margin-top:12px}', '.cert-note-label{display:block;color:#8d8267;font-size:var(--fs-min);letter-spacing:1.5px;margin-top:12px}'],
  ['.certificate #cert-note{color:#2c4a7c;border-bottom-color:#b9a476;font-size:12px;padding:7px 0}', '.certificate #cert-note{color:#2c4a7c;border-bottom-color:#b9a476;font-size:var(--fs-small);padding:7px 0}'],
  ['.seal-chip i{font-style:normal;font-size:9px;', '.seal-chip i{font-style:normal;font-size:var(--fs-min);'],
  // 原型卡 / 锔瓷 / 工艺
  ['.proto-card b{font-weight:400;font-size:14px;', '.proto-card b{font-weight:400;font-size:var(--fs-body);'],
  ['.proto-card small{font-size:9px;', '.proto-card small{font-size:var(--fs-min);'],
  ['.juci-bar .overline{color:#c9a961;font-size:10px;letter-spacing:2px}', '.juci-bar .overline{color:#c9a961;font-size:var(--fs-min);letter-spacing:2px}'],
  ['.juci-bar p{margin:0;font-size:12px;line-height:1.9;color:#c6d2dd}', '.juci-bar p{margin:0;font-size:var(--fs-small);line-height:1.9;color:#c6d2dd}'],
  ['.craft-note summary{cursor:pointer;padding:12px 0;font-size:12px;', '.craft-note summary{cursor:pointer;padding:12px 0;font-size:var(--fs-small);'],
  ['.craft-note p,.craft-steps{margin:12px 0;font-size:12px;line-height:2;color:#b9c2cd}', '.craft-note p,.craft-steps{margin:12px 0;font-size:var(--fs-small);line-height:2;color:#b9c2cd}'],
  ['.craft-steps li span{color:#9fadbd;font-size:11px;line-height:1.9}', '.craft-steps li span{color:#9fadbd;font-size:var(--fs-small);line-height:1.9}'],
  ['.paper-corner{position:absolute;right:14px;top:14px;width:34px;height:34px;border:2px solid #b0433a99;border-radius:50%;color:#b0433a;font-size:12px;', '.paper-corner{position:absolute;right:14px;top:14px;width:34px;height:34px;border:2px solid #b0433a99;border-radius:50%;color:#b0433a;font-size:var(--fs-small);'],
  ['.paper-corner:after{content:\'惜物\';font-size:9px;letter-spacing:1px}', '.paper-corner:after{content:\'惜物\';font-size:var(--fs-min);letter-spacing:1px}'],
  // 展厅
  ['.exhibit-rail-item span{font-size:12px;', '.exhibit-rail-item span{font-size:var(--fs-small);'],
  ['.exhibit-rail-item small{display:block;font-size:10px;', '.exhibit-rail-item small{display:block;font-size:var(--fs-min);'],
  ['.exhibit-placard dd{font-size:12px}', '.exhibit-placard dd{font-size:var(--fs-small)}'],
  ['.exhibit-proto-source{font-size:10px;', '.exhibit-proto-source{font-size:var(--fs-min);'],
  ['.exhibit-nav span{font:11px Arial,sans-serif;', '.exhibit-nav span{font:var(--fs-small) Arial,sans-serif;'],
  ['.exhibit-kiln summary{cursor:pointer;padding:10px 0;font:9px/1.8 Arial,sans-serif;', '.exhibit-kiln summary{cursor:pointer;padding:10px 0;font:var(--fs-min)/1.8 Arial,sans-serif;'],
  // 分享
  ['padding:12px 20px;font-size:13px;letter-spacing:2px;', 'padding:12px 20px;font-size:var(--fs-body);letter-spacing:2px;'],
  ['.share-panel .muted{font-size:12px;line-height:2}', '.share-panel .muted{font-size:var(--fs-small);line-height:2}'],
  // 移动端微调
  ['.vessel-caption{bottom:2%;font-size:10px}', '.vessel-caption{bottom:2%;font-size:12px}'],
  ['.tour-chip{padding:6px 9px;font-size:10px;margin-left:10px}', '.tour-chip{padding:6px 9px;font-size:var(--fs-small);margin-left:10px}'],
]);

// ---------- guide.css ----------
patch('guide.css', [
  ['.gp-kicker{display:block;font:10px/1.6 Arial,sans-serif', '.gp-kicker{display:block;font:var(--fs-min)/1.6 Arial,sans-serif'],
  ['.gp-chip{font:10px/1.6 Arial,sans-serif', '.gp-chip{font:var(--fs-min)/1.6 Arial,sans-serif'],
  ['.gp-q{margin:0 0 8px;font-size:12px;letter-spacing:.6px;color:#8fa3bd}', '.gp-q{margin:0 0 8px;font-size:var(--fs-small);letter-spacing:.6px;color:#8fa3bd}'],
  ['font-size:12px;letter-spacing:.6px;text-align:left', 'font-size:var(--fs-small);letter-spacing:.6px;text-align:left'],
  ['.gp-sources{margin:6px 0 4px;font-size:12px}', '.gp-sources{margin:6px 0 4px;font-size:var(--fs-small)}'],
  ['.gp-head-actions .quiet{font-size:11px;', '.gp-head-actions .quiet{font-size:var(--fs-small);'],
  ['.gp-related .gp-reco{font-size:11.5px;', '.gp-related .gp-reco{font-size:var(--fs-small);'],
  ['.gp-actions .quiet{border:1px solid #c9a96144;border-radius:3px;padding:7px 11px;font-size:12px;', '.gp-actions .quiet{border:1px solid #c9a96144;border-radius:3px;padding:7px 11px;font-size:var(--fs-small);'],
  ['.gp-ask-row .quiet{border:1px solid #c9a96144;border-radius:3px;padding:11px 12px;font-size:12px;', '.gp-ask-row .quiet{border:1px solid #c9a96144;border-radius:3px;padding:11px 12px;font-size:var(--fs-small);'],
  ['border-radius:999px;padding:7px 13px;color:#c9a961;font-size:12px;letter-spacing:1px}', 'border-radius:999px;padding:7px 13px;color:#c9a961;font-size:var(--fs-small);letter-spacing:1px}'],
  ['.tour-bar .tour-count{font-size:12px;', '.tour-bar .tour-count{font-size:var(--fs-small);'],
  ['font-size:12px;letter-spacing:1px;backdrop-filter:blur(8px);', 'font-size:var(--fs-small);letter-spacing:1px;backdrop-filter:blur(8px);'],
  ['.gc-label{position:absolute;top:-2px;left:50%;transform:translateX(-50%);white-space:nowrap;\n font:10px/1.5 Arial,sans-serif', '.gc-label{position:absolute;top:-2px;left:50%;transform:translateX(-50%);white-space:nowrap;\n font:var(--fs-min)/1.5 Arial,sans-serif'],
  ['font-size:12px;line-height:1.85;letter-spacing:.4px;color:#e3e9f2;', 'font-size:var(--fs-small);line-height:1.85;letter-spacing:.4px;color:#e3e9f2;'],
  ['letter-spacing:2px;font-size:12px}\n#tour-start:hover', 'letter-spacing:2px;font-size:var(--fs-small)}\n#tour-start:hover'],
  ['.guide-inline{display:block;width:100%;margin-top:10px;text-align:center;font-size:11px;', '.guide-inline{display:block;width:100%;margin-top:10px;text-align:center;font-size:var(--fs-small);'],
  // 面板顶端对齐页头下缘（原 76px 会盖住页头右半）
  ['.guide-panel{--gp-fs:15px;position:fixed;right:0;top:76px;', '.guide-panel{--gp-fs:15px;position:fixed;right:0;top:100px;'],
]);

// ---------- reference-ui.css ----------
patch('reference-ui.css', [
  ['.atelier-rail button span{color:#c9a961;margin-right:8px;font:9px Arial}', '.atelier-rail button span{color:#c9a961;margin-right:8px;font:var(--fs-min) Arial}'],
  ['.placard-en{font:8px/1.95 Arial,sans-serif', '.placard-en{font:var(--fs-min)/1.95 Arial,sans-serif'],
  ['.placard-seal{writing-mode:vertical-rl;font-style:normal;font-size:10px;', '.placard-seal{writing-mode:vertical-rl;font-style:normal;font-size:var(--fs-min);'],
  ['.hero-en{left:7%;bottom:9%;font:11px/2.05 Arial,sans-serif', '.hero-en{left:7%;bottom:9%;font:var(--fs-min)/2.05 Arial,sans-serif'],
  ['.cert-actions .quiet{font-size:11px}', '.cert-actions .quiet{font-size:var(--fs-small)}'],
  ['footer{height:58px;background:#0d172640}.footer-note{font-size:8px}.steps{gap:20px}', 'footer{height:58px;background:#0d172640}.footer-note{font-size:var(--fs-min)}.steps{gap:20px}'],
]);

// ---------- reference-fit.css ----------
patch('reference-fit.css', [
  ['.side-card.paper-card dt{margin:0;line-height:1.8;font-size:10px}', '.side-card.paper-card dt{margin:0;line-height:1.8;font-size:var(--fs-min)}'],
  ['.side-card.paper-card dd{margin:0;font-size:12px;line-height:1.85}', '.side-card.paper-card dd{margin:0;font-size:var(--fs-small);line-height:1.85}'],
  ['.certificate p{font-size:11px;line-height:1.8;margin:7px 0}', '.certificate p{font-size:var(--fs-small);line-height:1.8;margin:7px 0}'],
  ['.certificate #cert-note{padding:5px 0;font-size:11px}', '.certificate #cert-note{padding:5px 0;font-size:var(--fs-small)}'],
]);

// ---------- culture.css ----------
patch('culture.css', [
  ['.layer-chips i{font-style:normal;font-size:11px;', '.layer-chips i{font-style:normal;font-size:var(--fs-small);'],
  ['.guide-steps li{font-size:11px;letter-spacing:2px;', '.guide-steps li{font-size:var(--fs-small);letter-spacing:2px;'],
  ['.work-steps i{font-style:normal;font-size:11px;letter-spacing:2px;', '.work-steps i{font-style:normal;font-size:var(--fs-small);letter-spacing:2px;'],
  ['.card-study{margin:6px 0 0;font-size:12px;', '.card-study{margin:6px 0 0;font-size:var(--fs-small);'],
  ['.guide-steps li{padding:4px 8px;font-size:10px;letter-spacing:1px}}', '.guide-steps li{padding:4px 8px;font-size:var(--fs-min);letter-spacing:1px}}'],
  ['.work-steps i{padding:3px 8px;font-size:10px;letter-spacing:1px}', '.work-steps i{padding:3px 8px;font-size:var(--fs-min);letter-spacing:1px}'],
]);

if (failures.length) { console.error('未命中/多命中：\n' + failures.join('\n')); process.exit(1); }
console.log('全部替换命中 ✓');
