// 程序化 PBR 贴图生成器。
// 设计要点：
// 1) 零外部图片素材——全部由噪声 + 规则排布生成，规避版权与"AI 假纹理"问题；
//    参考照片只用于定比例、校轮廓（见 docs/考察3D建模清单.md 的溯源表）。
// 2) 每种表面声明自己的**物理平铺尺寸 tileU/tileV（米）**。几何体 UV 按米铺设，
//    材质再把 repeat 设为 1/tileU、1/tileV，砖与瓦就自动落在真实尺寸上（见 units.js）。
// 3) 由高度场派生法线，并把 AO 一并乘进 BaseColor，避免依赖 uv1 通道。
// 输出三张图：map(sRGB) / normalMap(线性) / ormMap(线性, R=AO G=粗糙度 B=金属度)。
import * as THREE from 'three';
import {
  makeTileableNoise2D, makeFbm, makeWorley2D, mulberry32,
  clamp01, lerp, hash01, bufferToCanvas, scalarToCanvas,
  heightToNormalGray, heightToAoGray
} from './noise.js';

export const DEFAULT_SIZE = 512;
const ANISO = 4;

// 统一的像素缓冲区
function makeBuf(size) {
  return {
    size,
    height: new Float32Array(size * size),
    rgb: new Float32Array(size * size * 3),
    rough: new Float32Array(size * size),
    metal: new Float32Array(size * size)
  };
}

// fbm 采样约定：坐标一律取 u*P、v*P（P 为该噪声的整数周期），
// 这样 u/v 走完 0..1 恰好走完整数个周期，任意倍频都保持可平铺。
const sample = (fbm, u, v, P) => fbm(u * P, v * P);

// ----------------------------------------------------------------------
// 砌体：青砖 / 红砖 / 窑砖（同一套错缝砌法，参数不同）
// ----------------------------------------------------------------------
function buildMasonry(s, seed, o) {
  const { size } = s;
  const { cols, rows, jointX, jointY, base, joint, tint, metal, rough } = o;
  const mx = 1 / cols, my = 1 / rows;
  const softU = (1.5 / size) * cols, softV = (1.5 / size) * rows;
  const grainNoise = makeTileableNoise2D(seed + 7, 64);
  const grainFbm = makeFbm(grainNoise, { octaves: 3, gain: 0.55 });
  const patchFbm = makeFbm(makeTileableNoise2D(seed + 31, 8), { octaves: 3, gain: 0.5 });

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    const row = Math.floor(v / my);
    const fv = v / my - row;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      // 错缝（顺砖砌法）：奇数皮右移半砖
      const uc = u / mx + (row & 1) * 0.5;
      const col = Math.floor(uc);
      const fu = uc - col;

      const mask = clamp01(((1 - jointX) - fu) / softU) * clamp01(((1 - jointY) - fv) / softV);
      const bVar = hash01(col, row, seed);
      const grain = sample(grainFbm, u, v, 64);
      const patch = sample(patchFbm, u, v, 8);

      const i = y * size + x;
      s.height[i] = 0.14 + mask * (0.72 + (bVar - 0.5) * 0.07 + grain * 0.06);
      // 逐砖色差 + 大尺度风化色差（做旧基础层）
      const shade = (1 + (bVar - 0.5) * tint + (grain - 0.5) * 0.10 + (patch - 0.5) * 0.12) * lerp(0.78, 1.0, 0.35 + mask * 0.65);
      s.rgb[i * 3] = lerp(joint[0], base[0], mask) * shade;
      s.rgb[i * 3 + 1] = lerp(joint[1], base[1], mask) * shade;
      s.rgb[i * 3 + 2] = lerp(joint[2], base[2], mask) * shade;
      s.rough[i] = rough + (1 - mask) * 0.04 + (grain - 0.5) * 0.05;
      s.metal[i] = metal;
    }
  }
}

