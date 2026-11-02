// 真实瓷器 GLB 加载：网页副本放在 public/models/ 下，仅做几何简化 + WebP 纹理，
// 禁用 meshopt/Draco/quantize 压缩（int16 量化在 Three.js 版本不匹配时会导致错位），
// 保留 float32 顶点 → 无需额外解码器，Three.js 原生 GLTFLoader 直接加载。
// 与考察模块共用 measureObject / disposeModel，避免重复实现包围盒与资源释放。
// 任何失败都返回 { ok:false }，调用方静默回退程序化器身——模型缺失不应让页面出错。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { measureObject, disposeModel } from '../kaocha/kernel/gltf.js';

// Vite base 为 './'，public/ 下文件原样拷贝到 dist，因此模型走相对路径。
const MODEL_BASE = './models/';

export function vesselModelUrl(path) {
  return `${MODEL_BASE}${path}`;
}

export async function loadVesselModel(path, { onProgress } = {}) {
  const url = vesselModelUrl(path);
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url, event => {
      if (onProgress && event.total) onProgress(event.loaded / event.total);
    });
    const root = gltf.scene;
    root.name = path;
    return {
      ok: true,
      url,
      root,
      bounds: measureObject(root),
      dispose() { disposeModel(root); }
    };
  } catch (error) {
    return { ok: false, url, error };
  }
}

// 从已加载的器型 GLB 中提取第一层 PBR 釉面参数，供拼图碎片对齐真实模型的光泽：
// 粗糙度/金属度 = 材质系数 × metallicRoughness 贴图通道均值（G=roughness、B=metalness），
// 高光色取 KHR_materials_specular（specularColor）。纹理内容不从此图集取——
// 照片扫描贴图是 UV 图集而非柱面展开，直接映射到碎片的环绕 UV 会花斑错乱。
export function extractGlazeSpec(root) {
  let spec = null;
  root.traverse(node => {
    if (spec || !node.isMesh) return;
    const material = Array.isArray(node.material) ? node.material[0] : node.material;
    if (!material || !(material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)) return;
    spec = {
      roughness: material.roughness ?? .9,
      metalness: material.metalness ?? 0,
      specularColor: material.specularColor ? material.specularColor.clone() : null
    };
    const mrMap = material.metalnessMap || material.roughnessMap;
    const img = mrMap?.image;
    if (img && img.width && typeof document !== 'undefined') {
      try {
        const size = 48;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let rough = 0, metal = 0;
        const px = data.length / 4;
        for (let i = 0; i < data.length; i += 4) { rough += data[i + 1]; metal += data[i + 2]; }
        const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
        spec.roughness = clamp((material.roughness ?? 1) * (rough / px / 255), .1, 1);
        spec.metalness = clamp((material.metalness ?? 1) * (metal / px / 255), 0, 1);
      } catch { /* 贴图采样失败时退回材质系数 */ }
    }
  });
  return spec;
}

// 把任意导出尺度的模型居中并缩放到目标高度：旋转即绕几何中心，导入不受导出单位影响。
// glTF 场景根常带导出时烘焙的位移/缩放（本项目的 hero.glb 即如此），因此不能假设根变换为单位阵：
// 先按当前世界尺寸整体缩放，再按缩放后的世界包围盒中心平移回原点，兼容任意烘焙变换。
export function fitToHeight(object, targetHeight) {
  object.updateMatrixWorld(true);
  const before = measureObject(object);
  if (!before || !before.size.y) return null;
  object.scale.multiplyScalar(targetHeight / before.size.y);
  object.updateMatrixWorld(true);
  const after = measureObject(object);
  object.position.x -= after.center.x;
  object.position.y -= after.center.y;
  object.position.z -= after.center.z;
  return after;
}

// —— 从真实模型反推"半径—高度"轮廓（用户模型 → 程序化碎片/拼合器型的唯一形状依据）——
// 逐顶点（世界坐标）按高度分箱，取每箱 97 分位水平半径：既贴合器身外壁，又不被个别外凸装饰拉宽整圈。
// 返回按高度升序的 [[r, y], ...]，与 vesselProfile() 的输出口径一致。
export function profileFromModel(root, { bins = 28, quantile = .97 } = {}) {
  if (!root) return null;
  root.updateMatrixWorld(true);
  const bounds = measureObject(root);
  if (!bounds || !bounds.size.y) return null;
  const yMin = bounds.center.y - bounds.size.y / 2, yMax = bounds.center.y + bounds.size.y / 2;
  const ax = bounds.center.x, az = bounds.center.z;
  const buckets = Array.from({ length: bins }, () => []);
  const v = new THREE.Vector3();
  root.traverse(node => {
    if (!node.isMesh || !node.geometry?.attributes?.position) return;
    const pos = node.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
      const b = Math.min(bins - 1, Math.max(0, Math.floor((v.y - yMin) / (yMax - yMin) * bins)));
      buckets[b].push(Math.hypot(v.x - ax, v.z - az));
    }
  });
  const profile = [];
  for (let i = 0; i < bins; i++) {
    const b = buckets[i];
    if (!b.length) continue;
    b.sort((a, c) => a - c);
    const r = b[Math.min(b.length - 1, Math.floor(b.length * quantile))] || b[b.length - 1];
    profile.push([+r.toFixed(4), +(yMin + (i + .5) / bins * (yMax - yMin)).toFixed(4)]);
  }
  return profile.length >= 4 ? profile : null;
}

// 轮廓 → 数据层 outline（[[r,y]...] 右侧 + 镜像左侧），与 vessels.js 的 buildOutline 同构。
// 直接内联镜像，避免 vessel-model 反向依赖数据层（数据层不 import three）。
export function outlineFromProfile(profile) {
  if (!Array.isArray(profile) || profile.length < 4) return null;
  const right = profile.map(([r, y]) => [+r.toFixed(3), +y.toFixed(3)]);
  const left = [...right].reverse().map(([r, y]) => [-r, y]);
  return [...right, ...left];
}