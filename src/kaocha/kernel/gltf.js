// GLTFLoader 分支：有 GLB 用 GLB，缺失或加载失败即回退程序化建模。
// 本轮（Stage A）为可运行的空分支——public/models/<site>.glb 尚不存在，
// probeModel 会拿到 404 并直接返回 { ok: false }，场景层据此走程序化路径。
// Stage B 由 tools/blender/build_site.py 产出 GLB 后此分支自动生效。
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Vite base 为 './'，因此模型也走相对路径；public/ 下的文件原样拷贝到 dist。
const MODEL_BASE = './models/';

export function modelUrl(siteId, ext = 'glb') {
  return `${MODEL_BASE}${siteId}.${ext}`;
}

// 探测模型是否存在。HEAD 失败 / 404 / 超时 / 返回 HTML（SPA 回退页）都视为不存在。
export async function probeModel(siteId, { timeout = 2500 } = {}) {
  const url = modelUrl(siteId);
  if (typeof fetch !== 'function') return { ok: false, url, reason: 'no-fetch' };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
  try {
    const response = await fetch(url, { method: 'HEAD', signal: controller?.signal });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok) return { ok: false, url, reason: `http-${response.status}` };
    // 开发服务器对不存在文件的回退可能返回 200 + text/html，需要再判一次类型。
    if (/text\/html/i.test(type)) return { ok: false, url, reason: 'html-fallback' };
    return { ok: true, url, bytes: Number(response.headers.get('content-length') ?? 0) };
  } catch {
    return { ok: false, url, reason: 'network' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 可选解码器：仅当显式传入路径时才启用，避免默认路径 404 拉低首帧。
export async function attachDecoders(loader, { dracoPath, ktx2Path, renderer } = {}) {
  const created = [];
  if (dracoPath) {
    const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
    const draco = new DRACOLoader();
    draco.setDecoderPath(dracoPath);
    loader.setDRACOLoader(draco);
    created.push(draco);
  }
  if (ktx2Path) {
    const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
    const ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath(ktx2Path);
    // renderer 缺失时无法探测压缩格式支持，直接不挂载，走未压缩贴图。
    if (renderer) { ktx2.detectSupport(renderer); loader.setKTX2Loader(ktx2); created.push(ktx2); }
  }
  return created;
}

// 主入口：返回统一结构，场景层无需 try/catch 分支。
export async function loadSiteModel(siteId, { dracoPath, ktx2Path, renderer, onProgress } = {}) {
  const probe = await probeModel(siteId);
  if (!probe.ok) return { ok: false, source: 'procedural', reason: probe.reason, url: probe.url };

  let decoders = [];
  try {
    const loader = new GLTFLoader();
    decoders = await attachDecoders(loader, { dracoPath, ktx2Path, renderer });
    const gltf = await loader.loadAsync(probe.url, event => {
      if (onProgress && event.total) onProgress(event.loaded / event.total);
    });

    const root = gltf.scene;
    root.name = `${siteId}-glb`;
    root.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      // 米制场景：GLB 导出时已按米，不做额外缩放，仅记录便于 HUD 核对。
      node.userData.source = 'glb';
    });

    return {
      ok: true,
      source: 'glb',
      url: probe.url,
      gltf,
      root,
      bounds: measureObject(root),
      animations: gltf.animations ?? [],
      dispose() {
        disposeModel(root);
        decoders.forEach(d => d.dispose?.());
      }
    };
  } catch (error) {
    return { ok: false, source: 'procedural', reason: 'parse-error', url: probe.url, error };
  }
}

// 包围盒 + 半径：用于自适应机位、阴影相机与尺度标尺的对齐。
export function measureObject(object) {
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  object.updateWorldMatrix(true, true);
  object.traverse(node => {
    const geometry = node.geometry;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const corners = [
      [bb.min.x, bb.min.y, bb.min.z], [bb.max.x, bb.min.y, bb.min.z],
      [bb.min.x, bb.max.y, bb.min.z], [bb.max.x, bb.max.y, bb.min.z],
      [bb.min.x, bb.min.y, bb.max.z], [bb.max.x, bb.min.y, bb.max.z],
      [bb.min.x, bb.max.y, bb.max.z], [bb.max.x, bb.max.y, bb.max.z]
    ];
    for (const [x, y, z] of corners) {
      const v = { x, y, z };
      const e = node.matrixWorld.elements;
      const wx = e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12];
      const wy = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13];
      const wz = e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14];
      if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
      if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
    }
  });
  if (minX === Infinity) return null;
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
  const size = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
  const radius = Math.max(size.x, size.y, size.z) * 0.5;
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ }, center, size, radius };
}

export function disposeModel(root) {
  root.traverse(node => {
    node.geometry?.dispose?.();
    const material = node.material;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) {
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
        m[key]?.dispose?.();
      }
      m.dispose?.();
    }
  });
}