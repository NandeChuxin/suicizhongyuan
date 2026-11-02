// 程序化贴图用的噪声与随机工具。
// 随机数直接复用项目既有的 mulberry32（src/data/vessels.js），保证结果可复现——
// 同一 seed 每次生成完全相同的纹理，便于与参考图逐张对照。
import { mulberry32 } from '../../data/vessels.js';

export { mulberry32 };

export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = t => t * t * (3 - 2 * t);

// 整数格点哈希：同一 (x,y,seed) 恒得同一值，且无需存储。
export function hash01(x, y, seed) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 2147483629;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 可平铺 value noise：采样域为 [0, period)，横向纵向都无缝。
// period 取整数，值域 0..1。
export function makeTileableNoise2D(seed, period = 8) {
  const p = Math.max(2, period | 0);
  const grid = new Float32Array(p * p);
  const rng = mulberry32(seed);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const at = (ix, iy) => grid[(((iy % p) + p) % p) * p + ((((ix % p) + p) % p))];
  return (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = smoothstep(x - ix), fy = smoothstep(y - iy);
    const v00 = at(ix, iy), v10 = at(ix + 1, iy);
    const v01 = at(ix, iy + 1), v11 = at(ix + 1, iy + 1);
    return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
  };
}

// 分形叠加。每层各自可平铺且周期随频率同步放大，因此结果整体仍可平铺。
export function makeFbm(noise, { octaves = 4, gain = 0.5, lacunarity = 2 } = {}) {
  return (x, y) => {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
}

// 脊状分形：适合石面、夯土层的沟壑感（0..1，1 为脊线）。
export function makeRidgedFbm(noise, options) {
  const fbm = makeFbm(noise, options);
  return (x, y) => 1 - Math.abs(fbm(x, y) * 2 - 1);
}

// 可平铺 Worley（细胞）噪声：返回最近特征点距离，0..1。
// 用于石材颗粒、碎瓷片镶嵌、卵石等离散元素的分区。
export function makeWorley2D(seed, cells = 6) {
  const c = Math.max(2, cells | 0);
  const rng = mulberry32(seed);
  const px = new Float32Array(c * c);
  const py = new Float32Array(c * c);
  for (let i = 0; i < c * c; i++) { px[i] = rng(); py[i] = rng(); }
  const wrap = v => ((v % c) + c) % c;
  return (x, y) => {
    const cx = Math.floor(x), cy = Math.floor(y);
    const fx = x - cx, fy = y - cy;
    let best = 8;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = wrap(cx + ox), gy = wrap(cy + oy);
      const idx = gy * c + gx;
      const dx = ox + px[idx] - fx;
      const dy = oy + py[idx] - fy;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return clamp01(Math.sqrt(best));
  };
}

// 把像素缓冲区写入 canvas 并包成 CanvasTexture。
// 采样放大约 2 倍以抑制砖缝等硬边产生的锯齿。
export function bufferToCanvas(rgb, size, amplify = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let i = 0, n = size * size; i < n; i++) {
    data[i * 4] = clamp01(rgb[i * 3] * amplify) * 255;
    data[i * 4 + 1] = clamp01(rgb[i * 3 + 1] * amplify) * 255;
    data[i * 4 + 2] = clamp01(rgb[i * 3 + 2] * amplify) * 255;
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// 灰度缓冲区 → canvas（法线 / 粗糙度 / AO 用）。
export function scalarToCanvas(gray, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let i = 0, n = size * size; i < n; i++) {
    const v = clamp01(gray[i]) * 255;
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// 高度场 → 切线空间法线图（Sobel 差分，环绕取样保证可平铺）。
export function heightToNormalGray(height, size, strength = 2.2) {
  const out = new Float32Array(size * size * 3);
  const at = (x, y) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
    const l = at(x - 1, y), r = at(x + 1, y);
    const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
    const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
    const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
    let nx = -dx * strength, ny = -dy * strength, nz = 1;
    const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx *= inv; ny *= inv; nz *= inv;
    const i = (y * size + x) * 3;
    out[i] = nx * 0.5 + 0.5;
    out[i + 1] = ny * 0.5 + 0.5;
    out[i + 2] = nz * 0.5 + 0.5;
  }
  return out;
}

// 高度场 → AO 近似：高度减去大半径模糊后的高度，得到"凹陷遮蔽"。
// 这是从几何高度派生的腔体遮蔽，不是光线追踪 AO，但成本恒定、可平铺。
export function heightToAoGray(height, size, radius = 6, strength = 1.0) {
  const blurred = new Float32Array(size * size);
  // 两趟可分离盒式模糊
  const tmp = new Float32Array(size * size);
  const win = Math.max(1, radius | 0);
  for (let y = 0; y < size; y++) {
    let sum = 0;
    for (let k = -win; k <= win; k++) sum += height[y * size + (((k % size) + size) % size)];
    for (let x = 0; x < size; x++) {
      tmp[y * size + x] = sum / (win * 2 + 1);
      const out = ((x - win) % size + size) % size;
      const inn = ((x + win + 1) % size + size) % size;
      sum += height[y * size + inn] - height[y * size + out];
    }
  }
  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let k = -win; k <= win; k++) sum += tmp[(((k % size) + size) % size) * size + x];
    for (let y = 0; y < size; y++) {
      blurred[y * size + x] = sum / (win * 2 + 1);
      const out = ((y - win) % size + size) % size;
      const inn = ((y + win + 1) % size + size) % size;
      sum += tmp[inn * size + x] - tmp[out * size + x];
    }
  }
  const ao = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    ao[i] = clamp01(1 - (blurred[i] - height[i]) * strength * 4);
  }
  return ao;
}