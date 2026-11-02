import * as THREE from 'three';
import { gsap } from 'gsap';
import { vesselProfile, radiusAt } from './vessels3d.js';
import { makeVesselTexture } from './textures.js';
import { mulberry32 } from '../data/vessels.js';

// 3D 拼合参数集中在此（阈值、几何、缓动），不散落在组件里。
export const P3D = {
  snapDistance: .26, snapAngle: Math.PI / 10,
  magnetDistance: 1.05, magnetAngle: Math.PI / 7,
  glow: { color: 0x7fd4e8, intensity: .55 },
  // gold.seam：金缮接缝线淡入终值。LineBasicMaterial 无 emissive，
  // additive 叠加下的 opacity 就是它的"发光度"视觉口径（对应需求里的 emissive 0→.6）。
  gold: { color: 0xd6a94a, intensity: .85, seam: .6 },
  thickness: .3,   // 块状厚瓷：壁厚加大后断面（露胎）面积占比明显，碎片有体积感
  scatterRadius: 1.25,   // （兼容保留：旧悬浮散落口径，新布局已改为台面落位）
  scatterLift: .62,      // （兼容保留）
  benchRadius: 3.05,     // （兼容保留）
  hover: .35,            // （兼容保留）
  qualityScale: .8,
  // —— 散落落位平面（任务 A；原"台面"圆盘已移除，此值只剩坐标语义）——
  benchTopY: -0.46,  // 不可见落位平面高度：碎片散落/微碴/落位扬尘 floor 都用它，不产生任何网格
  // benchClearance：成品底面与碎片散落平面之间的净空（世界单位）。
  // 台面圆盘已整体删除（见 puzzle3d-bench.js 顶部说明），这里保留净空有两个作用：
  // ① 成品与散落平面错开，保持"悬浮修复成品"的落位口径（金缮落回即回到这个高度）；
  // ② 避开散在平面上的碎碴/微碴（它们不参与拾取也不做足印排斥），成品底面不会插进碴粒里。
  // 只作用于拼合成品（correctPosition）；散落碎片/碎碴仍落在 P3D.benchTopY 这个不可见平面上。
  benchClearance: 1.15,
  seatRadius: 2.35,  // 器座半径：中心留空给拼合成品（最宽器型半径 2.25）
  stackGap: .05,     // 足印重叠深度 ≤ 此容差视为"擦边叠压 1~2mm"，不抬层
  stackMax: 1.6,     // 叠压总高度上限（曲面碎片叠出真实的高度差，但不堆塔）
  grabLift: .55,     // 抓起抬升余量（选中 feedback）
  // 台面碎碴（tiny 四面体，胎色；不参与拾取——pickFragment 只对碎片 mesh 射线）
  // micro（任务④）：碎片集中区间隙的微型碴粒，与碎碴同池（同组/同几何/同材质）；
  // 落点拒绝采样保证不压碎片足印、贴台面不悬空
  debris: {
    countHigh: 16, countLow: 10, color: 0xd8d2c2, minSize: .04, maxSize: .11,
    micro: { highMin: 4, highMax: 6, low: 2, minSize: .02, maxSize: .05, margin: .06 }
  },
  // 落位扬尘（任务①）：极细胎色尘埃；参数由 makeDustBurst 以 seed=siteSeed+fragmentIndex
  // 确定性生成（重复访问逐位一致），播放侧（puzzle3d-bench）仅高画质且非 reduce 时消费：
  // 初速向上 + 径向微散，重力回落，life 内 opacity 淡出
  dust: {
    life: .6, gravity: 4.2, color: 0xd8d2c2, opacity: .85,
    sizeMin: .03, sizeMax: .06, upMin: .5, upMax: 1.0, radialMin: .1, radialMax: .38,
    stagger: .055   // 入场各片错峰间隔（确定性，按索引）
  },
  // 对位摆动（任务 B5）：阻尼"寻找对位"→ 咔哒到位；power2.inOut、时长 .45~.55s
  seek: { duration: .5, durationLow: .3, swingsHigh: 2.6, swingsLow: 1 },
  // 露胎断面（灰白偏米黄胎骨，粗糙不反光）与贝壳状断口噪声（幅度按 thickness 比例）
  bisque: { color: 0xd8d2c2, roughness: .85, metalness: 0 },
  conchoidal: { amp: .55 }
};

// 拼合台布局半径单值来源：碎片散落分布、confine 边界、全息投影锥锥底共用同一口径。
// 台面圆盘已移除（不再生成网格），此半径只用于布局，不产生任何可见元素。
// 旧口径 max(2.2, count*.28) 放不下平放的全高长片（器高 ~7），按碎片数放大。
export const benchRadiusFor = count => Math.max(5.2, count * .46 + 1.8);

const TWO_PI = Math.PI * 2;
const AX_X = new THREE.Vector3(1, 0, 0);
const AX_Y = new THREE.Vector3(0, 1, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);

// —— 确定性 3D 值噪声（断面贝壳状 conchoidal 扰动）——
// 纯函数：相同输入逐位相同 → 相邻碎片在同一边界上的重合顶点扰动一致，壳体永不撕裂。
function hash3i(x, y, z, seed) {
  let h = (seed | 0) ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3i(xi + dx, yi + dy, zi + dz, seed);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), sx), lerp(c(0, 1, 0), c(1, 1, 0), sx), sy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), sx), lerp(c(0, 1, 1), c(1, 1, 1), sx), sy),
    sz
  ) * 2 - 1;
}

// 每列细分数：宽列多分、窄列少分（确定性）
const colsForWidth = w => Math.min(6, Math.max(3, Math.round(w / TWO_PI * 44)));

