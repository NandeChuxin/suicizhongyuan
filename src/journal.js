/*
  《碎瓷重圆》融合出版衍生册 · 瓷器记忆手记 —— 渲染脚本
  单源数据：直接引用 src/data/vessels.js 与 src/data/culture.js，不复制任何文案。
  零三方依赖：只使用原生 DOM / 浏览器 API；视觉全部由 CSS 与内联 SVG 程序化生成。

  关于本页放置位置：本页作为独立 Vite 构建入口置于项目根目录 journal/（输出 dist/journal/index.html），
  而非 public/。原因是它必须通过 ES module import 复用主数据源，保证「单源数据」；public/ 下静态文件不参与打包，无法满足。
*/
import { VESSELS } from '../src/data/vessels.js';
import { CULTURE } from '../src/data/culture.js';

const CHAPTER_NUM = ['壹', '贰', '叁', '肆', '伍', '陆'];

/* 分层标注标签：史实 / 传说 / 原创 */
function layerTag(type) {
  const map = {
    fact: ['l-fact', '史实'],
    legend: ['l-legend', '传说'],
    original: ['l-orig', '原创']
  };
  const [cls, label] = map[type] || map.original;
  return `<span class="layer-tag ${cls}">${label}</span>`;
}

/* 卷首装饰 · 山纹（内联 SVG，程序化绘制） */
const MOUNTAIN_SVG = `
<svg viewBox="0 0 640 130" role="img" aria-label="远山纹样">
  <path d="M0 130 L96 62 L150 96 L214 30 L286 100 L352 46 L430 104 L500 58 L562 92 L640 130 Z"
        fill="none" stroke="#2c4a7c" stroke-opacity=".5" stroke-width="1.4"/>
  <path d="M0 130 L120 88 L196 116 L286 66 L372 116 L470 80 L556 110 L640 130 Z"
        fill="none" stroke="#c9a961" stroke-width="1.6"/>
  <path d="M40 130 H600" stroke="#c9a961" stroke-opacity=".5" stroke-width="1"/>
</svg>`;

/* 卷首印章 · 白文朱砂方印「惜物重生」（内联 SVG） */
const SEAL_SVG = `
<svg viewBox="0 0 120 120" role="img" aria-label="印章：惜物重生">
  <rect x="1" y="1" width="118" height="118" rx="7" fill="#b0432e"/>
  <rect x="9" y="9" width="102" height="102" rx="4" fill="none" stroke="#f7efe0" stroke-width="2.4" stroke-opacity=".92"/>
  <g fill="#f7efe0" font-family="SimSun, serif" font-size="38" text-anchor="middle">
    <text x="80" y="51">惜</text>
    <text x="80" y="99">物</text>
    <text x="40" y="51">重</text>
    <text x="40" y="99">生</text>
  </g>
</svg>`;

/* 每段记忆：标题 + 纪年 + 正文 + 配图（story.image 相对 public 根，此处以 ../ 解析） */
function memorySection(s) {
  const src = `../${s.image}`;
  return `
  <li class="memory">
    <figure class="memory-figure">
      <img src="${src}" alt="${s.title} · 程序化纹样习作" loading="lazy">
      <figcaption>${s.title} · 数字纹样习作（程序化绘制）</figcaption>
    </figure>
    <div class="memory-body">
      <h4>${s.title}</h4>
      <p class="memory-year">${s.year}</p>
      <p class="memory-text">${s.text}</p>
      ${layerTag('original')}
    </div>
  </li>`;
}

/* 匠人之声一条 */
function voiceItem(label, text) {
  return `<div class="voice"><span class="voice-label">${label}</span><p>${text}</p></div>`;
}

/* 单章渲染 */
function chapterHtml(v, ch) {
  const cul = CULTURE[v.id] || {};
  const legendNote = /传说/.test(v.storyline)
    ? `${layerTag('legend')} 其中地方传说部分按传说口径标注`
    : '';

  return `
  <article class="chapter" id="chapter-${v.id}">
    <header class="chapter-head">
      <div class="chapter-num">${CHAPTER_NUM[ch]}</div>
      <div class="chapter-title">
        <h2>${v.name}</h2>
        <p class="chapter-sub">${v.era} · ${v.glaze} · ${v.origin}</p>
      </div>
      <span class="chapter-index">第 ${ch + 1} 章</span>
    </header>

    <dl class="chapter-meta">
      <div><dt>年代</dt><dd>${v.era}</dd></div>
      <div><dt>釉色</dt><dd>${v.glaze}</dd></div>
      <div><dt>出处</dt><dd>${v.origin}</dd></div>
      <div><dt>档案号</dt><dd>${v.archive}</dd></div>
      <div><dt>叙事线</dt><dd>${v.storyline}</dd></div>
      <div><dt>修复状态</dt><dd>${v.breakdown}</dd></div>
    </dl>

    <p class="layerline">
      ${layerTag('original')} 本器物的名称、年代、釉色、出处与经历均为原创叙事设定 ${legendNote}
    </p>

    <p class="intro">${v.intro}</p>

    ${cul.person ? `
    <section class="commission">
      <h3 class="section-title">修复委托</h3>
      <dl>
        <div><dt>委托人</dt><dd>${cul.person}（原创人物）</dd></div>
        <div><dt>心愿</dt><dd>${cul.wish}</dd></div>
        <div><dt>线索</dt><dd>${cul.clue}</dd></div>
        <div><dt>说明</dt><dd>${cul.detail}</dd></div>
        <div><dt>结局</dt><dd>${cul.ending}</dd></div>
        <div><dt>主题</dt><dd>${cul.theme}</dd></div>
      </dl>
    </section>` : ''}

    <h3 class="section-title">八段记忆</h3>
    <ol class="memories">
      ${v.stories.map(memorySection).join('')}
    </ol>

    <section class="voices">
      <h3 class="section-title">匠人之声</h3>
      ${voiceItem('画师', v.voices.painter)}
      ${voiceItem('掌柜', v.voices.keeper)}
      ${voiceItem('窑工', v.voices.kilnWorker)}
    </section>
  </article>`;
}

