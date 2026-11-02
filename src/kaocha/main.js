// 独立预览页外壳：装配 HUD，复用 scene-host 的渲染宿主，绑定机位 / 光照 / 画质 / 溯源。
// URL 参数：?site=yuyao|guyao|taoxichuan 、?light=overcast|dawn|dusk|night 、?q=high|mid|low 、
//          ?tier=near|mid|far（锁 LOD 档）、?grid=0 、?ref=0
import './kaocha.css';
import { createSceneHost, LIGHT_IDS, getSkyPreset, budgetLine } from './scene-host.js';
import { SITES, SITE_ORDER, getSite, CONFIDENCE_TAG } from './data/sites.js';

const params = new URLSearchParams(location.search);

// ======================================================================
// 总览页（无 data-site）：只渲染三张卡片
// ======================================================================
function buildOverview() {
  const list = document.getElementById('kaocha-overview');
  if (!list) return;
  list.innerHTML = SITE_ORDER.map(id => {
    const s = SITES[id];
    return `
      <li class="kc-card">
        <a class="kc-card__link" href="./${s.html}">
          <span class="kc-card__kicker">${s.refDir}</span>
          <h2 class="kc-card__title">${s.name}</h2>
          <p class="kc-card__sub">${s.subtitle}</p>
          <p class="kc-card__meta">参考图 ${s.refCount} 张 · 构件 ${s.components.length} 项 · 尺度锚点 ${s.anchors.length} 条</p>
          <span class="kc-card__cta">进入写实预览 →</span>
        </a>
      </li>`;
  }).join('');
}

// ======================================================================
// 单景点预览
// ======================================================================
function bootViewer(host) {
  const site = getSite(params.get('site') || host.dataset.site);
  if (!site) {
    host.textContent = `未知景点：${host.dataset.site}`;
    return;
  }

  const hud = createHud(site);

  const showGrid = params.get('grid') !== '0';
  const showRef = params.get('ref') !== '0';
  hud.gridBox.checked = showGrid;
  hud.refBox.checked = showRef;

  const controller = createSceneHost({
    host,
    siteIds: [site.id],
    quality: params.get('q'),
    lightId: LIGHT_IDS.includes(params.get('light')) ? params.get('light') : 'overcast',
    showScale: true,
    hooks: {
      onCamera(cam, index) {
        hud.camera.textContent = `机位：${cam.label}（对照 ${cam.ref}）`;
        setActive(hud.cameraButtons, index);
      },
      onLight(id, preset) {
        hud.light.textContent = `光照：${preset.label}`;
        setActive(hud.lightButtons, LIGHT_IDS.indexOf(id));
      },
      onQuality(next) {
        setActive(hud.qualityButtons, ['high', 'mid', 'low'].indexOf(next.id));
        hud.budget.textContent = budgetLine(next);
      },
      onComponent(info) {
        hud.refName.textContent = info.name ? `当前构件：${info.name}` : '当前构件：—（对准建筑即可读取溯源）';
        hud.refSrc.textContent = info.source?.length ? `依据参考图：${info.source.join(' · ')}` : '依据参考图：—';
        hud.refTag.textContent = info.name ? `${info.tag} · ${info.confidence}` : '';
        hud.refTag.dataset.confidence = info.confidence ?? '';
        hud.refNote.textContent = info.note ?? '';
      },
      onStats(stats) {
        hud.stats.textContent =
          `${stats.fps} fps · 画面 ${(stats.triangles / 1000).toFixed(1)}k 面 / 场景合计 ${(stats.totalTriangles / 1000).toFixed(1)}k 面 · ${stats.calls} draw calls · LOD ${stats.lod}`;
        hud.stats.dataset.over = stats.trianglesOver || stats.callsOver ? '1' : '0';
        hud.budget.textContent = stats.budget;
      },
      onDegrade(next) {
        hud.perf.textContent = `帧率不足，已自动降级到 ${next.label}`;
      }
    }
  });

  function setActive(buttons, index) {
    buttons.forEach((b, i) => b.classList.toggle('is-active', i === index));
  }

  // ---- 预设机位 / 光照 / 画质按钮 ----
  site.cameras.forEach((cam, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kc-btn';
    btn.textContent = cam.label.split('（')[0];
    btn.title = `${cam.label} · 对照 ${cam.ref}`;
    btn.addEventListener('click', () => controller.gotoCamera(i));
    hud.cameraButtons.push(btn);
    hud.cameraRow.appendChild(btn);
  });
  LIGHT_IDS.forEach(id => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kc-btn';
    btn.textContent = getSkyPreset(id).label.split('（')[0];
    btn.addEventListener('click', () => controller.setLight(id));
    hud.lightButtons.push(btn);
    hud.lightRow.appendChild(btn);
  });
  ['high', 'mid', 'low'].forEach(q => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kc-btn';
    btn.textContent = q;
    btn.addEventListener('click', () => controller.setQuality(q));
    hud.qualityButtons.push(btn);
    hud.qualityRow.appendChild(btn);
  });

  hud.gridBox.addEventListener('change', () => controller.setGrid(hud.gridBox.checked));
  hud.refBox.addEventListener('change', () => controller.setRef(hud.refBox.checked));

  // 手动锁 LOD 档（HUD 校验用）
  const tierParam = params.get('tier');
  if (tierParam) controller.lockTier(tierParam);

  const entry = controller.setSite(site.id, { cameraIndex: 0 });
  controller.setGrid(showGrid);
  controller.setRef(showRef);
  controller.setLight(controller.lightId);
  hud.budget.textContent = controller.stats().budget;
  controller.resize();
  controller.start();

  window.addEventListener('pagehide', () => controller.dispose(), { once: true });

  host.dataset.ready = '1';
  window.__kaocha = {
    stats: () => controller.stats(),
    setCamera: controller.gotoCamera,
    setLight: controller.setLight,
    setQuality: controller.setQuality,
    siteScene: entry?.siteScene
  };
}