// —— 共享裂纹网络（砖墙式块状网格）——
// 全器一次崩裂为 nBands 横带 × nCols 纵列的错落块状网格（总块数恒等于 count，
// 杜绝旧版「通高长条」）：纵向主裂贯通全高（瓷器放射状开裂），横向环裂为带间界线
// （瓷器环状崩裂）。所有可能被两片共享的顶点都取自同一纯函数位置场：
//   · 纵缝：边界 b 的折线数组 dTheta[b]（相邻两列共用同一数组）；
//   · 环缝：整数谐波函数 ringDy(gr,θ)（周向 C0 连续，同列上下两带用同一采样）；
// → 相邻碎片共享边逐点一致，拼回原位严丝合缝、零缝隙零穿模。
// —— 横向分带：带界按「实际列宽 × 器型半径」逐候选精确验收（构造性保证测试口径）——
// 规则（与 tests/puzzle3d.test.js 块状化断言同口径，留 5% 安全余量抵消 cutRows 取整）：
//   · 宽域片（带中弧宽 ≥0.9）：高/弧宽 ≤2.28 且 弧宽/高 ≤2.28（块状，杜绝"一长条一长条"）；
//   · 细窄片（梅瓶颈 / 高足柄等，弧宽 <0.9）：先天细长，只约束「非通高」（带高 ≤0.58 器高）。
// 在可行组合中按「最大块/最小块面积比」降序取前三名，再用 rng 择一——兼顾面积错落（≥1.8 倍）与随机性。
function pickBandCuts({ profile, minY, height, widthsRad, cuts, rng }) {
  if (cuts <= 0) return [];   // 单带布局（宽扁器：玲珑碗等）不需要环缝
  const grid = [];
  for (let i = 0; i <= 32; i++) grid.push(.16 + .68 * i / 32); // .16 ~ .84
  const combos = cuts === 1 ? grid.map(t => [t]) : [];
  if (cuts === 2) for (const t1 of grid) for (const t2 of grid) if (t2 - t1 >= .22) combos.push([t1, t2]);
  const feas = [];
  for (const cs of combos) {
    const edges = [0, ...cs, 1];
    const bands = [];
    let ok = true;
    for (let b = 0; b + 1 < edges.length; b++) {
      const ys = (edges[b + 1] - edges[b]) * height;
      const r = Math.max(.05, radiusAt(profile, minY + height * (edges[b] + edges[b + 1]) / 2));
      bands.push({ ys, r });
      for (const w of widthsRad) {
        const arc = r * w;
        if (arc >= .9) { if (ys / arc > 2.28 || arc / ys > 2.28) { ok = false; break; } }
        else if (ys > height * .58) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok) continue;
    const areas = [];
    for (const b of bands) for (const w of widthsRad) areas.push(b.ys * w);
    feas.push({ cuts: cs, ratio: Math.max(...areas) / Math.min(...areas) });
  }
  if (!feas.length) {
    // 兜底：回到固定档位（候选网格覆盖面足够宽，正常到不了这里）
    return cuts === 1 ? [.38 + rng() * .2] : [.27 + rng() * .1, .62 + rng() * .12];
  }
  feas.sort((a, b) => b.ratio - a.ratio);
  return feas[Math.min(feas.length - 1, Math.floor(rng() * 3))].cuts;
}

// （导出供测试：崩边数量/密度断言直接校验 chips；生产代码只经 create3DFragments 间接使用）
export function buildCrackNetwork({ profile, minY, maxY, count, rng, seed, thickness, low = false }) {
  const height = Math.max(1e-4, maxY - minY);

  // —— 带数×列数：块状化布局 ——
  // 8→2×4，10→2×5，12→3×4；合成测试器物（4→2×2）与整除兜底向下兼容。
  // 器型很宽时（如云龙罐：高宽比 .81），3×4 会让每片变成"横长条"，故在 count 的因数对里
  // 按最坏长宽比（最宽列弧宽 vs 带高）择优选 —— 归一化后 12 片会改为 2×6（6 列窄、2 带高）。
  const maxR = Math.max(...profile.map(p => p.x));
  const preferred = count >= 12 ? 3 : 2;
  let nBands = count >= 12 ? 3 : 2;
  let nCols = count / nBands;
  if (count % nBands !== 0) { nBands = count % 2 === 0 ? 2 : 1; nCols = count / nBands; }
  {
    const pairs = [];
    for (let b = 1; b <= count; b++) {
      if (count % b || count / b < 3) continue;   // 少于 3 列 → 单片过宽，不做候选
      pairs.push([b, count / b]);
    }
    // 单带（1 圈竖裂）只在「器型很扁」时才是最优解，由下面的长宽比打分自然选出，
    // 不会影响高器：梅瓶 1 带的 aspect 会远大于 2 带。
    let best = null;
    for (const [nb, nc] of pairs) {
      const bandH = height / nb;
      const widestArc = maxR * (TWO_PI / nc) * 1.32;  // 列宽抖动上限 1.32 倍
      const aspect = Math.max(widestArc / bandH, bandH / widestArc);
      // 同分时优先历史档位（带数越接近 preferred 越好），避免既有器型的碎片数分配无谓变动
      const key = aspect + Math.abs(nb - preferred) * 1e-3;
      if (!best || key < best.key) best = { nb, nc, key };
    }
    if (best && best.nb * best.nc === count) { nBands = best.nb; nCols = best.nc; }
  }

  // 网格行数：纵向裂纹锯齿的细分精度（行间直线段相连 → 折线锯齿而非光滑波纹）
  const R = Math.min(20, Math.max(12, Math.round(height / .22)));
  const rowsY = [];
  for (let r = 0; r <= R; r++) rowsY.push(minY + height * r / R);

  // —— 周向切分：列宽错落（base×0.75~1.32 后归一化）——
  // 先抽列宽再选带界：带界验收要用「实际列宽」逐片预测，保证结论与真实几何逐位一致。
  const base = TWO_PI / nCols;
  const widthsRad = [];
  // 单带布局（宽扁器）没有带高差，面积错落只能来自列宽 → 抖动幅度加倍；
  // 多带布局保持原口径（带高差 + 列宽差共同形成错落）。
  const jitter = nBands === 1 ? .95 : .57, floor = nBands === 1 ? .55 : .75;
  for (let i = 0; i < nCols; i++) widthsRad.push(base * (floor + rng() * jitter));
  const wSum = widthsRad.reduce((a, b) => a + b, 0);
  for (let i = 0; i < nCols; i++) widthsRad[i] = widthsRad[i] / wSum * TWO_PI;

  // —— 横向分带：带界按器型自适应（见 pickBandCuts）——
  const bandT = [0, ...pickBandCuts({ profile, minY, height, widthsRad, cuts: nBands - 1, rng }), 1];
  const cutRows = [];
  for (let b = 1; b < nBands; b++) {
    let rc = Math.round(R * bandT[b]);
    rc = Math.min(R - 2, Math.max(2, rc));
    if (cutRows.length && rc <= cutRows[cutRows.length - 1]) rc = Math.min(R - 2, cutRows[cutRows.length - 1] + 2);
    cutRows.push(rc);
  }
  const bands = [];
  let bandLo = 0;
  for (const rc of cutRows) { bands.push([bandLo, rc]); bandLo = rc; }
  bands.push([bandLo, R]);

  // 边界原始角：边界 b 在 Θb，列 k 占 [Θk, Θk+1]（放射状主裂贯通全高）
  const thetaStart = new Float64Array(nCols);
  thetaStart[0] = rng() * TWO_PI;
  for (let b = 1; b < nCols; b++) thetaStart[b] = thetaStart[b - 1] + widthsRad[b - 1];

  // —— 纵向主裂 jagged 化：低频整体游移（保留大走向）+ 阻尼随机游走（逐行折角）
  //    + 偶发尖拐（瓷器崩裂特有的突然变向）+ 部分边界“鼓包再收回”包络；
  //    行间以直线段相连 → 裂纹呈折线锯齿而非光滑波纹；
  //    tanh 平滑限幅到相邻列宽的 38%，保证相邻边界永不交叉、不穿模 ——
  const dTheta = [];
  for (let b = 0; b < nCols; b++) {
    const wL = widthsRad[(b - 1 + nCols) % nCols], wR = widthsRad[b % nCols];
    const cap = .38 * Math.min(wL, wR);
    const f1 = 1.1 + rng() * .8, p1 = rng() * TWO_PI;
    const hasBulge = rng() < .42;
    const t0 = .25 + rng() * .5, bAmp = .05 + rng() * .06, bf = 2 + rng() * 1.5;
    const arr = new Float64Array(R + 1);
    let walk = 0;
    for (let r = 0; r <= R; r++) {
      const t = r / R;
      let d = .13 * Math.sin(TWO_PI * (f1 * t + p1));
      walk = walk * .32 + (rng() - .5) * .11;   // 阻尼随机游走：逐行折角
      d += walk;
      if (rng() < .2) d += (rng() - .5) * .2;   // 偶发尖拐（约每 5 行一次）
      if (hasBulge) {
        const dt = t - t0;
        d += bAmp * Math.exp(-(dt * dt) / .015) * Math.sin(TWO_PI * bf * dt);
      }
      arr[r] = cap * Math.tanh(d / cap);
    }
    dTheta.push(arr);
  }

  // —— 环缝函数（带间界线的周向起伏）：整数谐波叠加 ——
  // sin(k·θ+p) 对 θ 周期 → 全环闭合无接缝；纯函数 (gr,θ) → 上下两带在同列的采样逐位一致。
  // 幅度 ~1.4~2.6% 器高 + 三档谐波（低频大势 / 中频折皱 / 高频锯齿），环裂呈瓷器崩裂的起伏断口。
  const rings = new Map();
  for (const gr of cutRows) {
    rings.set(gr, {
      k1: 2 + Math.floor(rng() * 3),
      k2: 6 + Math.floor(rng() * 5),
      k3: 11 + Math.floor(rng() * 6),
      p1: rng() * TWO_PI, p2: rng() * TWO_PI, p3: rng() * TWO_PI,
      amp: height * (.014 + rng() * .012)
    });
  }

  // —— 釉层崩边：全器 3~5 处（低画质减半但不为零），部位密度加权——
  //    口沿（y > maxY×0.75）与腹部中带 ×1.3、足部（y < minY+壁厚）×0.6
  //    （「釉比胎脆、先崩釉后裂胎」：足部近托烧、釉层受护，崩边概率低）；
  //    崩边带宽度/深度参数保持原口径；行抽取按密度权重一次命中（无拒绝循环，流消耗恒定）。
  //    崩边走独立确定流 chipRng：不消耗主 rng → 高/低画质散落位姿逐位一致，
  //    且与散落/接缝指纹完全解耦；扰动按 (θ,y) 位置场计算，崩口跨缝连续 ——
  const chipRng = mulberry32((seed ^ 0x7f4a7c15) >>> 0);
  const nChipsHigh = 3 + Math.floor(chipRng() * 3);
  const nChips = low ? Math.max(1, nChipsHigh >> 1) : nChipsHigh;
  const footY = minY + thickness, rimY = maxY * .75;
  const chipRows = [];
  let chipRowWSum = 0;
  for (let r = 1; r < R; r++) {
    const w = rowsY[r] < footY ? .6 : (rowsY[r] > rimY ? 1.3 : 1.3);
    chipRows.push({ r, w });
    chipRowWSum += w;
  }
  const chips = [];
  for (let i = 0; i < nChips; i++) {
    let u = chipRng() * chipRowWSum, r = chipRows[chipRows.length - 1].r;
    for (const rw of chipRows) { u -= rw.w; if (u <= 0) { r = rw.r; break; } }
    chips.push({
      b: Math.floor(chipRng() * nCols),
      r,
      rTh: .05 + chipRng() * .05,
      rY: height * (.05 + chipRng() * .05),
      depth: thickness * (.3 + chipRng() * .2)
    });
  }

  return { height, R, rowsY, bands, cutRows, nBands, nCols, widthsRad, thetaStart, dTheta, rings, chips, seed };
}

// 环缝纵向起伏（仅带间界线行非零）：纯函数，相邻碎片共享顶点逐位一致。
function ringDy(net, gr, th) {
  const g = net.rings.get(gr);
  if (!g) return 0;
  return g.amp * (.5 * Math.sin(g.k1 * th + g.p1)
    + .3 * Math.sin(g.k2 * th + g.p2)
    + .2 * Math.sin(g.k3 * th + g.p3));
}

// 某点 (θ,y) 处的崩边内压量（>0 表示处于崩口范围）
function chipPush(net, th, y) {
  let push = 0;
  for (const chip of net.chips) {
    const thC = net.thetaStart[chip.b] + net.dTheta[chip.b][chip.r];
    let dth = th - thC;
    dth -= TWO_PI * Math.round(dth / TWO_PI);
    const d = Math.hypot(dth / chip.rTh, (y - net.rowsY[chip.r]) / chip.rY);
    if (d < 1) {
      const fall = 1 - d * d;
      push = Math.max(push, chip.depth * fall * fall);
    }
  }
  return push;
}

// —— 单片闭合薄壳：外壁 + 内壁（径向厚度偏移）+ 全部切割断面封口 ——
// 断面（纵向裂面/横向断口/器底胎骨）复用内外壁边缘顶点 → 壳体水密；
// 顶点扰动全部是位置场的纯函数 → 相邻碎片共享边逐位一致，拼回原位零缝隙零穿模。
function buildPieceShell({ net, col, rowLo, rowHi, profile, minY, maxY, thickness, conchoidal, seed }) {
  const { R, rowsY, thetaStart, dTheta } = net;
  const width = net.widthsRad[col];
  const subCols = colsForWidth(width);
  const lines = subCols + 1;
  const rp = rowHi - rowLo;
  const height = net.height;

  const leftB = col, rightB = (col + 1) % net.nCols;
  const thL0 = thetaStart[leftB];
  const thR0 = rightB === 0 ? thetaStart[0] + TWO_PI : thetaStart[rightB];

  // 网格参数坐标 (θ, y)：边界行列直接取共享数组值（相邻碎片逐位一致）；
  // 带间界线行叠加环缝起伏 ringDy(gr,θ)（同列上下两带同公式同采样 → 环缝逐点一致）
  const nGrid = (rp + 1) * lines;
  const theta = new Float64Array(nGrid);
  const ys = new Float64Array(nGrid);
  for (let r = 0; r <= rp; r++) {
    const gr = rowLo + r;
    const tL = thL0 + dTheta[leftB][gr];
    const tR = thR0 + dTheta[rightB][gr];
    for (let c = 0; c <= subCols; c++) {
      const k = r * lines + c;
      const fr = c / subCols;
      const th = fr === 0 ? tL : fr === 1 ? tR : tL + (tR - tL) * fr;
      theta[k] = th;
      ys[k] = rowsY[gr] + ringDy(net, gr, th);
    }
  }

  // 顶点：外壁 + 内壁（径向偏移 thickness，两侧碎片公式一致）
  const pos = new Float64Array(nGrid * 2 * 3);
  const uvs = new Float64Array(nGrid * 2 * 2);
  for (let pass = 0; pass < 2; pass++) {
    const inner = pass === 1;
    const vBase = inner ? nGrid : 0;
    for (let k = 0; k < nGrid; k++) {
      const th = theta[k], y = ys[k];
      const yc = Math.min(maxY, Math.max(minY, y));
      const rOut = radiusAt(profile, yc);
      const rr = inner ? Math.max(.02, rOut - thickness) : rOut;
      const o3 = (vBase + k) * 3, o2 = (vBase + k) * 2;
      pos[o3] = Math.sin(th) * rr; pos[o3 + 1] = y; pos[o3 + 2] = Math.cos(th) * rr;
      if (inner) { uvs[o2] = 1 - th / TWO_PI; uvs[o2 + 1] = 1 - (y - minY) / height; }
      else { uvs[o2] = th / TWO_PI; uvs[o2 + 1] = (y - minY) / height; }
    }
  }
  const vout = k => k, vin = k => nGrid + k;

  // 三角面分两类：釉面（外壁/内壁/口沿）与露胎断面
  // 【关键】四边形 a→b→c→d 沿周长排列，必须沿同一条对角线拆分：(a,b,c)+(a,c,d)。
  // 曾写成 (a,b,c)+(b,c,d)：两个三角形分别跨在「a-c」和「b-d」两条对角线上，
  // 重叠右半、漏掉左半 → 每片表面都有规律的三角形空洞（成品像镂空玻璃、纹理上出现倒三角）。
  const glaze = [], bisque = [];
  const quad = (a, b, c, d, toBisque) => { (toBisque ? bisque : glaze).push(a, b, c, a, c, d); };

  // 外壁（崩边范围内的面归入露胎，模拟釉层崩落）
  for (let r = 0; r < rp; r++) for (let c = 0; c < subCols; c++) {
    const k00 = r * lines + c, k01 = k00 + 1, k10 = k00 + lines, k11 = k10 + 1;
    let chip = false;
    for (const k of [k00, k01, k10, k11]) if (chipPush(net, theta[k], ys[k]) > 0) { chip = true; break; }
    quad(vout(k00), vout(k01), vout(k11), vout(k10), chip);
  }
  // 内壁
  for (let r = 0; r < rp; r++) for (let c = 0; c < subCols; c++) {
    const k00 = r * lines + c, k01 = k00 + 1, k10 = k00 + lines, k11 = k10 + 1;
    quad(vin(k00), vin(k10), vin(k11), vin(k01), false);
  }
  // 左右纵向断面（露胎）
  for (let r = 0; r < rp; r++) {
    const k0 = r * lines, k1 = k0 + lines;
    quad(vout(k0), vin(k0), vin(k1), vout(k1), true);
    const m0 = r * lines + subCols, m1 = m0 + lines;
    quad(vout(m0), vout(m1), vin(m1), vin(m0), true);
  }
  // 底面：器底足胎骨 / 横向断口 → 露胎
  for (let c = 0; c < subCols; c++) {
    const k0 = c, k1 = k0 + 1;
    quad(vout(k0), vin(k0), vin(k1), vout(k1), true);
  }
  // 顶面：口沿（原釉面）或横向断口（露胎）
  {
    const rim = rowHi === R;
    const r = rp;
    for (let c = 0; c < subCols; c++) {
      const k0 = r * lines + c, k1 = k0 + 1;
      quad(vout(k0), vout(k1), vin(k1), vin(k0), !rim);
    }
  }

  // 顶点扰动：① 釉层崩边（外壁沿径向内压，tiny bevel/缺角感）
  //            ② 断面贝壳状 conchoidal 噪声（位置场，幅度 = thickness × 8%；低画质关闭）
  const amp = conchoidal ? thickness * P3D.conchoidal.amp : 0;
  const s1 = (seed % 89) * .53 + 2.1, s2 = (seed % 127) * .41 + 1.3, s3 = (seed % 71) * .67 + .9;
  for (let r = 0; r <= rp; r++) for (let c = 0; c <= subCols; c++) {
    const k = r * lines + c;
    const hit = chipPush(net, theta[k], ys[k]);
    if (hit > 0) {
      const o = k * 3;
      const len = Math.hypot(pos[o], pos[o + 2]) || 1;
      pos[o] -= pos[o] / len * hit; pos[o + 2] -= pos[o + 2] / len * hit;
    }
    const fracture = c === 0 || c === subCols || net.rings.has(rowLo + r);
    if (amp > 0 && fracture) {
      for (const vi of [k, nGrid + k]) {
        const o = vi * 3;
        const px = pos[o], py = pos[o + 1], pz = pos[o + 2];
        const n = valueNoise3(px * 3.1 + .5, py * 2.7 + 1.5, pz * 3.4 + 2.5, seed);
        const dx = Math.sin(px * 6.7 + s1) + .6, dyy = Math.sin(py * 5.3 + s2) + .6, dz = Math.sin(pz * 7.9 + s3) + .6;
        const dl = Math.max(.25, Math.hypot(dx, dyy, dz));
        const off = amp * n;
        pos[o] += dx / dl * off; pos[o + 1] += dyy / dl * off; pos[o + 2] += dz / dl * off;
      }
    }
  }

  // geometry.groups：组 0 = 釉面材质，组 1 = 露胎材质（mesh.material 传数组）
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex([...glaze, ...bisque]);
  if (glaze.length) geometry.addGroup(0, glaze.length, 0);
  if (bisque.length) geometry.addGroup(glaze.length, bisque.length, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return { geometry };
}

// 材质：组 0 釉面（保留 clearcoat/sheen 的青花釉），组 1 露胎断面（灰白糙胎、不贴青花、零 clearcoat）。
// vrng（任务②）：每片独立的确定性微差流——釉面 roughness/clearcoat ±8% 程序化微差
//（roughness = base×(0.92+rng()×0.16)，clearcoat 同理），打破"千片一面"；
// 微差因子存 userData（varRough/varCoat），GLB 就绪对齐 PBR 参数后由 immersive 复乘保持；
// 断口 bisque 材质保持不变；低画质为 Basic 材质（无 roughness/clearcoat 可言），不微差。
function makeFragmentMaterials(texture, low, vrng) {
  const kR = vrng ? .92 + vrng() * .16 : 1;
  const kC = vrng ? .92 + vrng() * .16 : 1;
  const glaze = low
    ? new THREE.MeshBasicMaterial({ map: texture, color: 0xf5f2ea, side: THREE.DoubleSide })
    : new THREE.MeshPhysicalMaterial({
      map: texture, color: 0xf5f2ea, roughness: .24 * kR, metalness: .03,
      clearcoat: kC, clearcoatRoughness: .14, side: THREE.DoubleSide,
      transparent: true, opacity: 1,
      emissive: new THREE.Color(P3D.glow.color), emissiveIntensity: 0,
      sheen: 1, sheenColor: new THREE.Color(0xe5d8b7), sheenRoughness: .38
    });
  if (!low && glaze.userData) { glaze.userData.varRough = kR; glaze.userData.varCoat = kC; }
  const bisque = low
    ? new THREE.MeshBasicMaterial({ color: 0xcac3b2, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({
      color: P3D.bisque.color, roughness: P3D.bisque.roughness, metalness: P3D.bisque.metalness,
      side: THREE.DoubleSide
    });
  return [glaze, bisque];
}

// —— 材质数组兼容工具（immersive / bench 里旧的单材质写法经此兼容）——
export function fragmentGlazeMaterial(fragment) {
  const m = fragment?.mesh?.material;
  const arr = Array.isArray(m) ? m : [m];
  return arr.find(x => x && x.map) ?? arr[0] ?? null;
}
export function setFragmentEmissive(material, hex, intensity) {
  for (const m of Array.isArray(material) ? material : [material]) {
    if (m && m.emissive) { m.emissive.setHex(hex); m.emissiveIntensity = intensity; }
  }
}
export function fadeFragmentEmissive(material, step) {
  for (const m of Array.isArray(material) ? material : [material]) {
    if (m && m.emissive) m.emissiveIntensity = Math.max(0, m.emissiveIntensity - step);
  }
}
export function disposeFragmentMaterial(material) {
  for (const m of Array.isArray(material) ? material : [material]) m?.dispose?.();
}

// 无 DOM（Node / 无 Canvas）时的纹理兜底：不生成贴图，材质只用纯色。
// 保证 create3DFragments 在纯 Node 环境也能跑出几何与姿态（供单元测试与确定性校验）。
export function canMakeTexture() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

// —— 落位扬尘参数（任务①，纯函数）——
// 每片 4~8 粒极细胎色尘埃：seed = siteSeed + fragmentIndex 确定性派生，重复访问逐位一致；
// 初速向上 + 径向微散 + 片内极短错峰；重力回落与 0.6s opacity 淡出由播放侧（puzzle3d-bench）执行。
export function makeDustBurst(seedBase, fragmentIndex) {
  const rng = mulberry32(((seedBase ?? 0) + fragmentIndex) >>> 0);
  const D = P3D.dust;
  const n = 4 + Math.floor(rng() * 5); // 4~8 粒
  const specs = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * TWO_PI;
    const radial = D.radialMin + rng() * (D.radialMax - D.radialMin);
    specs.push({
      vx: Math.cos(a) * radial,
      vy: D.upMin + rng() * (D.upMax - D.upMin),
      vz: Math.sin(a) * radial,
      size: D.sizeMin + rng() * (D.sizeMax - D.sizeMin),
      delay: rng() * .1
    });
  }
  return specs;
}

// 主入口：生成 count 片 3D 碎片（几何、散落、正确姿态），索引稳定。
// 几何按器身原位建模（器轴 = y 轴，工作台坐标 = 器心平移），
// correctQuaternion 恒等 → 相邻裂纹边逐点共用，拼回原位严丝合缝。
export function create3DFragments(vessel, texture, options = {}) {
  const cfg = vessel.fragments3d ?? {};
  const seed = (cfg.seed ?? options.seed ?? vessel.siteSeed) >>> 0;
  const rng = mulberry32(seed);
  const count = vessel.fragmentCount;
  const thickness = options.thickness ?? cfg.thickness ?? P3D.thickness;
  // 旧悬浮散落参数（tilt/benchDepth/scatterRadius/hoverHeight/scatterLift）随悬浮方案退役：
  // 新布局为台面真实落位，台面半径由 benchRadiusFor(count) 单值给出（与 puzzle3d-bench 同口径）。
  const low = !!(options.low || options.quality === 'low');

  const profile = vesselProfile(vessel.outline);
  const minY = profile[0].y, maxY = profile[profile.length - 1].y;

  // 纹理优先用调用方传入的；无贴图且无 DOM 时保持 null（材质退化为纯色），不抛错。
  const textureResolved = texture ?? (canMakeTexture() ? makeVesselTexture(vessel, { wrap: true }) : null);
  // 断面/外壁 UV 用全局周向角（跨碎片纹样连续），需循环采样；不改变贴图内容本身。
  if (textureResolved) textureResolved.wrapS = THREE.RepeatWrapping;

  // 共享裂纹网络 → 按「带×列」块状网格把面分配给碎片（总块数恒等于 fragmentCount）
  const net = buildCrackNetwork({ profile, minY, maxY, count, rng, seed, thickness, low });
  const pieces = [];
  for (let band = 0; band < net.bands.length; band++) {
    const [rowLo, rowHi] = net.bands[band];
    for (let col = 0; col < net.nCols; col++) {
      pieces.push({
        col, band, rowLo, rowHi,
        kind: rowLo === 0 && rowHi === net.R ? 'full' : rowLo === 0 ? 'base' : rowHi === net.R ? 'rim' : 'mid'
      });
    }
  }
  const cellIndex = new Map();
  pieces.forEach((p, i) => cellIndex.set(`${p.col}:${p.band}`, i));

  const fragments = [];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const { geometry } = buildPieceShell({
      net, col: piece.col, rowLo: piece.rowLo, rowHi: piece.rowHi,
      profile, minY, maxY, thickness, conchoidal: true, seed
    });
    // 每片独立确定性微差流（任务②）：派生自 seed^index，不消耗主 rng → 散落位姿与旧口径逐位一致
    const material = makeFragmentMaterials(textureResolved, low, mulberry32((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0));
    const mesh = new THREE.Mesh(geometry, material);
    // 带中高度处的弧宽（块状度校验用）：arcSpan = 带中半径 × 列角宽
    const midY = (net.rowsY[piece.rowLo] + net.rowsY[piece.rowHi]) / 2;
    const midR = radiusAt(profile, Math.min(maxY, Math.max(minY, midY)));
    mesh.userData = {
      id: i, fragmentIndex: i, col: piece.col, band: piece.band, kind: piece.kind,
      thetaSpan: net.widthsRad[piece.col],
      ySpan: (piece.rowHi - piece.rowLo) / net.R * net.height,
      arcSpan: midR * net.widthsRad[piece.col]
    };
    mesh.renderOrder = i;

    // 正确姿态：恒等变换即原位（几何已按器身建模）→ 拼回时相邻边严丝合缝。
    // 落位口径（任务 A）：base = 台面顶面 + 净空 - 器底 → 成品底面在台面上方留出 benchClearance，
    // 台面圆盘不再横切/遮挡器身下段（此前贴台面时像被剖切出一个圆盘截面）。
    // 全息悬浮抬升（holoLift）由 immersive 在此基础上统一叠加，金缮落回时减回即落到净空高度。
    const correctEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    const correctQuaternion = new THREE.Quaternion().setFromEuler(correctEuler);
    const correctPosition = new THREE.Vector3(0, P3D.benchTopY + P3D.benchClearance - minY, 0);

    // 散落占位：真实布局在循环后统一规划（足印重叠叠压需要全局信息）。
    const scatterPosition = new THREE.Vector3();
    const scatterQuaternion = new THREE.Quaternion();
    const scatterEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    mesh.position.copy(scatterPosition);
    mesh.quaternion.copy(scatterQuaternion);

    // adjacent：同带右邻列一片 + 同列另一带一片（单带布局退化为左右邻列）
    const col = piece.col;
    const rightCol = (col + 1) % net.nCols;
    const neighbors = [cellIndex.get(`${rightCol}:${piece.band}`)];
    if (net.nBands > 1) {
      const otherBand = piece.band === 0 ? piece.band + 1 : piece.band - 1;
      neighbors.push(cellIndex.get(`${col}:${otherBand}`));
    } else {
      neighbors.push(cellIndex.get(`${(col - 1 + net.nCols) % net.nCols}:0`));
    }
    const adjacent = neighbors.filter(v => v != null && v !== i);
    if (!adjacent.length) adjacent.push(neighbors.find(v => v != null) ?? i);

    fragments.push({
      index: i, mesh,
      correctPosition, correctQuaternion, correctEuler,
      scatterPosition, scatterQuaternion, scatterEuler,
      locked: false, revealed: false,
      storyId: vessel.stories?.[i]?.id ?? `f3d-${i}`,
      adjacent,
      pattern: null,
      seams: [],   // 金缮接缝折线（{other, pts}）：双方都锁定后由 showGoldSeams3D 浮现
      dust: makeDustBurst(vessel.siteSeed ?? seed, i)   // 落位扬尘参数（任务①，确定性）
    });
  }

  // —— 散落布局（任务 A：真实落位）——
  planScatterOnBench(fragments, net, { rng, thickness, benchR: benchRadiusFor(fragments.length) });
  for (const f of fragments) {
    f.mesh.position.copy(f.scatterPosition);
    f.mesh.quaternion.copy(f.scatterQuaternion);
  }

  // —— 金缮接缝折线（任务 B6）——
  // 折线顶点直接取自碎片几何的断口顶点（含环缝/conchoidal 位移）→ 与拼合后的缝逐点重合；
  // 同一条缝（同一 state 对象）注册到两侧碎片的 seams：双方都锁定才由 showGoldSeams3D 浮现，
  // 相邻片的金线天然首尾连续，全拼完即一张连贯金线网。
  const registerSeam = (aIdx, bIdx, pts) => {
    if (aIdx == null || bIdx == null || aIdx === bIdx || pts.length < 6) return;
    const state = { line: null };
    fragments[aIdx].seams.push({ other: bIdx, pts, state });
    fragments[bIdx].seams.push({ other: aIdx, pts, state });
  };
  // 纵向边界缝：边界 b 两侧列在同带内的两片，取右片左边界折线（c=0，含环缝起伏）
  for (let b = 0; b < net.nCols; b++) {
    for (let band = 0; band < net.nBands; band++) {
      const right = cellIndex.get(`${b}:${band}`);
      const left = cellIndex.get(`${(b - 1 + net.nCols) % net.nCols}:${band}`);
      if (right == null || left == null) continue;
      const p = pieces[right];
      const lines = colsForWidth(net.widthsRad[b]) + 1;
      const pos = fragments[right].mesh.geometry.attributes.position.array;
      const pts = [];
      for (let r = p.rowLo; r <= p.rowHi; r++) {
        const kk = (r - p.rowLo) * lines; // c = 0：右片左边界即该缝
        pts.push(pos[kk * 3], pos[kk * 3 + 1], pos[kk * 3 + 2]);
      }
      registerSeam(left, right, pts);
    }
  }
  // 横向环缝：同列相邻带之间，取下带片顶边折线（含环缝起伏与 conchoidal 位移）
  for (let colI = 0; colI < net.nCols; colI++) {
    for (let band = 0; band + 1 < net.nBands; band++) {
      const lower = cellIndex.get(`${colI}:${band}`);
      const upper = cellIndex.get(`${colI}:${band + 1}`);
      if (lower == null || upper == null) continue;
      const p = pieces[lower];
      const lines = colsForWidth(net.widthsRad[colI]) + 1;
      const pos = fragments[lower].mesh.geometry.attributes.position.array;
      const r = p.rowHi;
      const pts = [];
      for (let c = 0; c < lines; c++) {
        const kk = (r - p.rowLo) * lines + c;
        pts.push(pos[kk * 3], pos[kk * 3 + 1], pos[kk * 3 + 2]);
      }
      registerSeam(lower, upper, pts);
    }
  }

  return { fragments, texture: textureResolved, profile, minY, maxY, benchRadius: benchRadiusFor(fragments.length), rng, seed, options };
}

// —— 足印：几何包围盒 8 角经姿态 q 变换后，向"长轴 u / 横轴 w / 竖轴"投影 ——
// u = 器轴（局部 +Y）变换后的水平分量；w = 其水平垂直方向。得到该姿态下台面足印 OBB 与竖向范围。
// （导出：puzzle3d-bench 的间隙微碴（任务④）用它做"不压碎片足印"拒绝采样）
export function footprintExtent(geom, q) {
  if (!geom.boundingBox) geom.computeBoundingBox();
  const bb = geom.boundingBox;
  const u = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  u.set(u.x, 0, u.z);
  if (u.lengthSq() < 1e-8) u.set(1, 0, 0); else u.normalize();
  const w = new THREE.Vector3(u.z, 0, -u.x);
  let minU = Infinity, maxU = -Infinity, minW = Infinity, maxW = -Infinity, minY = Infinity, maxY = -Infinity;
  const c = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    c.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyQuaternion(q);
    const pu = c.dot(u), pw = c.dot(w);
    if (pu < minU) minU = pu; if (pu > maxU) maxU = pu;
    if (pw < minW) minW = pw; if (pw > maxW) maxW = pw;
    if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y;
  }
  return { u, w, halfU: (maxU - minU) / 2, cU: (maxU + minU) / 2, halfW: (maxW - minW) / 2, cW: (maxW + minW) / 2, minY, maxY };
}

// 两个台面足印 OBB（XZ 平面）分离轴测试；margin = 允许的"擦边"重叠深度（1~2mm 口径）。
function obbsOverlap(a, b, margin) {
  const dx = b.cx - a.cx, dz = b.cz - a.cz;
  const axes = [a.u, a.w, b.u, b.w];
  for (const L of axes) {
    const dist = Math.abs(dx * L.x + dz * L.z);
    const ra = a.halfU * Math.abs(a.u.x * L.x + a.u.z * L.z) + a.halfW * Math.abs(a.w.x * L.x + a.w.z * L.z);
    const rb = b.halfU * Math.abs(b.u.x * L.x + b.u.z * L.z) + b.halfW * Math.abs(b.w.x * L.x + b.w.z * L.z);
    if (dist > ra + rb - margin) return false;
  }
  return true;
}

// —— 局部 XZ 高度场：记录该碎片外壳的顶面高度（用于叠压支撑的精确接触面）——
function buildHeightField(geom, cells = 14) {
  if (!geom.boundingBox) geom.computeBoundingBox();
  const bb = geom.boundingBox;
  const w = Math.max(1e-4, bb.max.x - bb.min.x), d = Math.max(1e-4, bb.max.z - bb.min.z);
  const top = new Float32Array(cells * cells).fill(-Infinity);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y < bb.min.y + 1e-6) continue; // 只记"上表面"，底面不算支撑面
    const gx = Math.min(cells - 1, Math.max(0, Math.floor((x - bb.min.x) / w * cells)));
    const gz = Math.min(cells - 1, Math.max(0, Math.floor((z - bb.min.z) / d * cells)));
    const k = gz * cells + gx;
    if (y > top[k]) top[k] = y;
  }
  return { minX: bb.min.x, minZ: bb.min.z, w, d, cells, top };
}
function surfaceTopAt(hf, lx, lz) {
  const gx = Math.min(hf.cells - 1, Math.max(0, Math.floor((lx - hf.minX) / hf.w * hf.cells)));
  const gz = Math.min(hf.cells - 1, Math.max(0, Math.floor((lz - hf.minZ) / hf.d * hf.cells)));
  const v = hf.top[gz * hf.cells + gx];
  return v === -Infinity ? null : v;
}

