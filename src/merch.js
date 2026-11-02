// 《碎瓷重圆》文创视觉延展样张 —— 页面脚本
//
// 放置位置说明（Vite 模块单源）：
// 本页放在「项目根目录的 merch/index.html」，而不是 public/ 下。原因有二：
//   1) 它需要作为独立的 Vite 构建入口，构建后自动输出 dist/merch/index.html，
//      对应线上 /merch/ 路径；
//   2) 它必须用 ES module 直接 import 主数据源 src/data/vessels.js，保证「器物单源」——
//      器名 / 年代 / 釉色 / 轮廓全部来自数据，不在页面写死。
// public/ 下的资源不参与模块打包、无法 import 数据源，故不放 public/。
//
// 零第三方依赖：只用原生 DOM + CSS + 内联 SVG，未引入 three / gsap / html2canvas。
// 零外部图片：全部图形为程序化 SVG / DOM 绘制，不复用任何馆藏照片或网络图片。
import { VESSELS } from '../src/data/vessels.js';
import './merch.css';

// ---------- 工具 ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 轮廓几何：点集 -> SVG polygon ----------
// VESSELS[i].outline 为对称闭合多边形 [[x,y],...]，y 轴向上。
// SVG 的 y 轴向下，故渲染时取负（sy = -y）。为让 6 件器物在各自卡片中大小协调，
// 先求全部器物轮廓的全局包围盒，取统一的 viewBox；再让每件器物按自身中心平移居中。
function extents(poly) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of poly) {
    const x = p[0], y = p[1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

const EXTS = VESSELS.map(v => extents(v.outline));
const GW = Math.max(...EXTS.map(e => e.w));   // 全局最大宽
const GH = Math.max(...EXTS.map(e => e.h));   // 全局最大高
const PAD = 0.9;                               // 轮廓单位下的留白
const VW = GW + PAD * 2;
const VH = GH + PAD * 2;
// 统一 viewBox：以原点为中心，所有器物都落在同一坐标尺度内，故比例一致、大小协调。
const VIEWBOX = `${(-VW / 2).toFixed(3)} ${(-VH / 2).toFixed(3)} ${VW.toFixed(3)} ${VH.toFixed(3)}`;

// 把某件器物的轮廓转成居中、y 翻转后的 polygon points 字符串。
function outlinePoints(outline) {
  const e = extents(outline);
  const cx = (e.minX + e.maxX) / 2;   // 水平中心
  const cy = (e.minY + e.maxY) / 2;   // y 轴向上时的垂直中心
  return outline
    .map(([x, y]) => `${(x - cx).toFixed(3)},${(cy - y).toFixed(3)}`) // sy = -y，再整体居中
    .join(' ');
}

// 器物剪影（程序化、可复现）：青花蓝填充 + 墨蓝描边。
let UID = 0;
function silhouetteSVG(v) {
  const gid = 'mg' + (UID++);
  return `<svg class="silhouette" viewBox="${VIEWBOX}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(v.name)}剪影">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3f6396"/><stop offset="0.55" stop-color="#2c4a7c"/><stop offset="1" stop-color="#1f365d"/>
    </linearGradient></defs>
    <polygon points="${outlinePoints(v.outline)}" fill="url(#${gid})" stroke="#1a2332" stroke-width="0.05" stroke-linejoin="round"/>
  </svg>`;
}

// ---------- 朱砂印（内联 SVG，方印） ----------
// text 逐字排布：单字居中；多字排 2 列网格（朱文：红底白字）。
function sealSVG(text) {
  const chars = [...text];
  const cols = chars.length > 1 ? 2 : 1;
  const rows = Math.ceil(chars.length / cols);
  const inner = 76, ox = 12, oy = 12;
  const cw = inner / cols, ch = inner / rows;
  const fs = Math.min(cw, ch) * 0.8;
  const cells = chars.map((c, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = ox + cw * (col + 0.5), y = oy + ch * (row + 0.5);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="${fs.toFixed(1)}">${esc(c)}</text>`;
  }).join('');
  return `<svg class="seal" viewBox="0 0 100 100" role="img" aria-label="${esc(text)}印">
    <rect x="5" y="5" width="90" height="90" rx="8" fill="#b0432e"/>
    <rect x="10" y="10" width="80" height="80" rx="4" fill="none" stroke="#f5f2ea" stroke-width="1.8" opacity="0.8"/>
    <g fill="#f8f4ea" font-family="SimSun,'Songti SC','Noto Serif SC',serif" font-weight="600">${cells}</g>
  </svg>`;
}

// 器物简称（用于书签小篆印）：按器型关键词从数据里的 name 推断，不写死具体器名。
const MARK_RULES = [['梅瓶', '梅瓶'], ['玉壶春', '玉壶'], ['云龙', '云龙'], ['高足', '高足'], ['蒜头', '蒜头'], ['玲珑', '玲珑']];
function typeMark(v) {
  for (const [key, mark] of MARK_RULES) if (v.name.includes(key)) return mark;
  return v.name.slice(-2);
}

// ---------- 三类样张 DOM ----------
// 一 · 明信片（A6 竖版 105×148mm）：剪影 + 器名 + 年代 + 金线边框 + 朱砂方印。
const postcards = VESSELS.map(v => `
  <article class="postcard" data-index="${v.index}">
    <div class="pc-frame" aria-hidden="true"></div>
    <div class="pc-seal">${sealSVG('碎瓷重圆')}</div>
    <div class="pc-figure">${silhouetteSVG(v)}</div>
    <div class="pc-meta">
      <p class="pc-kicker">碎瓷重圆 · 青花修器</p>
      <h3 class="pc-name">${esc(v.name)}</h3>
      <p class="pc-era">${esc(v.era)} · ${esc(v.glaze)}</p>
      <p class="pc-code">${esc(v.archive)}</p>
    </div>
  </article>`).join('');

// 二 · 书签（5×18cm）：剪影 + 竖排器名 + 小篆印 + 金线描边。
const bookmarks = VESSELS.map(v => `
  <article class="bookmark" data-index="${v.index}">
    <div class="bm-art">${silhouetteSVG(v)}</div>
    <div class="bm-body">
      <div class="bm-name" aria-label="${esc(v.name)}">${esc(v.name)}</div>
      <div class="bm-seal">${sealSVG(typeMark(v))}</div>
    </div>
    <p class="bm-era">${esc(v.era)}</p>
  </article>`).join('');

// 三 · 贴纸组：一张版上排布 6 件器物剪影徽标 + 文字标签（圆角白底 / 描边）。
const stickers = VESSELS.map(v => `
  <div class="sticker" data-index="${v.index}">
    <div class="sticker-art">${silhouetteSVG(v)}</div>
    <span class="sticker-label">${esc(v.name)}</span>
  </div>`).join('');

// ---------- 挂载 ----------
document.querySelector('#merch').innerHTML = `
  <header class="m-head">
    <div class="m-brand">碎瓷重圆<span>文创视觉延展样张</span></div>
    <div class="m-note">参赛视觉延展样张 · 非商用</div>
    <button class="m-print" type="button">打印预览 / 导出 PDF</button>
  </header>
  <main class="m-main">
    <p class="m-banner">参赛视觉延展样张，非商用</p>
    <p class="m-intro">
      取六件器物的修复档案轮廓，化为可量产的文创视觉：<b>明信片</b>、<b>书签</b>与<b>贴纸组</b>。
      器物剪影由数据层 <b>outline</b> 程序化生成为 SVG 多边形（统一缩放居中，可复现）；
      全页无任何外部图片素材，配色沿用金线（${'#c9a961'}）、朱砂（${'#b0432e'}）与墨蓝（${'#1a2332'}）。
    </p>

    <section class="m-block">
      <h2 class="m-h2"><span>一</span>明信片 · A6 竖版 105 × 148 mm</h2>
      <div class="m-grid pc-grid">${postcards}</div>
    </section>

    <section class="m-block">
      <h2 class="m-h2"><span>二</span>书签 · 50 × 180 mm</h2>
      <div class="m-grid bm-grid">${bookmarks}</div>
    </section>

    <section class="m-block">
      <h2 class="m-h2"><span>三</span>贴纸组 · 六件器物</h2>
      <div class="m-grid">
        <article class="sticker-sheet">
          <div class="ss-head"><span>碎瓷重圆</span><em>STICKER SET · 贴纸组</em></div>
          <div class="ss-cells">${stickers}</div>
          <div class="ss-foot">六件器物剪影徽标 · 参赛视觉延展样张，非商用</div>
        </article>
      </div>
    </section>
  </main>
  <footer class="m-foot">
    碎瓷重圆 · 数字修复室 —— 文创视觉延展样张（参赛用，非商用）。全部图形由原生 SVG / DOM 程序化绘制，未使用任何外部图片素材。
  </footer>
`;

document.querySelector('.m-print').addEventListener('click', () => window.print());