// ======================================================================
// HUD DOM（各页面无重复标记，统一在此生成）
// ======================================================================
function createHud(site) {
  const hud = document.createElement('div');
  hud.className = 'kc-hud';
  hud.innerHTML = `
    <div class="kc-hud__head">
      <div>
        <p class="kc-hud__kicker">景德镇景点考察 · 写实 3D</p>
        <h1 class="kc-hud__title">${site.name}</h1>
        <p class="kc-hud__sub">${site.subtitle}</p>
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
      <summary>真实尺寸锚点（${site.anchors.length} 条）</summary>
      <ul>
        ${site.anchors.map(a => `<li><b>${a.label}</b>：${a.value} <span class="kc-tag kc-tag--${a.basis}">${CONFIDENCE_TAG[a.basis]}</span></li>`).join('')}
      </ul>
    </details>
    <p class="kc-hud__foot">参考照片版权归原景区 / 媒体与摄影师所有，仅用于定比例与校轮廓，不作公开页面底图。</p>
  `;
  document.body.appendChild(hud);

  const rowsHost = hud.querySelector('.kc-hud__rows');
  const rowDefs = [
    ['预设机位', 'camera'],
    ['光照预设', 'light'],
    ['画质档', 'quality']
  ];
  const rows = {};
  for (const [label, key] of rowDefs) {
    const row = document.createElement('div');
    row.className = 'kc-hud__row';
    row.innerHTML = `<span class="kc-hud__rowlabel">${label}</span>`;
    const inner = document.createElement('span');
    inner.className = 'kc-hud__btnrow';
    row.appendChild(inner);
    rowsHost.appendChild(row);
    rows[key] = inner;
  }

  return {
    root: hud,
    refName: hud.querySelector('.kc-hud__ref-name'),
    refSrc: hud.querySelector('.kc-hud__ref-src'),
    refTag: hud.querySelector('.kc-hud__ref-tag'),
    refNote: hud.querySelector('.kc-hud__ref-note'),
    light: hud.querySelector('.kc-hud__light'),
    camera: hud.querySelector('.kc-hud__camera'),
    stats: hud.querySelector('.kc-hud__stats'),
    budget: hud.querySelector('.kc-hud__budget'),
    perf: hud.querySelector('.kc-hud__perf'),
    gridBox: hud.querySelector('[data-kc="grid"]'),
    refBox: hud.querySelector('[data-kc="ref"]'),
    cameraRow: rows.camera,
    lightRow: rows.light,
    qualityRow: rows.quality,
    cameraButtons: [],
    lightButtons: [],
    qualityButtons: []
  };
}

// ======================================================================
const viewerHost = document.getElementById('kaocha-viewer');
if (viewerHost && viewerHost.dataset.site) bootViewer(viewerHost);
else buildOverview();