// ----------------------------------------------------------------------
// 灰瓦：横向瓦垄（盖瓦起脊 + 底瓦成沟）+ 纵向搭接线
// ----------------------------------------------------------------------
function buildRoofTile(s, seed) {
  const { size } = s;
  const ridges = 4, courses = 5;
  const grain = makeFbm(makeTileableNoise2D(seed + 5, 32), { octaves: 3, gain: 0.55 });
  const patch = makeFbm(makeTileableNoise2D(seed + 17, 6), { octaves: 3, gain: 0.5 });
  const base = [0.400, 0.408, 0.392];
  const rng = mulberry32(seed + 3);
  const ridgeTint = Array.from({ length: ridges }, () => 1 + (rng() - 0.5) * 0.10);

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    const row = Math.floor(v * courses);
    const fv = v * courses - row;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const uc = u * ridges;
      const ci = Math.floor(uc) % ridges;
      const fu = uc - ci;

      // 横向剖面：中间为盖瓦起脊，两侧落到瓦沟
      const profile = 0.30 + 0.58 * Math.pow(Math.sin(Math.PI * fu), 0.7);
      // 纵向搭接：每排末端一个搭接线凸台
      const lap = fv > 0.90 ? (fv - 0.90) / 0.10 : 0;
      const g = sample(grain, u, v, 32);
      const p = sample(patch, u, v, 6);
      const rowTint = 1 + ((row * 2654435761) % 100 / 100 - 0.5) * 0.08;

      const i = y * size + x;
      s.height[i] = profile * 0.86 + lap * 0.10 + g * 0.05;
      // 瓦沟处偏深（积灰滞水），脊部偏亮
      const shade = (0.80 + profile * 0.28) * ridgeTint[ci] * rowTint * (1 + (p - 0.5) * 0.14);
      s.rgb[i * 3] = base[0] * shade;
      s.rgb[i * 3 + 1] = base[1] * shade;
      s.rgb[i * 3 + 2] = base[2] * shade * (0.98 + (p - 0.5) * 0.06);
      s.rough[i] = 0.86 + (1 - profile) * 0.06 + (g - 0.5) * 0.06;
      s.metal[i] = 0;
    }
  }
}

// ----------------------------------------------------------------------
// 木材：顺纹长条 + 年轮疏密 + 木射线（纵向为 v 轴）
// ----------------------------------------------------------------------
function buildWood(s, seed, o = {}) {
  const { size } = s;
  const warp = makeFbm(makeTileableNoise2D(seed + 2, 8), { octaves: 3, gain: 0.5 });
  const fine = makeFbm(makeTileableNoise2D(seed + 9, 64), { octaves: 2, gain: 0.5 });
  const base = o.base || [0.400, 0.276, 0.170];
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const w = sample(warp, u, v, 8);
      const f = sample(fine, u, v, 64);
      // 顺纹：沿 v 拉长的条带（u 方向高频，v 方向低频）
      const streak = Math.abs(Math.sin((u * 13 + w * 3.2) * Math.PI));
      const rings = Math.abs(Math.sin((u * 5 + w * 1.4 + v * 0.15) * Math.PI));
      const shade = (0.74 + streak * 0.30) * (0.92 + rings * 0.12) * (1 + (f - 0.5) * 0.10);
      const i = y * size + x;
      s.height[i] = 0.30 + streak * 0.16 + rings * 0.10 + f * 0.06;
      s.rgb[i * 3] = base[0] * shade;
      s.rgb[i * 3 + 1] = base[1] * shade;
      s.rgb[i * 3 + 2] = base[2] * shade;
      s.rough[i] = 0.72 + (1 - streak) * 0.10 + (f - 0.5) * 0.06;
      s.metal[i] = 0;
    }
  }
}

// ----------------------------------------------------------------------
// 石板：整块石板 + 细缝 + 石粒
// ----------------------------------------------------------------------
function buildStone(s, seed, o = {}) {
  const { size } = s;
  const cols = o.cols || 2, rows = o.rows || 2;
  const joint = o.joint || 0.022;
  const grain = makeWorley2D(seed + 4, 24);
  const patch = makeFbm(makeTileableNoise2D(seed + 11, 6), { octaves: 3, gain: 0.5 });
  const base = o.base || [0.395, 0.393, 0.372];
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    const fr = v * rows - Math.floor(v * rows);
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const fc = u * cols - Math.floor(u * cols);
      const slab = hash01(Math.floor(u * cols), Math.floor(v * rows), seed);
      const soft = 0.02;
      const mask = clamp01((Math.min(fc, 1 - fc) - joint * 0.5) / soft) * clamp01((Math.min(fr, 1 - fr) - joint * 0.5) / soft);
      // 板面轻微起拱，边缘磨圆
      const dome = 1 - 0.22 * (Math.pow(2 * fc - 1, 2) + Math.pow(2 * fr - 1, 2));
      const gr = grain(u * 8, v * 8);
      const p = sample(patch, u, v, 6);
      const shade = (0.82 + mask * 0.26) * (1 + (slab - 0.5) * 0.14) * (1 + (p - 0.5) * 0.16) * (0.96 + gr * 0.08);
      const i = y * size + x;
      s.height[i] = 0.10 + mask * (0.66 * dome + gr * 0.10);
      s.rgb[i * 3] = base[0] * shade;
      s.rgb[i * 3 + 1] = base[1] * shade;
      s.rgb[i * 3 + 2] = base[2] * shade;
      s.rough[i] = 0.88 + (1 - mask) * 0.05 + (gr - 0.5) * 0.08;
      s.metal[i] = 0;
    }
  }
}