// —— 散落布局：碎片真实贴台面 ——
// 姿态：72% 平放（釉面朝上、器轴放倒）/ 18% 斜靠 / 10% 侧立，另有 ±4° 微倾避免全共面；
// 环器座一圈按"大片先落位"的槽位铺开 + 大抖动（不排成规则圆环）；
// 足印重叠超过 stackGap 容差时，后放者叠压在前者顶面（层高按竖向厚度），永不悬空、不深穿模；
// 小片偏向落在已落位大片的边缘（叠压 1~2mm 的来源）。全程只消耗 rng，同 seed 逐位可复现。
export function planScatterOnBench(fragments, net, { rng, thickness, benchR }) {
  const seatR = Math.min(P3D.seatRadius, benchR * .5);
  const qx = a => new THREE.Quaternion().setFromAxisAngle(AX_X, a);
  const qy = a => new THREE.Quaternion().setFromAxisAngle(AX_Y, a);
  const qz = a => new THREE.Quaternion().setFromAxisAngle(AX_Z, a);
  for (const f of fragments) f.hf = buildHeightField(f.mesh.geometry); // 叠压支撑用高度场
  const placed = [];  // {cx,cz,u:{x,z},w:{x,z},halfU,halfW,top}
  const areas = fragments.map(f => f.mesh.userData.thetaSpan * f.mesh.userData.ySpan);
  const avgArea = areas.reduce((a, b) => a + b, 0) / Math.max(1, areas.length);
  // 大片先落位：大片槽位均匀铺开成环，小片填缝并可叠压大片
  const order = fragments.map((_, i) => i)
    .sort((a, b) => areas[b] - areas[a] || a - b);
  const globalRot = rng() * TWO_PI;

  for (let k = 0; k < order.length; k++) {
    const i = order[k], frag = fragments[i], n = fragments.length;
    const phi = globalRot + (k / n) * TWO_PI + (rng() - .5) * (TWO_PI / n) * .85;

    // 姿态档位：按落位序确定性分布（大片优先平放）——约 70% 平放 / 17% 斜靠 / 12% 侧立，
    // 保证"大部分正面朝上平放"不被随机抽样破坏。
    const kind = k % 8 === 6 ? 'side' : k % 5 === 3 ? 'lean' : 'flat';
    frag.mesh.userData.layKind = kind;
    // 朝向：长轴贴近槽位切向（长片朝向抖动收紧到 ±10°，否则径向分量会把落点压进器座圈）
    const thC = net.thetaStart[frag.mesh.userData.col] + net.widthsRad[frag.mesh.userData.col] / 2;
    let q = qy(phi - Math.PI / 2 + (rng() - .5) * .35)
      .multiply(qx(-Math.PI / 2))
      .multiply(qy(-thC));
    if (kind !== 'flat') {
      // 斜靠/侧立：绕放倒后的器轴（长轴）翻滚，边棱触地
      const rollAngle = kind === 'side'
        ? Math.PI / 2 + (rng() - .5) * .5
        : (rng() * .8 + .45) * (rng() < .5 ? -1 : 1);
      const longAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(longAxis.normalize(), rollAngle));
    }
    q.premultiply(qx((rng() - .5) * .14)).premultiply(qz((rng() - .5) * .14)); // 微倾

    const ext = footprintExtent(frag.mesh.geometry, q);

    // 环半径：中带随机；小片偏向已落位大片的边缘（自然叠压）
    let r = seatR + (benchR - seatR) * (.42 + .3 * rng());
    let cx = Math.sin(phi) * r, cz = Math.cos(phi) * r;
    if (areas[i] < avgArea * .45 && placed.length && rng() < .65) {
      const host = placed[Math.floor(rng() * placed.length)];
      const off = host.halfU * (.55 + rng() * .55) * (rng() < .5 ? -1 : 1);
      const offW = host.halfW * (.3 + rng() * .5) * (rng() < .5 ? -1 : 1);
      cx = host.cx + host.u.x * off + host.w.x * offW;
      cz = host.cz + host.u.z * off + host.w.z * offW;
    }
    // 落点修正（优先级：器座净空 > 留在台内 > 其他）：
    // ① 先向内收敛到台面内；② 若收敛会侵入器座净空圈，则停在净空圈上——
    // 宁可让碎片微探桌沿（长片足印本来就大），也不让碎片压住中央拼合位。
    const corners = [[-ext.halfU, -ext.halfW], [ext.halfU, -ext.halfW], [-ext.halfU, ext.halfW], [ext.halfU, ext.halfW]];
    const cornerMaxR = (px, pz) => Math.max(...corners.map(([cu, cw]) => Math.hypot(
      px + ext.u.x * cu + ext.w.x * cw,
      pz + ext.u.z * cu + ext.w.z * cw)));
    const cR = Math.hypot(cx, cz);
    if (cR < seatR * .75) {
      const s = seatR * .75 / Math.max(cR, 1e-4);
      cx *= s; cz *= s;
    }
    const minC = seatR * .95 + Math.min(ext.halfW * .6, .5);
    let guard = 0;
    while (guard++ < 60 && cornerMaxR(cx, cz) > benchR - .3 && Math.hypot(cx, cz) > minC) {
      cx *= .93; cz *= .93;
    }

    // 支撑高度：与已落位足印深度重叠（> stackGap）→ 采样落点处 host 的实际表面高度，落在其上
    let support = P3D.benchTopY;
    const self = { cx, cz, u: ext.u, w: ext.w, halfU: ext.halfU, halfW: ext.halfW };
    const samples = [[0, 0], ...corners];
    for (const p of placed) {
      if (p.top <= support) continue;
      if (!obbsOverlap(self, p, P3D.stackGap)) continue;
      let best = -Infinity;
      const invQ = p.q.clone().invert();
      const v = new THREE.Vector3();
      for (const [ou, ow] of samples) {
        v.set(cx + self.u.x * ou + self.w.x * ow, 0, cz + self.u.z * ou + self.w.z * ow)
          .sub(p.pos).applyQuaternion(invQ);
        const topLocal = surfaceTopAt(p.hf, v.x, v.z);
        if (topLocal != null) best = Math.max(best, p.pos.y + topLocal);
      }
      if (best > support) support = Math.min(best + .02, P3D.benchTopY + P3D.stackMax);
    }
    // mesh 原点 = 足印几何中心反推 + 底面贴合支撑面
    frag.scatterPosition.set(
      cx - ext.cU * ext.u.x - ext.cW * ext.w.x,
      support - ext.minY,
      cz - ext.cU * ext.u.z - ext.cW * ext.w.z
    );
    frag.scatterQuaternion.copy(q);
    frag.scatterEuler.setFromQuaternion(q, 'YXZ');
    placed.push({
      cx, cz, u: { x: ext.u.x, z: ext.u.z }, w: { x: ext.w.x, z: ext.w.z },
      halfU: ext.halfU, halfW: ext.halfW,
      top: support + (ext.maxY - ext.minY), // 竖向范围上沿（保守，实际接触面由高度场决定）
      pos: frag.scatterPosition, q: frag.scatterQuaternion, hf: frag.hf
    });
  }
}

