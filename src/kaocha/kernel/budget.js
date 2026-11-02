// 性能预算与降级策略。
// 对应实施方案「LOD 与性能预算」一节：桌面单景点合计 ≤ 30 万三角面，移动端 ≤ 12 万。
// 三档画质由 URL 参数 ?q=high|mid|low 指定，未指定时按设备能力自动判定。
import * as THREE from 'three';

// 三档画质。texSize 传给 materials.js 决定程序化贴图边长；
// lodBias 为 LOD 距离缩放系数（>0 更早切换到低模，<0 则更晚）。
export const QUALITY = {
  high: {
    id: 'high',
    label: '高（桌面）',
    pixelRatioMax: 2.0,
    antialias: true,
    texSize: 512,
    anisotropy: 8,
    displacement: true,
    shadows: true,
    shadowMapSize: 2048,
    shadowRadius: 3,
    shadowCameraSize: 70,
    lodBias: -0.25,
    maxTriangles: 300000,
    maxDrawCalls: 250,
    targetFps: 60
  },
  mid: {
    id: 'mid',
    label: '中（移动端）',
    pixelRatioMax: 1.5,
    antialias: true,
    texSize: 512,
    anisotropy: 4,
    displacement: false,
    shadows: true,
    shadowMapSize: 1024,
    shadowRadius: 2,
    shadowCameraSize: 55,
    lodBias: 0.15,
    maxTriangles: 150000,
    maxDrawCalls: 160,
    targetFps: 45
  },
  low: {
    id: 'low',
    label: '低（降级）',
    pixelRatioMax: 1.0,
    antialias: false,
    texSize: 256,
    anisotropy: 2,
    displacement: false,
    shadows: false,
    shadowMapSize: 0,
    shadowRadius: 1,
    shadowCameraSize: 40,
    lodBias: 0.65,
    maxTriangles: 120000,
    maxDrawCalls: 120,
    targetFps: 30
  }
};

export const QUALITY_ORDER = ['low', 'mid', 'high'];

// 设备判定：粗指针 / 无 hover / 内存偏小 → 视为移动端，直接给 mid。
export function isMobileLike() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer:coarse)')?.matches ?? false;
  const touch = (navigator.maxTouchPoints ?? 0) > 1;
  const ua = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent ?? '');
  const memory = navigator.deviceMemory ?? 8;
  return (coarse && touch) || ua || memory <= 4;
}

// 解析画质：URL 参数优先，其次设备自动判定。
export function resolveQuality(param) {
  if (param && QUALITY[param]) return QUALITY[param];
  return QUALITY[isMobileLike() ? 'mid' : 'high'];
}

export function nextQualityDown(qualityId) {
  const i = QUALITY_ORDER.indexOf(qualityId);
  return i > 0 ? QUALITY[QUALITY_ORDER[i - 1]] : null;
}

// 渲染器档位：像素比上限、抗锯齿已在构造时确定，此处只管可动态改的部分。
export function applyRendererBudget(renderer, quality) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatioMax));
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = quality.shadows ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
  if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
}

// 太阳光阴影相机：按场景半径适配，避免阴影图浪费在空区域上。
export function configureShadow(light, quality, sceneRadius = 30) {
  if (!light || !quality.shadows) {
    if (light) light.castShadow = false;
    return;
  }
  light.castShadow = true;
  const size = Math.max(quality.shadowCameraSize, sceneRadius * 1.1);
  light.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  light.shadow.radius = quality.shadowRadius;
  light.shadow.bias = -0.0006;
  light.shadow.normalBias = 0.02;
  const cam = light.shadow.camera;
  cam.left = -size; cam.right = size;
  cam.top = size; cam.bottom = -size;
  cam.near = 0.5; cam.far = size * 4;
  cam.updateProjectionMatrix();
  if (light.shadow.map) {
    light.shadow.map.dispose();
    light.shadow.map = null;
  }
}

// 逐帧采样：环形缓冲求平均帧率，连续低于目标就降一档。
export function createPerfMonitor({ quality, sampleWindow = 90, onDegrade } = {}) {
  const samples = new Float32Array(sampleWindow);
  let index = 0;
  let filled = 0;
  let lowStreak = 0;
  let current = quality;
  let timer = 0;

  function step(dt) {
    samples[index] = dt;
    index = (index + 1) % sampleWindow;
    filled = Math.min(filled + 1, sampleWindow);
    timer += dt;
    if (timer < 1.0 || filled < sampleWindow) return null;

    timer = 0;
    let sum = 0;
    for (let i = 0; i < filled; i++) sum += samples[i];
    const avgDt = sum / filled;
    const fps = avgDt > 0 ? 1 / avgDt : 0;

    if (fps < current.targetFps * 0.72) {
      lowStreak += 1;
      if (lowStreak >= 2) {
        const next = nextQualityDown(current.id);
        lowStreak = 0;
        if (next) {
          current = next;
          onDegrade?.(next, fps);
          return next;
        }
      }
    } else {
      lowStreak = 0;
    }
    return null;
  }

  return {
    step,
    get quality() { return current; },
    setQuality(q) { current = q; lowStreak = 0; }
  };
}

// 读渲染器统计，供 HUD 显示并与预算比对。
export function readStats(renderer, quality) {
  const info = renderer.info.render;
  const triangles = info.triangles ?? 0;
  const calls = info.calls ?? 0;
  return {
    triangles,
    calls,
    trianglesOver: quality ? triangles > quality.maxTriangles : false,
    callsOver: quality ? calls > quality.maxDrawCalls : false
  };
}

// 暴露给 HUD 的预算文案。
export function budgetLine(quality) {
  if (!quality) return '';
  const tri = `${Math.round(quality.maxTriangles / 10000)}万面`;
  const shadow = quality.shadows ? `${quality.shadowMapSize}²阴影` : '无阴影';
  return `${quality.label} · 预算 ≤${tri} / ≤${quality.maxDrawCalls} calls · ${shadow}`;
}