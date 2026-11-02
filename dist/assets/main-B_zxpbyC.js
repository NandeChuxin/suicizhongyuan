import{a as g,c as m,L as _,b as f,g as b,S as y,d as $,C as v}from"./scene-host-DDbf8D9C.js";const d=new URLSearchParams(location.search);function w(){const n=document.getElementById("kaocha-overview");n&&(n.innerHTML=y.map(c=>{const t=$[c];return`
      <li class="kc-card">
        <a class="kc-card__link" href="./${t.html}">
          <span class="kc-card__kicker">${t.refDir}</span>
          <h2 class="kc-card__title">${t.name}</h2>
          <p class="kc-card__sub">${t.subtitle}</p>
          <p class="kc-card__meta">参考图 ${t.refCount} 张 · 构件 ${t.components.length} 项 · 尺度锚点 ${t.anchors.length} 条</p>
          <span class="kc-card__cta">进入写实预览 →</span>
        </a>
      </li>`}).join(""))}function C(n){const c=g(d.get("site")||n.dataset.site);if(!c){n.textContent=`未知景点：${n.dataset.site}`;return}const t=x(c),h=d.get("grid")!=="0",o=d.get("ref")!=="0";t.gridBox.checked=h,t.refBox.checked=o;const a=m({host:n,siteIds:[c.id],quality:d.get("q"),lightId:_.includes(d.get("light"))?d.get("light"):"overcast",showScale:!0,hooks:{onCamera(e,s){t.camera.textContent=`机位：${e.label}（对照 ${e.ref}）`,i(t.cameraButtons,s)},onLight(e,s){t.light.textContent=`光照：${s.label}`,i(t.lightButtons,_.indexOf(e))},onQuality(e){i(t.qualityButtons,["high","mid","low"].indexOf(e.id)),t.budget.textContent=f(e)},onComponent(e){t.refName.textContent=e.name?`当前构件：${e.name}`:"当前构件：—（对准建筑即可读取溯源）",t.refSrc.textContent=e.source?.length?`依据参考图：${e.source.join(" · ")}`:"依据参考图：—",t.refTag.textContent=e.name?`${e.tag} · ${e.confidence}`:"",t.refTag.dataset.confidence=e.confidence??"",t.refNote.textContent=e.note??""},onStats(e){t.stats.textContent=`${e.fps} fps · 画面 ${(e.triangles/1e3).toFixed(1)}k 面 / 场景合计 ${(e.totalTriangles/1e3).toFixed(1)}k 面 · ${e.calls} draw calls · LOD ${e.lod}`,t.stats.dataset.over=e.trianglesOver||e.callsOver?"1":"0",t.budget.textContent=e.budget},onDegrade(e){t.perf.textContent=`帧率不足，已自动降级到 ${e.label}`}}});function i(e,s){e.forEach((r,p)=>r.classList.toggle("is-active",p===s))}c.cameras.forEach((e,s)=>{const r=document.createElement("button");r.type="button",r.className="kc-btn",r.textContent=e.label.split("（")[0],r.title=`${e.label} · 对照 ${e.ref}`,r.addEventListener("click",()=>a.gotoCamera(s)),t.cameraButtons.push(r),t.cameraRow.appendChild(r)}),_.forEach(e=>{const s=document.createElement("button");s.type="button",s.className="kc-btn",s.textContent=b(e).label.split("（")[0],s.addEventListener("click",()=>a.setLight(e)),t.lightButtons.push(s),t.lightRow.appendChild(s)}),["high","mid","low"].forEach(e=>{const s=document.createElement("button");s.type="button",s.className="kc-btn",s.textContent=e,s.addEventListener("click",()=>a.setQuality(e)),t.qualityButtons.push(s),t.qualityRow.appendChild(s)}),t.gridBox.addEventListener("change",()=>a.setGrid(t.gridBox.checked)),t.refBox.addEventListener("change",()=>a.setRef(t.refBox.checked));const l=d.get("tier");l&&a.lockTier(l);const u=a.setSite(c.id,{cameraIndex:0});a.setGrid(h),a.setRef(o),a.setLight(a.lightId),t.budget.textContent=a.stats().budget,a.resize(),a.start(),window.addEventListener("pagehide",()=>a.dispose(),{once:!0}),n.dataset.ready="1",window.__kaocha={stats:()=>a.stats(),setCamera:a.gotoCamera,setLight:a.setLight,setQuality:a.setQuality,siteScene:u?.siteScene}}function x(n){const c=document.createElement("div");c.className="kc-hud",c.innerHTML=`
    <div class="kc-hud__head">
      <div>
        <p class="kc-hud__kicker">景德镇景点考察 · 写实 3D</p>
        <h1 class="kc-hud__title">${n.name}</h1>
        <p class="kc-hud__sub">${n.subtitle}</p>
      </div>
      <a class="kc-hud__back" href="./kaocha.html">总览</a>
    </div>
    <div class="kc-hud__panel">
      <p class="kc-hud__ref-name">当前构件：—（对准建筑即可读取溯源）</p>
      <p class="kc-hud__ref-src">依据参考图：—</p>
      <p class="kc-hud__ref-tag"></p>
      <p class="kc-hud__ref-note"></p>
      <p class="kc-hud__light"></p>
      <p class="kc-hud__camera"></p>
      <p class="kc-hud__stats"></p>
      <p class="kc-hud__budget"></p>
      <p class="kc-hud__perf"></p>
    </div>
    <div class="kc-hud__rows"></div>
    <div class="kc-hud__toggles">
      <label><input type="checkbox" data-kc="grid" checked> 1 m 网格</label>
      <label><input type="checkbox" data-kc="ref" checked> 1.70 m 人物参照</label>
    </div>
    <details class="kc-hud__anchors">
      <summary>真实尺寸锚点（${n.anchors.length} 条）</summary>
      <ul>
        ${n.anchors.map(a=>`<li><b>${a.label}</b>：${a.value} <span class="kc-tag kc-tag--${a.basis}">${v[a.basis]}</span></li>`).join("")}
      </ul>
    </details>
    <p class="kc-hud__foot">参考照片版权归原景区 / 媒体与摄影师所有，仅用于定比例与校轮廓，不作公开页面底图。</p>
  `,document.body.appendChild(c);const t=c.querySelector(".kc-hud__rows"),h=[["预设机位","camera"],["光照预设","light"],["画质档","quality"]],o={};for(const[a,i]of h){const l=document.createElement("div");l.className="kc-hud__row",l.innerHTML=`<span class="kc-hud__rowlabel">${a}</span>`;const u=document.createElement("span");u.className="kc-hud__btnrow",l.appendChild(u),t.appendChild(l),o[i]=u}return{root:c,refName:c.querySelector(".kc-hud__ref-name"),refSrc:c.querySelector(".kc-hud__ref-src"),refTag:c.querySelector(".kc-hud__ref-tag"),refNote:c.querySelector(".kc-hud__ref-note"),light:c.querySelector(".kc-hud__light"),camera:c.querySelector(".kc-hud__camera"),stats:c.querySelector(".kc-hud__stats"),budget:c.querySelector(".kc-hud__budget"),perf:c.querySelector(".kc-hud__perf"),gridBox:c.querySelector('[data-kc="grid"]'),refBox:c.querySelector('[data-kc="ref"]'),cameraRow:o.camera,lightRow:o.light,qualityRow:o.quality,cameraButtons:[],lightButtons:[],qualityButtons:[]}}const k=document.getElementById("kaocha-viewer");k&&k.dataset.site?C(k):w();