export function scatter3DFragments(vessel, texture, options = {}) {
  return create3DFragments(vessel, texture, options);
}

export function fragmentDistance3D(fragment) {
  return fragment.mesh.position.distanceTo(fragment.correctPosition);
}

export function fragmentAngle3D(fragment) {
  return fragment.mesh.quaternion.angleTo(fragment.correctQuaternion);
}

// 3D 两阶段磁感：阶段一（提示）不自动归位；阶段二满足双阈值才可吸附。
export function magnetStage3D(fragment, config = P3D) {
  const dist = fragmentDistance3D(fragment);
  const ang = fragmentAngle3D(fragment);
  return {
    stage1: dist < config.magnetDistance && ang < config.magnetAngle,
    stage2: dist < config.snapDistance && ang < config.snapAngle,
    dist, ang
  };
}

// —— 对位摆动（任务 B5，纯函数）：t∈[0,1]，绕正确姿态做阻尼"寻找对位"摆动后精确吻合 ——
// 摆幅与初始距离/角度误差成正比（误差越大摆越明显），(1-t)^1.6 阻尼衰减（接近时衰减）；
// swings = 摆动次数（high 2~3 次 / low 1 次）；相位由 fragment.index 推导 → 同 seed 完全可复现。
export function seekPose3D(fragment, t, opts = {}) {
  const start = fragment.seekStart;
  const swings = opts.swings ?? P3D.seek.swingsHigh;
  const k = Math.min(1, Math.max(0, (t - .12) / .88)); // 主推进段（缓动由 gsap power2.inOut 提供）
  const decay = Math.pow(1 - t, 1.6);
  const phase = fragment.index * 2.39996; // 黄金角相位，确定性
  const position = start.position.clone().lerp(fragment.correctPosition, k);
  const distErr = start.position.distanceTo(fragment.correctPosition);
  position.addScaledVector(start.perp, distErr * .16 * decay * Math.sin(TWO_PI * swings * t + phase));
  const quaternion = start.quaternion.clone().slerp(fragment.correctQuaternion, k);
  const angErr = start.quaternion.angleTo(fragment.correctQuaternion);
  const swing = angErr * .42 * decay * Math.sin(TWO_PI * swings * t + phase * 1.7);
  if (Math.abs(swing) > 1e-4) quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(start.axis, swing));
  return { position, quaternion };
}

