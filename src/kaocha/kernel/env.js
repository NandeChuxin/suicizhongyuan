// 程序化天空 + 四套光照预设（零 HDR 素材依赖）。
// 流程：Canvas 绘制等距柱状投影（equirect）天空 → CanvasTexture →
//       PMREMGenerator.fromEquirectangular 生成环境贴图 → scene.environment（GI 近似）。
// 太阳方向、天空辉光、方向光位置三者共用同一套方位角/高度角换算，保证一致。
import * as THREE from 'three';
import { DEG } from './units.js';
import { makeTileableNoise2D, makeFbm, mulberry32 } from './noise.js';
import { configureShadow } from './budget.js';

const SKY_W = 1024;
const SKY_H = 512;

// 方位角约定：0° 指向 +X，90° 指向 +Z，逆时针为正。高度角 0° 为地平线。
export function sunDirection(azimuthDeg, elevationDeg) {
  const el = elevationDeg * DEG;
  const az = azimuthDeg * DEG;
  const cosEl = Math.cos(el);
  return new THREE.Vector3(
    cosEl * Math.cos(az),
    Math.sin(el),
    cosEl * Math.sin(az)
  ).normalize();
}

// 等距柱状 UV：与 three 的 equirectUv 实现保持一致，天空贴图与光照方向才对得上。
export function equirectUv(dir) {
  const u = Math.atan2(dir.z, dir.x) / (2 * Math.PI) + 0.5;
  const v = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) / Math.PI + 0.5;
  return { u: u - Math.floor(u), v };
}

// 四套预设。景德镇多雨，默认预设为 overcast（阴天漫射），结构辨识最清楚。
export const SKY_PRESETS = {
  overcast: {
    id: 'overcast',
    label: '阴天漫射（景德镇多雨）',
    // 天顶 → 地平 → 地面 的竖向渐变
    stops: [[0.00, '#8d9aa6'], [0.34, '#a9b3bd'], [0.50, '#c3c8cc'], [0.62, '#a9a49b'], [1.00, '#4d4f4a']],
    clouds: { count: 26, alpha: 0.30, color: '#e6e9ea', spread: 0.55 },
    stars: 0,
    sun: { azimuth: 118, elevation: 54, color: 0xdfe4e8, intensity: 1.15, glow: 0.30 },
    hemi: { sky: 0xc4ccd4, ground: 0x6a6455, intensity: 1.25 },
    ambient: { color: 0x9aa6b2, intensity: 0.20 },
    fog: { color: 0xb9c0c4, density: 0.0175 },
    exposure: 1.0,
    environmentIntensity: 1.0,
    points: { lantern: 0.35, kilnFire: 0.40, windowGlow: 0.25 },
    shadowSoftness: 1.0
  },
  dawn: {
    id: 'dawn',
    label: '清晨薄雾',
    stops: [[0.00, '#6f8db4'], [0.30, '#9fb3c8'], [0.50, '#e2d3bb'], [0.58, '#b8a894'], [1.00, '#4a4c45']],
    clouds: { count: 20, alpha: 0.26, color: '#f2dfc9', spread: 0.42 },
    stars: 0,
    sun: { azimuth: 96, elevation: 11, color: 0xffd9a8, intensity: 2.60, glow: 1.0 },
    hemi: { sky: 0xb9cde4, ground: 0x6b6353, intensity: 0.88 },
    ambient: { color: 0x93a7bd, intensity: 0.26 },
    fog: { color: 0xc7cfd2, density: 0.0125 },
    exposure: 1.02,
    environmentIntensity: 1.05,
    points: { lantern: 0.55, kilnFire: 0.35, windowGlow: 0.35 },
    shadowSoftness: 0.6
  },
  dusk: {
    id: 'dusk',
    label: '黄昏',
    stops: [[0.00, '#3f5680'], [0.30, '#7d7fa0'], [0.48, '#e39a58'], [0.56, '#b9714a'], [1.00, '#332c26']],
    clouds: { count: 22, alpha: 0.34, color: '#f0a468', spread: 0.48 },
    stars: 0,
    sun: { azimuth: 262, elevation: 9, color: 0xff9a4d, intensity: 2.20, glow: 1.15 },
    hemi: { sky: 0x8fa0c0, ground: 0x6a5a48, intensity: 0.72 },
    ambient: { color: 0x7c7f9c, intensity: 0.24 },
    fog: { color: 0xa08d84, density: 0.0160 },
    exposure: 1.05,
    environmentIntensity: 0.95,
    points: { lantern: 0.85, kilnFire: 0.75, windowGlow: 0.55 },
    shadowSoftness: 0.8
  },
  night: {
    id: 'night',
    label: '夜（月光 + 灯火 + 窑火）',
    stops: [[0.00, '#0a1220'], [0.40, '#152131'], [0.50, '#2b3644'], [0.62, '#20272c'], [1.00, '#0e1113']],
    clouds: { count: 14, alpha: 0.22, color: '#3c4a5c', spread: 0.40 },
    stars: 340,
    sun: { azimuth: 42, elevation: 34, color: 0xa8c0e0, intensity: 0.42, glow: 0.45 },
    hemi: { sky: 0x2b3a52, ground: 0x141a20, intensity: 0.38 },
    ambient: { color: 0x27364a, intensity: 0.18 },
    fog: { color: 0x111a24, density: 0.0195 },
    exposure: 1.18,
    environmentIntensity: 0.55,
    points: { lantern: 1.60, kilnFire: 1.90, windowGlow: 1.10 },
    shadowSoftness: 1.4
  }
};

