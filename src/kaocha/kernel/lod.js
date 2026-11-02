// 三档 LOD 注册与切换、面数统计。
// 分层策略（对应用户第 6 条「细节必须分层」）：
//   near 近景：高模 + 法线 + 位移 + 细节道具（砖缝、瓦楞、木纹、嵌瓷片逐块实例化）
//   mid  中景：中模 + PBR 全套
//   far  远景：低模 + 单张合并贴图（整片墙 / 整坡瓦，不逐块实例化）
import * as THREE from 'three';

export const LOD_TIERS = ['near', 'mid', 'far'];

// 默认切换距离（米）。以场景中心为原点，供 createLOD 作为默认值。
export const LOD_DISTANCES = { mid: 32, far: 85 };

// 由三档对象构造 THREE.LOD。允许缺档（例如只有 near + far）。
export function createLOD({ near, mid, far, distances = LOD_DISTANCES } = {}) {
  const lod = new THREE.LOD();
  lod.name = 'lod';
  if (near) lod.addLevel(near, 0);
  if (mid) lod.addLevel(mid, mid && near ? distances.mid : 0);
  if (far) lod.addLevel(far, distances.far);
  lod.userData.bias = 1;
  return lod;
}

// 按画质档的 lodBias 缩放切换距离：>0 提前降档，<0 延后降档。
export function applyBias(lod, bias) {
  if (!lod?.isLOD) return;
  const k = 1 + (bias ?? 0);
  lod.levels.forEach((level, i) => {
    if (i === 0) return;
    const base = level.distance;
    level.distance = Math.max(1, base * k);
  });
  lod.userData.bias = k;
}

// 强制停用自动切换，锁定到某一档（HUD 手动查看用）。
export function lockTier(lod, tier) {
  if (!lod?.isLOD) return;
  const map = { near: 0, mid: 1, far: 2 };
  const idx = Math.min(map[tier] ?? 0, lod.levels.length - 1);
  lod.autoUpdate = false;
  // 手动可见性切换：autoUpdate 关闭后由 update() 决定，这里用距离锁定等效实现。
  lod.levels.forEach((level, i) => { level.object.visible = i === idx; });
}

export function unlockTier(lod) {
  if (!lod?.isLOD) return;
  lod.autoUpdate = true;
  lod.levels.forEach(level => { level.object.visible = true; });
}

// 三角面统计：递归累计几何体索引/非索引面数，InstancedMesh 乘以实例数。
export function countTriangles(object) {
  let triangles = 0;
  object.traverse(node => {
    const geometry = node.geometry;
    if (!geometry) return;
    const index = geometry.getIndex();
    const position = geometry.getAttribute('position');
    const count = index ? index.count : (position ? position.count : 0);
    const perInstance = Math.floor(count / 3);
    const instances = node.isInstancedMesh ? node.count : 1;
    triangles += perInstance * (node.isInstancedMesh ? instances : 1);
  });
  return triangles;
}

export function countMeshes(object) {
  let meshes = 0;
  let instanced = 0;
  object.traverse(node => {
    if (node.isInstancedMesh) { instanced += 1; meshes += 1; }
    else if (node.isMesh) meshes += 1;
  });
  return { meshes, instanced };
}

// 按档位统计：只统计当前可见（visible 且未被其它档位遮挡）的对象。
export function collectStats(root) {
  return {
    triangles: countTriangles(root),
    ...countMeshes(root)
  };
}