/* 卷首 */
function coverHtml() {
  return `
  <section class="cover">
    <p class="cover-kicker">融合出版 · 电子手记</p>
    <h1 class="cover-title">瓷器记忆手记</h1>
    <p class="cover-sub">六器 · 四十八段记忆 · 匠人之声</p>
    <div class="cover-rule"></div>
    <div class="cover-mountain">${MOUNTAIN_SVG}</div>
    <div class="seal">${SEAL_SVG}</div>
    <p class="cover-foot">《碎瓷重圆》青花修复互动 · 数字出版衍生册</p>
  </section>`;
}

/* 目录 */
function contentsHtml() {
  const items = VESSELS.map((v, i) => `
    <li>
      <span class="num">${CHAPTER_NUM[i]}</span>
      <span class="name">${v.name}</span>
      <span class="meta">${v.era} · ${v.glaze} · ${v.archive}</span>
    </li>`).join('');
  return `
  <nav class="contents">
    <h2>目录</h2>
    <ol>${items}</ol>
  </nav>`;
}

/* 末页：资料与创作说明 */
function colophonHtml() {
  const protos = VESSELS.map(v => `
    <li>
      <b>${v.name}</b>（${v.era}）<br>
      原型参考：${v.proto.caption}<br>
      来源：${v.proto.source}
    </li>`).join('');

  return `
  <section class="colophon">
    <h2>资料与创作说明</h2>

    <h3>一 · 分层标注口径</h3>
    <div class="legend-explain">
      <div>${layerTag('fact')} <span><b>史实</b> —— 仅指可追溯到公开权威来源的时代、工艺与器型常识（例如青花与釉里红以铜、钴呈色的烧成原理，缠枝莲、云龙纹样的通行时代背景）。本手记对史实部分仅作概述行文，不逐条标注具体文献。</span></div>
      <div>${layerTag('legend')} <span><b>传说</b> —— 指流传于民间、缺乏确证的叙事（例如「窑工之女纵身入火、满窑霞色」的祭红传说）。本手记如实标注为传说，不将其当作工艺成因或史实。</span></div>
      <div>${layerTag('original')} <span><b>原创</b> —— 本项目六件数字器物本身及其断代设定、修复经历、委托人物与全部四十八段编年记忆，均为创作性叙事设定，不对应任何真实文物或人物。</span></div>
    </div>

    <h3>二 · 器物原型出处</h3>
    <ol class="proto-list">${protos}</ol>
    <p class="note">
      上述器物原型参考图与资料取自故宫博物院官网公开藏品资料；本手记用于非商业的教育与竞赛演示，
      不宣称数字器物为真实馆藏，也不代表对应文物的原始形貌。完整来源与许可说明详见
      <code>public/patterns/real/ATTRIBUTION.md</code>。
    </p>

    <h3>三 · 修复理念参考</h3>
    <p>
      本手记对「修复」的理解，参考国际文化遗产保护通行的表述：ICOM-CC《Terminology for conservation》(2008)
      对「保护 / 修复 / 稳定化」等术语的界定，以及 AICCM《Code of Ethics and Practice》所强调的最小干预、
      可识别性与可逆性原则。以下为原创概述，不引用原文，也不据此对任何具体修复方案作鉴定。
    </p>
    <ul class="ref-list">
      <li>ICOM-CC, <i>Terminology for conservation</i> （2008）—— <a href="https://www.icom-cc.org/en/terminology-for-conservation" target="_blank" rel="noopener noreferrer">https://www.icom-cc.org/en/terminology-for-conservation</a></li>
      <li>AICCM, <i>Code of Ethics and Practice</i> —— <a href="https://aiccm.org.au/about/code-ethics-and-practice/" target="_blank" rel="noopener noreferrer">https://aiccm.org.au/about/code-ethics-and-practice/</a></li>
    </ul>

    <h3>四 · 整体声明</h3>
    <p class="statement">
      本手记文本为创作性叙事与原创概述，其中的器物、人物与经历均为项目设定，不构成学术引用、馆藏描述或鉴定依据。
    </p>
  </section>`;
}

/* 组装并挂载 */
function render() {
  const root = document.getElementById('journal-root');
  if (!root) return;

  root.innerHTML = [
    coverHtml(),
    contentsHtml(),
    ...VESSELS.map(chapterHtml),
    colophonHtml()
  ].join('');

  const printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', render);
} else {
  render();
}