export const LIGHT_IDS = ['overcast', 'dawn', 'dusk', 'night'];

export function getSkyPreset(id) {
  return SKY_PRESETS[id] ?? SKY_PRESETS.overcast;
}

// ---- 天空画布 ----
// 只用 fillRect 逐行铺渐变 + 若干径向渐变软云，避免逐像素循环，生成耗时可忽略。
export function buildSkyCanvas(preset) {
  const canvas = document.createElement('canvas');
  canvas.width = SKY_W; canvas.height = SKY_H;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, SKY_H);
  for (const [stop, color] of preset.stops) gradient.addColorStop(stop, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SKY_W, SKY_H);

  // 云层：只在天空中段，用噪声决定横向分布，保证左右无边缝。
  // 用椭圆软斑叠加，避免逐像素循环。
  const { clouds } = preset;
  if (clouds && clouds.count) {
    const noise = makeFbm(makeTileableNoise2D(97, 8), { octaves: 3, gain: 0.55 });
    const rng = mulberry32(20261007);
    ctx.save();
    for (let i = 0; i < clouds.count; i++) {
      const u = (noise(rng() * 8, rng() * 8) + 1) * 0.5;
      const x = u * SKY_W;
      const y = SKY_H * (0.12 + rng() * 0.30);
      const rx = SKY_W * (0.10 + rng() * 0.16);
      const ry = Math.max(8, rx * (0.16 + rng() * 0.18));
      const blob = ctx.createRadialGradient(x, y, 0, x, y, rx);
      blob.addColorStop(0, withAlpha(clouds.color, clouds.alpha));
      blob.addColorStop(0.55, withAlpha(clouds.color, clouds.alpha * 0.45));
      blob.addColorStop(1, withAlpha(clouds.color, 0));
      ctx.fillStyle = blob;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 星空（仅夜预设）：赤道以上随机点，亮度分两级。
  if (preset.stars) {
    const rng = mulberry32(4242);
    for (let i = 0; i < preset.stars; i++) {
      const x = rng() * SKY_W;
      const y = rng() * SKY_H * 0.5;
      const r = rng() < 0.85 ? 0.7 : 1.4;
      ctx.globalAlpha = 0.25 + rng() * 0.6;
      ctx.fillStyle = '#dfe8f5';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 太阳/月亮辉光：位置由方位角高度角反算，与方向光一致。
  const dir = sunDirection(preset.sun.azimuth, preset.sun.elevation);
  const { u, v } = equirectUv(dir);
  const sx = u * SKY_W;
  const sy = (1 - v) * SKY_H;
  const glowR = SKY_W * (0.10 + 0.22 * (preset.sun.glow ?? 0.5));
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
  glow.addColorStop(0, withAlpha(hexToCss(preset.sun.color), 0.85 * (preset.sun.glow ?? 0.5)));
  glow.addColorStop(0.22, withAlpha(hexToCss(preset.sun.color), 0.34 * (preset.sun.glow ?? 0.5)));
  glow.addColorStop(1, withAlpha(hexToCss(preset.sun.color), 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SKY_W, SKY_H);

  return canvas;
}

function hexToCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function withAlpha(css, alpha) {
  const value = Math.max(0, Math.min(1, alpha));
  if (css.startsWith('#')) {
    const hex = css.slice(1);
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${value})`;
  }
  return css;
}

export function buildSkyTexture(preset) {
  const texture = new THREE.CanvasTexture(buildSkyCanvas(preset));
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// ---- 光照骨架 ----
// 创造一次，之后 apply(lightId) 切预设；环境贴图按预设缓存，避免反复 PMREM。
export function createEnvironment({ scene, renderer, quality, lightId = 'overcast', sceneRadius = 30 }) {
  const group = new THREE.Group();
  group.name = 'kaocha-lights';
  scene.add(group);

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.name = 'sun';
  const sunTarget = new THREE.Object3D();
  group.add(sun, sunTarget);
  sun.target = sunTarget;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  hemi.name = 'hemi';
  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  ambient.name = 'ambient';
  group.add(hemi, ambient);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const skyCache = new Map();
  const envCache = new Map();
  const roleLights = new Map();
  let currentPreset = getSkyPreset(lightId);
  let currentQuality = quality;

  function cachedSky(id) {
    if (!skyCache.has(id)) skyCache.set(id, buildSkyTexture(getSkyPreset(id)));
    return skyCache.get(id);
  }

  function cachedEnv(id) {
    if (!envCache.has(id)) {
      const target = pmrem.fromEquirectangular(cachedSky(id));
      envCache.set(id, target.texture);
    }
    return envCache.get(id);
  }

  function apply(nextLightId) {
    const preset = getSkyPreset(nextLightId);
    currentPreset = preset;

    scene.background = cachedSky(preset.id);
    scene.backgroundIntensity = 1;
    if ('environmentIntensity' in scene) scene.environmentIntensity = preset.environmentIntensity ?? 1;
    scene.environment = cachedEnv(preset.id);

    scene.fog = new THREE.FogExp2(preset.fog.color, preset.fog.density);

    const dir = sunDirection(preset.sun.azimuth, preset.sun.elevation);
    const distance = Math.max(60, sceneRadius * 3);
    sun.position.copy(dir).multiplyScalar(distance);
    sunTarget.position.set(0, 0, 0);
    sun.color.setHex(preset.sun.color);
    sun.intensity = preset.sun.intensity;

    hemi.color.setHex(preset.hemi.sky);
    hemi.groundColor.setHex(preset.hemi.ground);
    hemi.intensity = preset.hemi.intensity;

    ambient.color.setHex(preset.ambient.color);
    ambient.intensity = preset.ambient.intensity;

    renderer.toneMappingExposure = preset.exposure;

    // 角色点光强度随预设变化（灯笼 / 窑火 / 窗内暖光）
    for (const [role, light] of roleLights) {
      const value = preset.points[role] ?? 0;
      light.intensity = value * light.userData.baseIntensity;
      light.visible = value > 0.02;
    }

    if (currentQuality) configureShadow(sun, { ...currentQuality, shadowRadius: currentQuality.shadowRadius * (preset.shadowSoftness ?? 1) }, sceneRadius);
    return preset;
  }

  // 角色点光：位置由景点场景给出（灯笼、窑门火膛、窗内暖光）。
  function addRoleLight(role, position, { color, baseIntensity = 6, distance = 14, decay = 1.6 } = {}) {
    const preset = currentPreset.points[role] !== undefined ? currentPreset : SKY_PRESETS.night;
    const defaults = {
      lantern: 0xffb066,
      kilnFire: 0xff7a26,
      windowGlow: 0xffc07a
    };
    const light = new THREE.PointLight(color ?? defaults[role] ?? 0xffcc88, 0, distance, decay);
    light.position.copy(position);
    light.userData = { role, baseIntensity };
    light.intensity = (preset.points[role] ?? 0) * baseIntensity;
    light.visible = light.intensity > 0.02;
    roleLights.set(role + '@' + roleLights.size, light);
    group.add(light);
    return light;
  }

  function setQuality(next) {
    currentQuality = next;
    apply(currentPreset.id);
  }

  function dispose() {
    for (const texture of skyCache.values()) texture.dispose();
    for (const texture of envCache.values()) texture.dispose();
    skyCache.clear();
    envCache.clear();
    roleLights.clear();
    pmrem.dispose();
    scene.remove(group);
    group.traverse(node => { if (node.isLight) node.dispose?.(); });
  }

  apply(currentPreset.id);

  return {
    apply,
    setQuality,
    addRoleLight,
    dispose,
    sun,
    hemi,
    ambient,
    group,
    get preset() { return currentPreset; },
    get lightId() { return currentPreset.id; }
  };
}