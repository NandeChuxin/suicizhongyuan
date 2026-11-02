// 《碎瓷重圆》「考察」阶段：把写实 3D 景点模块接入终局。
// 三处考察点与三处写实景点一一对应（御窑厂 / 古窑 / 陶溪川）；
// 相机、光照、画质、构件溯源由 scene-host 提供，控制台在此生成。修满 2 / 4 / 6 件依次开放。
import * as THREE from 'three';
import { gsap } from 'gsap';
import { LOCATIONS, VESSELS } from '../data/vessels.js';
import { createSceneHost, LIGHT_IDS, getSkyPreset } from '../kaocha/scene-host.js';
import { getSite } from '../kaocha/data/sites.js';
import { quotesBySite } from '../data/quotes.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createFieldwork({ container, noteLayer, consoleHost, audio, onArrive }) {
  let host = null;
  let currentStop = -1;
  let moving = false;
  let running = false;
  let activeSiteId = null;
  let console_ = null;
  let gyroBase = null;

  function ensureHost() {
    if (host) return host;
    host = createSceneHost({
      host: container,
      siteIds: LOCATIONS.map(loc => loc.site),
      showScale: false,
      hooks: {
        onCamera: () => refreshConsole(),
        onLight: () => refreshConsole(),
        onQuality: () => refreshConsole(),
        onComponent: info => renderSource(info),
        onStats: stats => renderStats(stats)
      }
    });
    console_ = buildConsole(consoleHost, host);
    if (noteLayer) noteLayer.onclick = () => hideNote();
    return host;
  }

  // ------------------------------------------------------------ 控制台
  function buildConsole(rootEl, controller) {
    if (!rootEl) return null;
    rootEl.innerHTML = `
      <div class="fw-row"><span class="fw-label">景点</span><span class="fw-btns" data-row="site"></span></div>
      <div class="fw-row"><span class="fw-label">机位</span><span class="fw-btns" data-row="camera"></span></div>
      <div class="fw-row"><span class="fw-label">光照</span><span class="fw-btns" data-row="light"></span></div>
      <div class="fw-row"><span class="fw-label">画质</span><span class="fw-btns" data-row="quality"></span></div>
      <p class="fw-source">当前构件：—（对准建筑即可读取溯源）</p>
      <p class="fw-stats"></p>`;
    const rows = {
      site: rootEl.querySelector('[data-row="site"]'),
      camera: rootEl.querySelector('[data-row="camera"]'),
      light: rootEl.querySelector('[data-row="light"]'),
      quality: rootEl.querySelector('[data-row="quality"]')
    };

    LOCATIONS.forEach((loc, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fw-btn';
      btn.dataset.site = loc.site;
      btn.textContent = loc.name;
      btn.addEventListener('click', () => travel(i));
      rows.site.append(btn);
    });
    LIGHT_IDS.forEach(id => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fw-btn';
      btn.textContent = getSkyPreset(id).label.split('（')[0];
      btn.addEventListener('click', () => controller.setLight(id));
      rows.light.append(btn);
    });
    ['high', 'mid', 'low'].forEach(q => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fw-btn';
      btn.textContent = q;
      btn.addEventListener('click', () => controller.setQuality(q));
      rows.quality.append(btn);
    });

    return {
      root: rootEl,
      rows,
      cameraButtons: [],
      source: rootEl.querySelector('.fw-source'),
      stats: rootEl.querySelector('.fw-stats')
    };
  }

  function refreshConsole() {
    if (!console_ || !host) return;
    const site = getSite(activeSiteId);
    if (!site) return;
    // 景点按钮
    console_.rows.site.querySelectorAll('.fw-btn').forEach(b => {
      b.classList.toggle('is-active', b.dataset.site === activeSiteId);
    });
    // 机位按钮（随景点重建）
    const camRow = console_.rows.camera;
    camRow.innerHTML = '';
    console_.cameraButtons = site.cameras.map((cam, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fw-btn';
      btn.textContent = cam.label.split('（')[0];
      btn.title = `${cam.label} · 对照 ${cam.ref}`;
      btn.addEventListener('click', () => host.gotoCamera(i));
      camRow.append(btn);
      return btn;
    });
    const current = host.activeEntry?.siteScene.cameras;
    const mi = current?.findIndex(c => Math.abs(c.position[0] - host.camera.position.x) < 0.01
      && Math.abs(c.position[2] - host.camera.position.z) < 0.01);
    console_.cameraButtons.forEach((b, i) => b.classList.toggle('is-active', i === mi));
    // 光照 / 画质
    console_.rows.light.querySelectorAll('.fw-btn').forEach((b, i) => b.classList.toggle('is-active', LIGHT_IDS[i] === host.lightId));
    const qid = host.stats().quality;
    console_.rows.quality.querySelectorAll('.fw-btn').forEach((b, i) => b.classList.toggle('is-active', ['high', 'mid', 'low'][i] === qid));
  }

  function renderSource(info) {
    if (!console_) return;
    console_.source.textContent = info.name
      ? `当前构件：${info.name}｜依据参考图：${info.source?.join(' · ') || '—'}（${info.confidence}）`
      : '当前构件：—（对准建筑即可读取溯源）';
  }

  function renderStats(stats) {
    if (!console_) return;
    console_.stats.textContent =
      `${stats.fps} fps · 画面 ${(stats.triangles / 1000).toFixed(1)}k 面 · ${stats.calls} draw calls · LOD ${stats.lod} · ${stats.budget}`;
  }

  // ------------------------------------------------------------ 站点
  // 手记卡展开期间给 body 挂 tour-note-open：控制台折叠为标题条、提示让位，杜绝双卡叠字（v4）。
  function hideNote() {
    if (noteLayer) noteLayer.hidden = true;
    document.body.classList.remove('tour-note-open');
  }

  function showNote(loc, index) {
    if (!noteLayer) return;
    const names = VESSELS.filter(v => v.location === loc.id).map(v => v.name);
    const quotes = quotesBySite(loc.id);
    noteLayer.innerHTML = `
      <article class="tour-note glass">
        <span class="overline">FIELD NOTES / ${String(index + 1).padStart(2, '0')} · ${loc.timeLabel}</span>
        <h2>${loc.name}</h2>
        <p class="tour-note-text">${loc.note}</p>
        ${names.length ? `<p class="small-note">此处修复的器物 · ${names.join(' / ')}</p>` : ''}
        ${quotes.length ? `<div class="note-quotes"><span class="overline">传承资料摘记 · 已核实</span>${quotes.map(q => `<blockquote>${q.quoteType === 'verbatim' ? q.text : '<i>根据相关资料概括：</i>' + q.text}<cite>${[q.speakerRole ? `资料方：${q.speaker}（${q.speakerRole}）` : `资料方：${q.speaker}`, q.url ? `<a href="${q.url}" target="_blank" rel="noopener noreferrer">${q.sourceTitle} ↗</a>` : q.sourceTitle, q.accessedAt ? `登记于 ${q.accessedAt}` : ''].filter(Boolean).join(' · ')}</cite></blockquote>`).join('')}</div>` : ''}
        <p class="small-note">点击手记收起</p>
      </article>`;
    noteLayer.hidden = false;
    document.body.classList.add('tour-note-open');
    gsap.fromTo(noteLayer.querySelector('.tour-note'), { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: .7, ease: 'power3.out' });
  }

  function arrive(index) {
    const loc = LOCATIONS[index];
    currentStop = index;
    moving = false;
    audio?.ambient?.(loc.ambient);
    showNote(loc, index);
    refreshConsole();
    onArrive?.(index, loc);
  }

  function applyPlan(index) {
    const loc = LOCATIONS[index];
    if (activeSiteId !== loc.site) {
      host.setSite(loc.site, { cameraIndex: loc.camera });
      activeSiteId = loc.site;
    } else {
      host.gotoCamera(loc.camera);
    }
    refreshConsole();
  }

  function travel(index) {
    ensureHost();
    index = Math.max(0, Math.min(LOCATIONS.length - 1, index | 0));
    if (index === currentStop || moving) return;
    moving = true;
    hideNote();
    if (reduce) { applyPlan(index); arrive(index); return; }
    gsap.to(container, {
      opacity: 0, duration: .28, ease: 'power2.in',
      onComplete: () => {
        applyPlan(index);
        gsap.to(container, { opacity: 1, duration: .34, ease: 'power2.out' });
        arrive(index);
      }
    });
  }

  function enter(startIndex = 0) {
    ensureHost();
    running = true;
    host.start();
    host.resize();
    const index = Math.max(0, Math.min(LOCATIONS.length - 1, startIndex | 0));
    if (currentStop < 0) {
      applyPlan(index);
      arrive(index);
    } else if (index !== currentStop) {
      // currentStop 已设过：直接切到目标站（避免与 moving 冲突）
      moving = false;
      applyPlan(index);
      arrive(index);
    }
  }

  function leave() {
    running = false;
    host?.stop();
    hideNote();
    gsap.killTweensOf(container);
    gsap.killTweensOf(noteLayer?.querySelector('.tour-note') ?? {});
    if (container) container.style.opacity = '1';
    audio?.quiet?.();
  }

  function dispose() {
    leave();
    host?.dispose();
    host = null;
    if (console_) console_.root.innerHTML = '';
  }

  // 手机倾斜视线：把 deviceorientation 映射为相机绕目标的方位 / 俯仰偏移。
  function onGyro(e) {
    if (e.gamma == null || !host) return;
    const controls = host.controls;
    const camera = host.camera;
    if (!gyroBase) {
      const offset = camera.position.clone().sub(controls.target);
      gyroBase = new THREE.Spherical().setFromVector3(offset);
    }
    const s = gyroBase.clone();
    s.theta = gyroBase.theta - THREE.MathUtils.clamp(e.gamma / 45, -1, 1) * 0.8;
    s.phi = THREE.MathUtils.clamp(gyroBase.phi - THREE.MathUtils.clamp((e.beta ?? 45) / 90, -1, 1) * 0.4, 0.18, Math.PI * 0.495);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
    controls.update();
  }

  function enableGyro() {
    gyroBase = null;
    window.addEventListener('deviceorientation', onGyro);
  }

  return {
    enter, leave, travel, dispose,
    enableGyro,
    get moving() { return moving; },
    get currentStop() { return currentStop; },
    get site() { return host?.activeSite ?? null; },
    setCompleted() { /* 场景内不再陈列器物，保留接口以兼容调用方 */ }
  };
}