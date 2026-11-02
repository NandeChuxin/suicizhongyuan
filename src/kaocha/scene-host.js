// 可挂载的写实场景宿主：把原先写在 main.js 页面壳里的渲染逻辑抽出来，
// 既供独立预览页（kaocha.html / kaocha-*.html）使用，也供《碎瓷重圆》「考察」阶段复用。
//
// 资源分配：一个 renderer / camera / OrbitControls / 材质库 / LOD 管理器；
// 每个景点各自持有 Scene + Environment（天空、雾、太阳、角色点光随景点微调），
// 切换景点只切可见的 Scene，互不污染，draw calls 只统计当前可见场景。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createMaterialLibrary } from './kernel/materials.js';
import { createEnvironment, LIGHT_IDS, getSkyPreset } from './kernel/env.js';
import { createLODManager, countTriangles } from './kernel/lod.js';
import {
  applyRendererBudget, createPerfMonitor, readStats, budgetLine, resolveQuality
} from './kernel/budget.js';
import { humanSilhouette } from './kernel/parts.js';
import { getSite, componentSource } from './data/sites.js';
import { createYuyaoScene } from './sites/yuyao.js';
import { createGuyaoScene } from './sites/guyao.js';
import { createTaoxichuanScene } from './sites/taoxichuan.js';

export { LIGHT_IDS, getSkyPreset, budgetLine };

const FACTORIES = {
  yuyao: createYuyaoScene,
  guyao: createGuyaoScene,
  taoxichuan: createTaoxichuanScene
};

