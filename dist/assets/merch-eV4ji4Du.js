import{V as r}from"./vessels-C3sRNfYe.js";const e=s=>String(s).replace(/[&<>"']/g,i=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[i]);function $(s){let i=1/0,t=-1/0,n=1/0,a=-1/0;for(const c of s){const l=c[0],o=c[1];l<i&&(i=l),l>t&&(t=l),o<n&&(n=o),o>a&&(a=o)}return{minX:i,maxX:t,minY:n,maxY:a,w:t-i,h:a-n}}const x=r.map(s=>$(s.outline)),F=Math.max(...x.map(s=>s.w)),V=Math.max(...x.map(s=>s.h)),b=.9,f=F+b*2,h=V+b*2,E=`${(-f/2).toFixed(3)} ${(-h/2).toFixed(3)} ${f.toFixed(3)} ${h.toFixed(3)}`;function G(s){const i=$(s),t=(i.minX+i.maxX)/2,n=(i.minY+i.maxY)/2;return s.map(([a,c])=>`${(a-t).toFixed(3)},${(n-c).toFixed(3)}`).join(" ")}let I=0;function d(s){const i="mg"+I++;return`<svg class="silhouette" viewBox="${E}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${e(s.name)}剪影">
    <defs><linearGradient id="${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3f6396"/><stop offset="0.55" stop-color="#2c4a7c"/><stop offset="1" stop-color="#1f365d"/>
    </linearGradient></defs>
    <polygon points="${G(s.outline)}" fill="url(#${i})" stroke="#1a2332" stroke-width="0.05" stroke-linejoin="round"/>
  </svg>`}function u(s){const i=[...s],t=i.length>1?2:1,n=Math.ceil(i.length/t),a=76,c=12,l=12,o=a/t,m=a/n,v=Math.min(o,m)*.8,g=i.map((k,p)=>{const y=p%t,S=Math.floor(p/t),w=c+o*(y+.5),M=l+m*(S+.5);return`<text x="${w.toFixed(1)}" y="${M.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="${v.toFixed(1)}">${e(k)}</text>`}).join("");return`<svg class="seal" viewBox="0 0 100 100" role="img" aria-label="${e(s)}印">
    <rect x="5" y="5" width="90" height="90" rx="8" fill="#b0432e"/>
    <rect x="10" y="10" width="80" height="80" rx="4" fill="none" stroke="#f5f2ea" stroke-width="1.8" opacity="0.8"/>
    <g fill="#f8f4ea" font-family="SimSun,'Songti SC','Noto Serif SC',serif" font-weight="600">${g}</g>
  </svg>`}const j=[["梅瓶","梅瓶"],["玉壶春","玉壶"],["云龙","云龙"],["高足","高足"],["蒜头","蒜头"],["玲珑","玲珑"]];function X(s){for(const[i,t]of j)if(s.name.includes(i))return t;return s.name.slice(-2)}const Y=r.map(s=>`
  <article class="postcard" data-index="${s.index}">
    <div class="pc-frame" aria-hidden="true"></div>
    <div class="pc-seal">${u("碎瓷重圆")}</div>
    <div class="pc-figure">${d(s)}</div>
    <div class="pc-meta">
      <p class="pc-kicker">碎瓷重圆 · 青花修器</p>
      <h3 class="pc-name">${e(s.name)}</h3>
      <p class="pc-era">${e(s.era)} · ${e(s.glaze)}</p>
      <p class="pc-code">${e(s.archive)}</p>
    </div>
  </article>`).join(""),A=r.map(s=>`
  <article class="bookmark" data-index="${s.index}">
    <div class="bm-art">${d(s)}</div>
    <div class="bm-body">
      <div class="bm-name" aria-label="${e(s.name)}">${e(s.name)}</div>
      <div class="bm-seal">${u(X(s))}</div>
    </div>
    <p class="bm-era">${e(s.era)}</p>
  </article>`).join(""),D=r.map(s=>`
  <div class="sticker" data-index="${s.index}">
    <div class="sticker-art">${d(s)}</div>
    <span class="sticker-label">${e(s.name)}</span>
  </div>`).join("");document.querySelector("#merch").innerHTML=`
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
      全页无任何外部图片素材，配色沿用金线（#c9a961）、朱砂（#b0432e）与墨蓝（#1a2332）。
    </p>

    <section class="m-block">
      <h2 class="m-h2"><span>一</span>明信片 · A6 竖版 105 × 148 mm</h2>
      <div class="m-grid pc-grid">${Y}</div>
    </section>

    <section class="m-block">
      <h2 class="m-h2"><span>二</span>书签 · 50 × 180 mm</h2>
      <div class="m-grid bm-grid">${A}</div>
    </section>

    <section class="m-block">
      <h2 class="m-h2"><span>三</span>贴纸组 · 六件器物</h2>
      <div class="m-grid">
        <article class="sticker-sheet">
          <div class="ss-head"><span>碎瓷重圆</span><em>STICKER SET · 贴纸组</em></div>
          <div class="ss-cells">${D}</div>
          <div class="ss-foot">六件器物剪影徽标 · 参赛视觉延展样张，非商用</div>
        </article>
      </div>
    </section>
  </main>
  <footer class="m-foot">
    碎瓷重圆 · 数字修复室 —— 文创视觉延展样张（参赛用，非商用）。全部图形由原生 SVG / DOM 程序化绘制，未使用任何外部图片素材。
  </footer>
`;document.querySelector(".m-print").addEventListener("click",()=>window.print());