// ----------------------------------------------------------------------
// 粉墙（石灰墙）：细腻、极浅起伏
// ----------------------------------------------------------------------
function buildPlaster(s, seed) {
  const { size } = s;
  const n = makeFbm(makeTileableNoise2D(seed + 6, 32), { octaves: 3, gain: 0.5 });
  const patch = makeFbm(makeTileableNoise2D(seed + 21, 5), { octaves: 3, gain: 0.55 });
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const g = sample(n, u, v, 32), p = sample(patch, u, v, 5);
      const shade = 0.97 + (g - 0.5) * 0.05 + (p - 0.5) * 0.07;
      const i = y * size + x;
      s.height[i] = 0.48 + g * 0.05 + p * 0.04;
      s.rgb[i * 3] = 0.885 * shade;
      s.rgb[i * 3 + 1] = 0.878 * shade;
      s.rgb[i * 3 + 2] = 0.840 * shade;
      s.rough[i] = 0.94 + (g - 0.5) * 0.04;
      s.metal[i] = 0;
    }
  }
}

// ----------------------------------------------------------------------
// 夯土（窑背）：水平夯层
// ----------------------------------------------------------------------
function buildRammedEarth(s, seed) {
  const { size } = s;
  const layers = 4;
  const n = makeFbm(makeTileableNoise2D(seed + 8, 32), { octaves: 3, gain: 0.5 });
  const patch = makeFbm(makeTileableNoise2D(seed + 23, 5), { octaves: 3, gain: 0.55 });
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    const fv = v * layers - Math.floor(v * layers);
    const seam = fv > 0.90 ? (fv - 0.90) / 0.10 : 0;   // 夯层接缝
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const g = sample(n, u, v, 32), p = sample(patch, u, v, 5);
      const shade = 0.88 + (g - 0.5) * 0.14 + (p - 0.5) * 0.18 - seam * 0.12;
      const i = y * size + x;
      s.height[i] = 0.58 + g * 0.10 + p * 0.10 - seam * 0.20;
      s.rgb[i * 3] = 0.590 * shade;
      s.rgb[i * 3 + 1] = 0.502 * shade;
      s.rgb[i * 3 + 2] = 0.372 * shade;
      s.rough[i] = 0.95 + (g - 0.5) * 0.04;
      s.metal[i] = 0;
    }
  }
}

// ----------------------------------------------------------------------
// 铸面（耐候钢 / 铸铁）：深色 + 砂眼
// ----------------------------------------------------------------------
function buildIron(s, seed, o = {}) {
  const { size } = s;
  const holes = makeWorley2D(seed + 12, 32);
  const n = makeFbm(makeTileableNoise2D(seed + 13, 16), { octaves: 3, gain: 0.5 });
  const base = o.base || [0.150, 0.142, 0.134];
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const w = holes(u * 16, v * 16);
      const g = sample(n, u, v, 16);
      const pit = clamp01((0.12 - w) / 0.12);   // 砂眼
      const shade = 1 + (g - 0.5) * 0.20 - pit * 0.35;
      const i = y * size + x;
      s.height[i] = 0.62 + g * 0.08 - pit * 0.45;
      s.rgb[i * 3] = base[0] * shade;
      s.rgb[i * 3 + 1] = base[1] * shade;
      s.rgb[i * 3 + 2] = base[2] * shade * (1 + pit * 0.10);
      s.rough[i] = (o.rough ?? 0.55) + (g - 0.5) * 0.10 + pit * 0.18;
      s.metal[i] = o.metal ?? 0.70;
    }
  }
}

// ----------------------------------------------------------------------
// 钢材（入口钢构门架、三角桁架）
// ----------------------------------------------------------------------
function buildSteel(s, seed) {
  const { size } = s;
  const n = makeFbm(makeTileableNoise2D(seed + 14, 16), { octaves: 2, gain: 0.5 });
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const g = sample(n, u, v, 16);
      const i = y * size + x;
      s.height[i] = 0.55 + g * 0.06;
      const shade = 0.96 + (g - 0.5) * 0.10;
      s.rgb[i * 3] = 0.452 * shade;
      s.rgb[i * 3 + 1] = 0.462 * shade;
      s.rgb[i * 3 + 2] = 0.478 * shade;
      s.rough[i] = 0.34 + (g - 0.5) * 0.08;
      s.metal[i] = 0.88;
    }
  }
}