export function createSceneHost({
  host,
  siteIds = ['yuyao', 'guyao', 'taoxichuan'],
  quality: qualityParam,
  lightId: lightParam = 'overcast',
  showScale = false,
  autoDegrade = true,
  hooks = {}
} = {}) {
  const ids = siteIds.filter(id => FACTORIES[id]);
  let quality = resolveQuality(qualityParam);
  let lightId = LIGHT_IDS.includes(lightParam) ? lightParam : 'overcast';
  const gridOn = showScale;
  const refOn = showScale;

  const renderer = new THREE.WebGLRenderer({ antialias: quality.antialias, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  applyRendererBudget(renderer, quality);
  renderer.domElement.setAttribute('aria-label', '景德镇景点写实 3D 考察视图：拖动旋转，对准建筑可读取构件溯源');
  host.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 3000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.495;

  const library = createMaterialLibrary({ size: quality.texSize, quality: quality.id });
  const lodManager = createLODManager({ bias: quality.lodBias });

  const entries = new Map();
  let active = null;
  let running = false;
  let disposed = false;
  let raf = 0;
  let last = 0;
  let fpsSmooth = 60;
  let hudTimer = 0;
  let pickTimer = 0;
  let currentComponent = null;

  const raycaster = new THREE.Raycaster();
  const pickCenter = new THREE.Vector2(0, 0);

  // ---------------------------------------------------------------- 景点
  function createEntry(id) {
    const site = getSite(id);
    if (!site) return null;
    const scene = new THREE.Scene();
    const sceneRadius = Math.max(site.ground.width, site.ground.depth) * 0.34;
    const environment = createEnvironment({ scene, renderer, quality, lightId, sceneRadius });
    const siteScene = FACTORIES[id]({ library, environment, quality, lodManager });
    scene.add(siteScene.root);

    // 尺度参照：1 m 网格 + 1.70 m 人物剪影（技术预览用于直接判读比例）
    const scaleGroup = new THREE.Group();
    scaleGroup.name = '尺度参照';
    const grid = new THREE.GridHelper(400, 400, 0x2c4a7c, 0x8a8f86);
    grid.material.transparent = true;
    grid.material.opacity = 0.28;
    grid.position.y = 0.03;
    scaleGroup.add(grid);
    const silhouette = humanSilhouette(1.70);
    silhouette.position.set(siteScene.focus.x + 8, 0, siteScene.focus.z + 14);
    silhouette.rotation.y = -0.6;
    scaleGroup.add(silhouette);
    scaleGroup.visible = gridOn || refOn;
    grid.visible = gridOn;
    silhouette.visible = refOn;
    scene.add(scaleGroup);

    const entry = {
      id, site, scene, environment, siteScene, scaleGroup, grid, silhouette,
      totalTriangles: countTriangles(siteScene.root)
    };
    entries.set(id, entry);
    return entry;
  }

  // 光照预设 + 景点本地大气修正（雾更浓/更淡、环境光更强/更弱）。
  function applyLightTo(entry, id) {
    entry.environment.apply(id);
    if (entry.scene.fog) entry.scene.fog.density *= entry.site.atmosphere.fogScale;
    if ('environmentIntensity' in entry.scene) entry.scene.environmentIntensity *= entry.site.atmosphere.environmentScale;
  }

  function setSite(id, { cameraIndex = 0 } = {}) {
    if (!ids.includes(id)) return null;
    const entry = entries.get(id) ?? createEntry(id);
    if (!entry) return null;
    active = entry;
    currentComponent = null;
    applyLightTo(entry, lightId);
    library.adjustForLight(lightId);
    controls.target.copy(entry.siteScene.focus);
    gotoCamera(cameraIndex);
    hooks.onSite?.(entry.site, entry);
    return entry;
  }

  function gotoCamera(index) {
    const cam = active?.siteScene.cameras[index];
    if (!cam) return;
    camera.position.set(...cam.position);
    controls.target.set(...cam.target);
    controls.update();
    hooks.onCamera?.(cam, index, active.site, active);
  }

  function setLight(id) {
    if (!LIGHT_IDS.includes(id)) return;
    lightId = id;
    for (const entry of entries.values()) applyLightTo(entry, id);
    library.adjustForLight(id);
    hooks.onLight?.(id, getSkyPreset(id));
  }

  function setQualityById(id) {
    const next = resolveQuality(id);
    quality = next;
    applyRendererBudget(renderer, next);
    for (const entry of entries.values()) { entry.environment.setQuality(next); applyLightTo(entry, lightId); }
    lodManager.setBias(next.lodBias);
    perf?.setQuality?.(next);
    hooks.onQuality?.(next);
  }

  function setGrid(visible) {
    if (!active) return;
    active.grid.visible = visible;
    active.scaleGroup.visible = active.grid.visible || active.silhouette.visible;
  }

  function setRef(visible) {
    if (!active) return;
    active.silhouette.visible = visible;
    active.scaleGroup.visible = active.grid.visible || active.silhouette.visible;
  }

  // ------------------------------------------------------------ 构件溯源
  function pickComponent() {
    if (!active) return;
    raycaster.setFromCamera(pickCenter, camera);
    const hits = raycaster.intersectObject(active.siteScene.root, true);
    let found = null;
    for (const hit of hits) {
      let node = hit.object;
      while (node && !node.userData.component) node = node.parent;
      if (node?.userData.component) { found = node.userData.component; break; }
    }
    if (found === currentComponent) return;
    currentComponent = found;
    hooks.onComponent?.(componentSource(active.site, found), found, active.site);
  }

  function stats() {
    const base = active ? readStats(renderer, quality) : { triangles: 0, calls: 0, trianglesOver: false, callsOver: false };
    return {
      site: active?.id ?? null,
      fps: Math.round(fpsSmooth),
      totalTriangles: active?.totalTriangles ?? 0,
      lod: lodManager.tier ?? 'auto',
      budget: budgetLine(quality),
      quality: quality.id,
      light: lightId,
      ...base
    };
  }

  // ---------------------------------------------------------------- 循环
  function frame(now) {
    if (!running || disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    fpsSmooth = fpsSmooth * 0.9 + (1 / Math.max(dt, 1e-4)) * 0.1;
    controls.update();
    lodManager.update(camera);
    if (active) renderer.render(active.scene, camera);
    perf?.step(dt);

    hudTimer += dt;
    if (hudTimer >= 0.3) { hudTimer = 0; hooks.onStats?.(stats()); }
    pickTimer += dt;
    if (pickTimer >= 0.25) { pickTimer = 0; pickComponent(); }
  }

  function start() {
    if (disposed || running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);

  const perf = autoDegrade
    ? createPerfMonitor({
      quality,
      onDegrade(next) {
        setQualityById(next.id);
        hooks.onStats?.(stats());
        hooks.onDegrade?.(next);
      }
    })
    : null;

  function dispose() {
    disposed = true;
    stop();
    observer.disconnect();
    controls.dispose();
    for (const entry of entries.values()) {
      entry.siteScene.dispose?.();
      entry.environment.dispose?.();
    }
    entries.clear();
    library.dispose();
    lodManager.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    active = null;
  }

  return {
    start, stop, resize, dispose, stats,
    setSite, setLight, setQuality: setQualityById, setGrid, setRef,
    gotoCamera,
    get tiers() { return lodManager; },
    lockTier(tier) { lodManager.setTier(tier); },
    get camera() { return camera; },
    get controls() { return controls; },
    get activeSite() { return active?.site ?? null; },
    get activeEntry() { return active; },
    get siteIds() { return [...ids]; },
    get lightId() { return lightId; }
  };
}