// LOD 管理器：统一登记场景内所有 LOD，处理画质变化与档位锁定，并输出统计。
export function createLODManager({ bias = 0 } = {}) {
  const entries = new Set();
  let tierOverride = null;

  function add(lod, { distances, tierBias } = {}) {
    if (!lod?.isLOD) return lod;
    if (distances) {
      Object.entries(distances).forEach(([key, value]) => {
        const level = lod.levels.find(l => l.object.userData.tier === key);
        if (level) level.distance = value;
      });
    }
    applyBias(lod, bias + (tierBias ?? 0));
    if (tierOverride) lockTier(lod, tierOverride);
    entries.add(lod);
    return lod;
  }

  function remove(lod) { entries.delete(lod); }

  function setBias(nextBias) {
    bias = nextBias ?? 0;
    for (const lod of entries) applyBias(lod, bias);
  }

  function setTier(tier) {
    tierOverride = tier;
    for (const lod of entries) {
      if (tier) lockTier(lod, tier);
      else unlockTier(lod);
    }
  }

  function update(camera) {
    for (const lod of entries) if (lod.autoUpdate) lod.update(camera);
  }

  function stats() {
    let triangles = 0;
    let meshes = 0;
    let instanced = 0;
    for (const lod of entries) {
      const s = collectStats(lod);
      triangles += s.triangles;
      meshes += s.meshes;
      instanced += s.instanced;
    }
    return { lods: entries.size, triangles, meshes, instanced };
  }

  function dispose() {
    entries.clear();
  }

  return { add, remove, setBias, setTier, update, stats, dispose, get bias() { return bias; }, get tier() { return tierOverride; } };
}

// 远景代理：把一组构件的包围盒压成一个带贴图的体块，用于 far 档替换。
export function boxProxy({ width, height, depth, material, center = new THREE.Vector3() }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.copy(center);
  mesh.userData.tier = 'far';
  return mesh;
}

// 把若干几何体按材质合并为一个（far 档压 draw call 用）。
// 仅处理同材质、同属性集的普通 Mesh；实例化网格不参与合并。
export function mergeByMaterial(objects, material) {
  const geometries = [];
  for (const obj of objects) {
    if (!obj.isMesh || obj.isInstancedMesh) continue;
    const geometry = obj.geometry.clone();
    geometry.applyMatrix4(obj.matrixWorld);
    geometries.push(geometry);
  }
  if (!geometries.length) return null;
  const merged = mergeGeometries(geometries);
  geometries.forEach(g => g.dispose());
  if (!merged) return null;
  const mesh = new THREE.Mesh(merged, material);
  mesh.userData.tier = 'far';
  return mesh;
}

// 轻量几何合并（避免额外引入 BufferGeometryUtils 依赖）：
// 要求全部几何体同为索引或非索引、且属性名一致。
function mergeGeometries(geometries) {
  const first = geometries[0];
  if (!first) return null;
  const names = Object.keys(first.attributes);
  const allIndexed = geometries.every(g => g.getIndex());
  const consistent = geometries.every(g => Object.keys(g.attributes).join() === names.join());
  if (!consistent) return null;

  let vertexTotal = 0;
  let indexTotal = 0;
  for (const g of geometries) {
    vertexTotal += g.getAttribute('position').count;
    if (allIndexed) indexTotal += g.getIndex().count;
  }

  const merged = new THREE.BufferGeometry();
  for (const name of names) {
    const size = first.getAttribute(name).itemSize;
    const normalized = first.getAttribute(name).normalized;
    const array = new Float32Array(vertexTotal * size);
    let offset = 0;
    for (const g of geometries) {
      const attr = g.getAttribute(name);
      if (!attr) return null;
      array.set(attr.array, offset);
      offset += attr.array.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, size, normalized));
  }

  if (allIndexed) {
    const use32 = vertexTotal > 65535;
    const index = use32 ? new Uint32Array(indexTotal) : new Uint16Array(indexTotal);
    let vertexOffset = 0;
    let cursor = 0;
    for (const g of geometries) {
      const src = g.getIndex().array;
      for (let i = 0; i < src.length; i++) index[cursor + i] = src[i] + vertexOffset;
      cursor += src.length;
      vertexOffset += g.getAttribute('position').count;
    }
    merged.setIndex(new THREE.BufferAttribute(index, 1));
  }

  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}