// ----------------------------------------------------------------------
// 卵石 / 碎瓷片铺底（御窑厂镜面水池底、嵌瓷片墙）
// 特征：Worley 细胞分区，每区一个圆润颗粒，部分颗粒呈青花蓝白
// ----------------------------------------------------------------------
function buildCobble(s, seed, o = {}) {
  const { size } = s;
  const cells = o.cells || 9;
  const dist = makeWorley2D(seed + 15, cells);
  const patch = makeFbm(makeTileableNoise2D(seed + 25, 6), { octaves: 3, gain: 0.5 });
  const rng = mulberry32(seed + 41);
  const cellCount = cells * cells * 2;
  const kind = new Float32Array(cellCount);
  const tone = new Float32Array(cellCount);
  for (let i = 0; i < cellCount; i++) { kind[i] = rng(); tone[i] = 0.82 + rng() * 0.36; }

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const d = dist(u * cells, v * cells);
      const gx = Math.floor(u * cells * 2), gy = Math.floor(v * cells * 2);
      const id = ((gy * cells * 2 + gx) % cellCount + cellCount) % cellCount;
      const pebble = clamp01((0.62 - d) / 0.42);       // 0=缝 1=颗粒中心
      const p = sample(patch, u, v, 6);
      const isPorcelain = kind[id] > 0.62;             // 釉面瓷片
      const shade = tone[id] * (0.86 + pebble * 0.22) * (1 + (p - 0.5) * 0.12);
      const i = y * size + x;
      s.height[i] = 0.12 + Math.pow(pebble, 0.6) * 0.62 + (1 - pebble) * p * 0.06;
      if (isPorcelain) {
        // 瓷片：青花蓝白，个别为祭红
        const red = kind[id] > 0.90;
        s.rgb[i * 3] = (red ? 0.52 : 0.80) * shade;
        s.rgb[i * 3 + 1] = (red ? 0.16 : 0.82) * shade;
        s.rgb[i * 3 + 2] = (red ? 0.15 : 0.86) * (1 + (p - 0.5) * 0.25);
        s.rough[i] = clamp01(0.28 + (1 - pebble) * 0.45 + (p - 0.5) * 0.10); // 釉面反光
      } else {
        s.rgb[i * 3] = 0.372 * shade;
        s.rgb[i * 3 + 1] = 0.368 * shade;
        s.rgb[i * 3 + 2] = 0.344 * shade;
        s.rough[i] = 0.62 + (1 - pebble) * 0.30 + (p - 0.5) * 0.08;
      }
      s.metal[i] = 0;
    }
  }
}

// ----------------------------------------------------------------------
// 场地（素土 / 沙砾地面）
// ----------------------------------------------------------------------
function buildGround(s, seed) {
  const { size } = s;
  const n = makeFbm(makeTileableNoise2D(seed + 16, 16), { octaves: 4, gain: 0.5 });
  const speck = makeWorley2D(seed + 27, 48);
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const g = sample(n, u, v, 16);
      const d = speck(u * 32, v * 32);
      const shade = 0.90 + (g - 0.5) * 0.22 + (0.5 - d) * 0.10;
      const i = y * size + x;
      s.height[i] = 0.50 + g * 0.16 + (0.5 - d) * 0.08;
      s.rgb[i * 3] = 0.432 * shade;
      s.rgb[i * 3 + 1] = 0.412 * shade;
      s.rgb[i * 3 + 2] = 0.372 * shade;
      s.rough[i] = 0.94 + (g - 0.5) * 0.04;
      s.metal[i] = 0;
    }
  }
}