// 3D 碎片吸附：不再是 gsap 瞬移——先绕正确姿态小幅阻尼摆动寻位，末段"咔哒"到位。
// 音效由调用方在 onSnap 里触发（audio.tick 极短瓷片碰撞声，未启用/无资源时静音降级）。
export function snapFragment3D(fragment, onSnap = () => {}, options = {}) {
  const low = options.quality === 'low';
  const duration = low ? P3D.seek.durationLow : P3D.seek.duration; // .5s（.45~.55 口径）/ 低画质 .3s 保证滑动不卡
  fragment.locked = true;
  fragment.revealed = true;
  const startPos = fragment.mesh.position.clone();
  const startQ = fragment.mesh.quaternion.clone();
  const dir = new THREE.Vector3().subVectors(fragment.correctPosition, startPos);
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0); else perp.normalize();
  fragment.seekStart = { position: startPos, quaternion: startQ, perp, axis: perp };
  // 归位反馈只用中性冷光（用户要求：修复完成不得变金——金线只属于用户显式选择「金线表达」的收尾）
  setFragmentEmissive(fragment.mesh.material, P3D.glow.color, .22);
  const proxy = { t: 0 };
  const swings = low ? P3D.seek.swingsLow : P3D.seek.swingsHigh;
  gsap.to(proxy, {
    t: 1, duration, ease: 'power2.inOut',
    onUpdate() {
      const p = seekPose3D(fragment, proxy.t, { swings });
      fragment.mesh.position.copy(p.position);
      fragment.mesh.quaternion.copy(p.quaternion);
    },
    onComplete() {
      fragment.mesh.position.copy(fragment.correctPosition);
      fragment.mesh.quaternion.copy(fragment.correctQuaternion);
      setFragmentEmissive(fragment.mesh.material, P3D.glow.color, 0);
      onSnap?.(fragment);
    }
  });
}

