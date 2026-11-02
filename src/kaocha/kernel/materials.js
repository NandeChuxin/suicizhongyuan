// 程序化 PBR 材质库。
// 统一约定：几何体 UV 以**米**铺设；贴图的 repeat 已在生成时设为 1/tileU、1/tileV，
// 因此同一个表面贴图可以被任意大小的墙体/屋面复用，砖瓦尺寸恒定落在真实值上。
// AO / 粗糙度 / 金属度打包在同一张 ormMap 的三个通道（R/G/B），与 glTF 的 ORM 约定一致。
import * as THREE from 'three';
import { generateSurface, SURFACES, DEFAULT_SIZE } from './procTextures.js';

// 贴图化表面预设。normalScale 越大凹凸越强，用在近景构件上。
const TEXTURED = {
  qingBrick: { surface: 'brick', seed: 101, normalScale: 0.85, tag: '青砖（清水砖墙）' },
  qingBrickWorn: { surface: 'oldBrick', seed: 137, normalScale: 1.10, tag: '老青砖（旧料）' },
  redBrick: { surface: 'redBrick', seed: 211, normalScale: 0.90, tag: '红砖（厂房/烟囱）' },
  kilnBrick: { surface: 'kilnBrick', seed: 307, normalScale: 0.95, tag: '窑砖（窑室/窑房）' },
  roofTile: { surface: 'roofTile', seed: 401, normalScale: 1.15, tag: '灰瓦（小青瓦）' },
  wood: { surface: 'wood', seed: 503, normalScale: 0.80, tag: '木材（梁柱/门窗）' },
  darkWood: { surface: 'darkWood', seed: 521, normalScale: 0.80, tag: '深色木（门罩）' },
  stone: { surface: 'stone', seed: 601, normalScale: 0.95, tag: '石板' },
  stoneStep: { surface: 'stoneStep', seed: 617, normalScale: 1.00, tag: '石阶/踏跺' },
  plaster: { surface: 'plaster', seed: 701, normalScale: 0.55, tag: '粉墙（白墙）' },
  rammedEarth: { surface: 'rammedEarth', seed: 809, normalScale: 1.05, tag: '夯土（窑背）' },
  weatherSteel: { surface: 'iron', seed: 907, normalScale: 0.90, tag: '耐候钢（锈红景墙）' },
  castIron: { surface: 'iron', seed: 919, normalScale: 0.75, tag: '铸铁' },
  steel: { surface: 'steel', seed: 1009, normalScale: 0.60, tag: '钢材（钢构门架/桁架）' },
  cobble: { surface: 'cobble', seed: 1103, normalScale: 1.20, tag: '卵石铺底（镜面水池底）' },
  porcelainInlay: { surface: 'porcelainInlay', seed: 1117, normalScale: 1.25, tag: '碎瓷片镶嵌' },
  ground: { surface: 'ground', seed: 1201, normalScale: 0.70, tag: '场地素土' }
};

// 自发光角色 → 四套光照预设下的强度。用于窑火、灯笼、锯齿屋顶发光面板。
const EMISSIVE_ROLES = {
  glazing: { dawn: 0.12, overcast: 0.08, dusk: 0.85, night: 1.70 },
  kilnFire: { dawn: 0.25, overcast: 0.20, dusk: 0.75, night: 1.90 },
  lantern: { dawn: 0.05, overcast: 0.10, dusk: 0.85, night: 1.60 },
  windowGlow: { dawn: 0.02, overcast: 0.06, dusk: 0.55, night: 1.10 }
};