// ----------------------------------------------------------------------
// 表面注册表：tileU/tileV 为该贴图在场景中覆盖的**真实米数**。
// 模数换算：砖模数 250×125mm → 4 皮×8 皮刚好 1.0m×1.0m。
// ----------------------------------------------------------------------
export const SURFACES = {
  brick: {
    tileU: 1.0, tileV: 1.0,
    build: (s, seed) => buildMasonry(s, seed, {
      cols: 4, rows: 8, jointX: 0.040, jointY: 0.080,
      base: [0.428, 0.442, 0.452], joint: [0.286, 0.296, 0.302], tint: 0.20, metal: 0, rough: 0.92
    })
  },
  oldBrick: {
    tileU: 1.0, tileV: 1.0,
    build: (s, seed) => buildMasonry(s, seed, {
      cols: 4, rows: 8, jointX: 0.045, jointY: 0.085,
      base: [0.402, 0.398, 0.386], joint: [0.252, 0.250, 0.244], tint: 0.30, metal: 0, rough: 0.95
    })
  },
  redBrick: {
    tileU: 1.0, tileV: 1.0,
    build: (s, seed) => buildMasonry(s, seed, {
      cols: 4, rows: 8, jointX: 0.040, jointY: 0.080,
      base: [0.560, 0.286, 0.222], joint: [0.412, 0.222, 0.176], tint: 0.22, metal: 0, rough: 0.90
    })
  },
  kilnBrick: {
    // 窑砖模数 244×79mm → 4×12 皮 = 0.976m×0.948m
    tileU: 0.976, tileV: 0.948,
    build: (s, seed) => buildMasonry(s, seed, {
      cols: 4, rows: 12, jointX: 0.057, jointY: 0.150,
      base: [0.556, 0.430, 0.300], joint: [0.600, 0.500, 0.396], tint: 0.26, metal: 0, rough: 0.94
    })
  },
  roofTile: { tileU: 0.800, tileV: 0.900, build: buildRoofTile },
  wood: { tileU: 0.600, tileV: 1.200, build: (s, seed) => buildWood(s, seed) },
  darkWood: {
    tileU: 0.600, tileV: 1.200,
    build: (s, seed) => buildWood(s, seed, { base: [0.170, 0.132, 0.108] })
  },
  stone: { tileU: 1.200, tileV: 1.200, build: (s, seed) => buildStone(s, seed) },
  stoneStep: {
    tileU: 0.900, tileV: 0.900,
    build: (s, seed) => buildStone(s, seed, { cols: 1, rows: 2, joint: 0.030, base: [0.430, 0.424, 0.404] })
  },
  plaster: { tileU: 0.800, tileV: 0.800, build: buildPlaster },
  rammedEarth: { tileU: 1.000, tileV: 1.000, build: buildRammedEarth },
  iron: { tileU: 0.500, tileV: 0.500, build: (s, seed) => buildIron(s, seed) },
  steel: { tileU: 0.500, tileV: 0.500, build: buildSteel },
  cobble: { tileU: 1.000, tileV: 1.000, build: (s, seed) => buildCobble(s, seed) },
  porcelainInlay: {
    tileU: 0.900, tileV: 0.900,
    build: (s, seed) => buildCobble(s, seed, { cells: 5 })
  },
  ground: { tileU: 4.000, tileV: 4.000, build: buildGround }
};

// 生成一套表面贴图。返回的三张贴图已经配好 wrap / repeat / colorSpace，
// 几何体只要用"米"作 UV，图案就会落在真实尺寸上。
export function generateSurface(kind, { size = DEFAULT_SIZE, seed = 1 } = {}) {
  const def = SURFACES[kind];
  if (!def) throw new Error(`未注册的程序化表面：${kind}`);

  const s = makeBuf(size);
  def.build(s, seed);

  // AO 乘进 BaseColor（避免依赖 uv1 通道），同时单独存入 ormMap 的 R
  const ao = heightToAoGray(s.height, size, 5, 0.9);
  const rgb = new Float32Array(size * size * 3);
  const rough = new Float32Array(size * size);
  const orm = new Float32Array(size * size * 3);
  for (let i = 0, n = size * size; i < n; i++) {
    const occ = 0.62 + 0.38 * ao[i];
    rgb[i * 3] = s.rgb[i * 3] * occ;
    rgb[i * 3 + 1] = s.rgb[i * 3 + 1] * occ;
    rgb[i * 3 + 2] = s.rgb[i * 3 + 2] * occ;
    rough[i] = clamp01(s.rough[i]);
    orm[i * 3] = ao[i];
    orm[i * 3 + 1] = clamp01(s.rough[i]);
    orm[i * 3 + 2] = clamp01(s.metal[i]);
  }

  const configure = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / def.tileU, 1 / def.tileV);
    t.anisotropy = ANISO;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  };

  const map = configure(bufferToCanvas(rgb, size), true);
  const normalMap = configure(scalarToCanvasChannel(heightToNormalGray(s.height, size, 2.4), size), false);
  const ormMap = configure(bufferToCanvas(orm, size), false);
  const heightMap = configure(scalarToCanvas(s.height, size), false);
  map.name = normalMap.name = ormMap.name = heightMap.name = `${kind}#${seed}`;

  return {
    kind, size, seed,
    tileU: def.tileU, tileV: def.tileV,
    map, normalMap, ormMap, heightMap,
    dispose() {
      map.dispose(); normalMap.dispose(); ormMap.dispose(); heightMap.dispose();
    }
  };
}

// 法线图是三通道浮点缓冲，走 bufferToCanvas 即可（值域已归一化到 0..1）
function scalarToCanvasChannel(rgb, size) {
  return bufferToCanvas(rgb, size);
}