// —— 金缮接缝金线（任务 B6）：双方都锁定的缝浮现细金线，常留不灭 ——
// 材质按器物共享（fragments._goldMat），一次淡入；LineBasicMaterial 无 emissive，
// additive 叠加下 opacity 即"发光度"等效口径（0 → P3D.gold.seam）。
export function showGoldSeams3D(fragments, opts = {}) {
  if (!Array.isArray(fragments)) return false;
  const target = P3D.gold.seam;
  let mat = fragments._goldMat;
  if (!mat) {
    mat = fragments._goldMat = new THREE.LineBasicMaterial({
      color: P3D.gold.color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
  }
  let created = false;
  for (const f of fragments) {
    if (!f?.locked || !Array.isArray(f.seams)) continue; // 2D 片 seams 非数组，跳过
    for (const s of f.seams) {
      if (!fragments[s.other]?.locked || s.state.line) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(s.pts, 3));
      const line = new THREE.Line(g, mat);
      line.renderOrder = 9;
      line.frustumCulled = false;
      f.mesh.add(line); // 挂为碎片 mesh 子节点：跟随归位与金缮落回，位置恒与接缝重合
      s.state.line = line;
      created = true;
    }
  }
  if (created && mat.opacity < target) {
    gsap.to(mat, { opacity: target, duration: .7, ease: 'power2.out' });
  }
  return created;
}

export function disposeGoldSeams3D(fragments) {
  if (!Array.isArray(fragments)) return;
  for (const f of fragments) {
    // 2D 路径碎片的 seams 是 {line} 对象而非折线数组——跳过，只处理 3D 金线
    if (!f || !Array.isArray(f.seams)) continue;
    for (const s of f.seams) {
      if (s.state?.line) {
        s.state.line.removeFromParent?.();
        s.state.line.geometry.dispose();
        s.state.line = null;
      }
    }
  }
  fragments._goldMat?.dispose?.();
  fragments._goldMat = null;
}

// 兜底清理：递归 dispose 容器内所有 mesh / line / points 的几何与材质（含碎片子节点金线）。
export function disposePuzzle3D(container) {
  if (!container || !Array.isArray(container.children)) return;
  const walk = (obj) => {
    for (const child of obj.children ?? []) {
      walk(child);
      child.geometry?.dispose?.();
      disposeFragmentMaterial(child.material);
      child.dispose?.();
    }
  };
  walk(container);
  try { container.clear?.(); } catch { /* 非 THREE 组对象时跳过 clear */ }
}