export function createMaterialLibrary({ size = DEFAULT_SIZE, quality = 'high' } = {}) {
  const texSize = quality === 'low' ? Math.min(size, 256) : quality === 'mid' ? Math.min(size, 512) : size;
  const useDisplacement = quality === 'high';

  const surfaceCache = new Map();
  const materialCache = new Map();
  const emissiveMaterials = [];

  function getSurface(surfaceKind, seed) {
    const key = `${surfaceKind}|${texSize}|${seed}`;
    if (!surfaceCache.has(key)) {
      surfaceCache.set(key, generateSurface(surfaceKind, { size: texSize, seed }));
    }
    return surfaceCache.get(key);
  }

  function makeTexturedMaterial(id) {
    const preset = TEXTURED[id];
    const surf = getSurface(preset.surface, preset.seed);
    const material = new THREE.MeshStandardMaterial({
      name: id,
      map: surf.map,
      normalMap: surf.normalMap,
      // ORM 三通道一张图：AO=R、粗糙度=G、金属度=B
      aoMap: surf.ormMap,
      roughnessMap: surf.ormMap,
      metalnessMap: surf.ormMap,
      // 设为 1，让贴图完全决定粗糙度与金属度
      roughness: 1,
      metalness: 1,
      aoMapIntensity: 1.0
    });
    material.normalScale.set(preset.normalScale, preset.normalScale);
    if (useDisplacement) {
      material.displacementMap = surf.heightMap;
      material.displacementScale = 0.02;
      material.displacementBias = -0.01;
    }
    material.userData.tag = preset.tag;
    material.userData.surfaceKind = preset.surface;
    material.userData.tile = { u: surf.tileU, v: surf.tileV };
    return material;
  }

  // 非贴图材质（水面、发光面、玻璃）单独构造
  function makeSpecial(id) {
    switch (id) {
      case 'water':
        return Object.assign(new THREE.MeshPhysicalMaterial({
          name: 'water',
          color: 0x16242c,
          roughness: 0.045,
          metalness: 0.0,
          transparent: true,
          opacity: 0.90,
          envMapIntensity: 1.9,
          clearcoat: 1.0,
          clearcoatRoughness: 0.03
        }), { userData: { tag: '镜面水池' } });

      case 'glazing': {
        const m = new THREE.MeshStandardMaterial({
          name: 'glazing',
          color: 0xffe0b0,
          emissive: 0xffc178,
          emissiveIntensity: 0.12,
          roughness: 0.16,
          metalness: 0.0,
          transparent: true,
          opacity: 0.86,
          side: THREE.DoubleSide
        });
        m.userData = { tag: '锯齿屋顶发光面板（竖面）', emissiveRole: 'glazing' };
        emissiveMaterials.push(m);
        return m;
      }

      case 'kilnFire': {
        const m = new THREE.MeshBasicMaterial({ name: 'kilnFire', color: 0xff8a2e, transparent: true, opacity: 0.85 });
        m.userData = { tag: '窑火', emissiveRole: 'kilnFire' };
        emissiveMaterials.push(m);
        return m;
      }

      case 'lantern': {
        const m = new THREE.MeshStandardMaterial({
          name: 'lantern',
          color: 0xd8483a,
          emissive: 0xff7a3c,
          emissiveIntensity: 0.05,
          roughness: 0.62,
          metalness: 0.0
        });
        m.userData = { tag: '红灯笼', emissiveRole: 'lantern' };
        emissiveMaterials.push(m);
        return m;
      }

      case 'windowGlow': {
        const m = new THREE.MeshStandardMaterial({
          name: 'windowGlow',
          color: 0x3a3128,
          emissive: 0xffb469,
          emissiveIntensity: 0.03,
          roughness: 0.5,
          metalness: 0.0
        });
        m.userData = { tag: '室内暖光窗', emissiveRole: 'windowGlow' };
        emissiveMaterials.push(m);
        return m;
      }

      case 'glass':
        return Object.assign(new THREE.MeshPhysicalMaterial({
          name: 'glass',
          color: 0xbfd4dc,
          roughness: 0.08,
          metalness: 0.0,
          transparent: true,
          opacity: 0.34,
          envMapIntensity: 1.4,
          side: THREE.DoubleSide
        }), { userData: { tag: '玻璃店面' } });

      default:
        throw new Error(`未注册的特殊材质：${id}`);
    }
  }

  const EMISSIVE_BASE = { glazing: 0.12, kilnFire: 0.25, lantern: 0.05, windowGlow: 0.03 };

  function get(id) {
    if (!materialCache.has(id)) {
      materialCache.set(id, TEXTURED[id] ? makeTexturedMaterial(id) : makeSpecial(id));
    }
    return materialCache.get(id);
  }

  // 切换光照预设时，只调发光强度；其余光照由 env.js / main.js 负责。
  function adjustForLight(lightId) {
    for (const m of emissiveMaterials) {
      const role = m.userData.emissiveRole;
      const table = EMISSIVE_ROLES[role];
      if (!table) continue;
      const value = table[lightId] ?? EMISSIVE_BASE[role];
      if ('emissiveIntensity' in m) m.emissiveIntensity = value;
      else m.opacity = Math.min(0.95, 0.35 + value * 0.32);
    }
  }

  function stats() {
    let textures = 0;
    for (const surf of surfaceCache.values()) {
      textures += [surf.map, surf.normalMap, surf.ormMap, surf.heightMap].filter(Boolean).length;
    }
    return { surfaces: surfaceCache.size, textures, materials: materialCache.size, texSize };
  }

  function dispose() {
    for (const m of materialCache.values()) m.dispose();
    for (const surf of surfaceCache.values()) surf.dispose();
    materialCache.clear();
    surfaceCache.clear();
    emissiveMaterials.length = 0;
  }

  return { get, adjustForLight, stats, dispose, getSurface, texSize, quality };
}

export { TEXTURED, SURFACES };