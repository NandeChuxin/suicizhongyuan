// —— 模型本体碎片（2026-10-18）：碎片 = 用户 GLB 被裂纹网络真实切割出的原有结构 ——
// 与 create3DFragments（程序化 Lathe 壳 + 环绕照片纹理）的本质区别：
//   · 几何：逐三角形按「带 × 列」归属切分模型网格，断口沿三角形边界自然锯齿，
//     带间/列间边界取自与程序化版同一套裂纹网络（含纵向抖动 dTheta）→ 裂痕设计一致；
//   · 材质：直接继承 GLB 自身材质与 UV 图集（照片扫描贴图）——花纹是模型表面的
//     原有贴图随几何一起被"抠取"，不是贴纸；
//   · 断口：切割处为模型壳体的真实开口（模型带壁厚时断面即壁厚），金线/对位均走
//     真实断口边（从共享边提取折线），非近似折线。
// 拾取/吸附/落位/全息掩码等下游全部按碎片几何通用接口工作，无需感知来源。
import * as THREE from 'three';
import { buildCrackNetwork, P3D, benchRadiusFor, makeDustBurst, planScatterOnBench } from './puzzle3d.js';
import { vesselProfile } from './vessels3d.js';
import { fitToHeight } from './vessel-model.js';
import { mulberry32 } from '../data/vessels.js';

const TWO_PI = Math.PI * 2;

// 把 GLB 根对象克隆并归一化到「器型轮廓高度」，再抬进 profile 坐标系（y ∈ [minY, maxY]）
function normalizeModel(root, height, centerY) {
  const model = root.clone(true);
  model.rotation.set(0, 0, 0);
  model.position.set(0, 0, 0);
  model.scale.setScalar(1);
  model.updateMatrixWorld(true);
  fitToHeight(model, height);   // 缩放到轮廓高度，同时把几何居中到 0
  // fitToHeight 居中后 y ∈ ±H/2，而拼合系统的坐标契约是 profile 系（y ∈ [minY, maxY]，
  // 器型不对称时 centerY ≠ 0，如梅瓶 −3.35..3.8）：全息壳（asmY+profile 几何）、
  // 成品 GLB（asmY+centerY，局部居中）都按这个契约摆放。碎片几何若停在 0 居中，
  // correctPosition 会比旧口径高出 centerY，终章动画里瓷器模型与金线整体错位。
  model.position.y += centerY;
  model.updateMatrixWorld(true);
  return model;
}

export function create3DModelFragments(vessel, root, options = {}) {
  if (!root) throw new Error('create3DModelFragments: 缺少 GLB root');
  const cfg = vessel.fragments3d ?? {};
  const seed = (cfg.seed ?? options.seed ?? vessel.siteSeed) >>> 0;
  const rng = mulberry32(seed);
  const count = vessel.fragmentCount;
  const thickness = options.thickness ?? cfg.thickness ?? P3D.thickness;

  const profile = vesselProfile(vessel.outline);
  const minY = profile[0].y, maxY = profile[profile.length - 1].y;
  const height = Math.max(1e-4, maxY - minY);

  // 1) 归一化模型（与展示挂载同一 fitToHeight 口径，再抬进 profile 坐标系）
  const model = normalizeModel(root, height, (minY + maxY) / 2);
  model.updateMatrixWorld(true);

  // 2) 裂纹网络：与程序化版同一套设计（带×列、dTheta 抖动）→ 裂痕走向一致
  const net = buildCrackNetwork({ profile, minY, maxY, count, rng, seed, thickness, low: false });
  const { R, rowsY, thetaStart, dTheta, nCols, nBands, widthsRad, bands } = net;

  const pieces = [];
  for (let band = 0; band < bands.length; band++) {
    const [rowLo, rowHi] = bands[band];
    for (let col = 0; col < nCols; col++) {
      pieces.push({ col, band, rowLo, rowHi });
    }
  }
  const cellIndex = new Map();
  pieces.forEach((p, i) => cellIndex.set(`${p.col}:${p.band}`, i));

  // 归属函数：顶点 → (带, 列)。列边界取该行高度的 dTheta 抖动值（与程序化裂痕同一位置场）。
  const rowOfY = y => Math.min(R, Math.max(0, Math.round((y - minY) / height * R)));
  const boundaryTh = (b, gr) => thetaStart[b] + dTheta[b][gr];
  const cellOf = (x, y, z) => {
    const gr = rowOfY(y);
    let band = nBands - 1;
    for (let b = 0; b < nBands; b++) {
      if (gr < bands[b][1] || (b === nBands - 1 && gr <= bands[b][1])) { band = b; break; }
    }
    let th = Math.atan2(x, z);
    let a = th - boundaryTh(0, gr);
    a = ((a % TWO_PI) + TWO_PI) % TWO_PI;
    let col = nCols - 1;
    for (let c = 0; c < nCols; c++) {
      const lo = boundaryTh(c, gr) - boundaryTh(0, gr);
      const hiN = (c + 1) % nCols;
      const hi = (hiN === 0 ? boundaryTh(0, gr) + TWO_PI : boundaryTh(hiN, gr)) - boundaryTh(0, gr);
      if (a >= lo && a < hi) { col = c; break; }
    }
    const id = cellIndex.get(`${col}:${band}`);
    return id == null ? cellIndex.get(`${col}:${Math.min(band, nBands - 1)}`) : id;
  };

  // 3) 收集三角形并分配
  const materials = [];
  const matSeen = new Map();
  const triCell = [];     // 每个三角形 → cell id（按追加顺序）
  const triEdgeBase = []; // 每个三角形在合并索引里的起始顶点 id
  const parts = [];       // { geometry, firstTri, triCount }（顺序与 materials 对齐的遍历序）
  let triTotal = 0;

  // 先遍历一遍收集（合并索引稍后统一构建）
  model.updateMatrixWorld(true);
  // 烘焙矩阵直接用 node.matrixWorld：模型根在原点、姿态归零，世界坐标即归一化器身坐标
  //（fitToHeight 的缩放已在 matrixWorld 里）。曾用 inv(model.matrixWorld) 相乘，
  // 会把归一化缩放抵消掉，切出的碎片只剩原始小尺寸（0~1.15）。
  const sources = [];
  model.traverse(node => {
    if (!node.isMesh || !node.geometry?.attributes?.position) return;
    const g = node.geometry;
    const matList = Array.isArray(node.material) ? node.material : [node.material];
    const idx = g.index;
    const triN = idx ? idx.count / 3 : g.attributes.position.count / 3;
    const ranges = [];
    if (Array.isArray(node.material) && g.groups?.length) {
      for (const grp of g.groups) ranges.push([grp.start, grp.count, grp.materialIndex ?? 0]);
    } else {
      ranges.push([0, triN * 3, 0]);
    }
    sources.push({ g, rel: node.matrixWorld.clone(), matList, ranges, idx });
  });

  // 合并几何（索引式：整段拷贝属性 + 索引偏移；同时生成 triMat）
  let vTotal = 0, iTotal = 0;
  for (const s of sources) {
    vTotal += s.g.attributes.position.count;
    iTotal += s.idx ? s.idx.count : s.g.attributes.position.count;
  }
  const merged = { position: new Float32Array(vTotal * 3), normal: new Float32Array(vTotal * 3), uv: new Float32Array(vTotal * 2) };
  const mIndex = new Uint32Array(iTotal);
  const triMat = [];

  let vOff = 0, iOff = 0;
  for (const s of sources) {
    const g = s.g;
    const pA = g.attributes.position, nA = g.attributes.normal, uA = g.attributes.uv;
    for (let i = 0; i < pA.count; i++) {
      let x = pA.getX(i), y = pA.getY(i), z = pA.getZ(i);
      // rel 已含缩放：法线用旋转部分（rel 的 scale 与旋转一起，近似即可——模型为等比缩放）
      const o = (vOff + i) * 3;
      merged.position[o] = x; merged.position[o + 1] = y; merged.position[o + 2] = z;
      if (nA) { merged.normal[o] = nA.getX(i); merged.normal[o + 1] = nA.getY(i); merged.normal[o + 2] = nA.getZ(i); }
      if (uA) { const o2 = (vOff + i) * 2; merged.uv[o2] = uA.getX(i); merged.uv[o2 + 1] = uA.getY(i); }
    }
    // rel 变换 position（顶点烘焙进 model 局部系）
    {
      const arr = merged.position;
      for (let i = 0; i < pA.count; i++) {
        const o = (vOff + i) * 3;
        const x = arr[o], y = arr[o + 1], z = arr[o + 2];
        arr[o] = s.rel.elements[0] * x + s.rel.elements[4] * y + s.rel.elements[8] * z + s.rel.elements[12];
        arr[o + 1] = s.rel.elements[1] * x + s.rel.elements[5] * y + s.rel.elements[9] * z + s.rel.elements[13];
        arr[o + 2] = s.rel.elements[2] * x + s.rel.elements[6] * y + s.rel.elements[10] * z + s.rel.elements[14];
      }
      if (g.attributes.normal) {
        const nrm = new THREE.Matrix3().getNormalMatrix(s.rel);
        const e = nrm.elements;
        for (let i = 0; i < pA.count; i++) {
          const o = (vOff + i) * 3;
          const x = merged.normal[o], y = merged.normal[o + 1], z = merged.normal[o + 2];
          merged.normal[o] = e[0] * x + e[3] * y + e[6] * z;
          merged.normal[o + 1] = e[1] * x + e[4] * y + e[7] * z;
          merged.normal[o + 2] = e[2] * x + e[5] * y + e[8] * z;
        }
      }
    }
    // 材质表（去重）
    const matIdxs = s.matList.map(m => {
      if (!matSeen.has(m)) { matSeen.set(m, materials.length); materials.push(m); }
      return matSeen.get(m);
    });
    // 索引 + 三角形材质
    const triN = (s.idx ? s.idx.count : g.attributes.position.count) / 3;
    for (const [start, count3, mi] of s.ranges) {
      const t0 = start / 3, t1 = (start + count3) / 3;
      for (let t = t0; t < t1; t++) {
        for (let k = 0; k < 3; k++) {
          const src = s.idx ? s.idx.getX(t * 3 + k) : t * 3 + k;
          mIndex[iOff++] = src + vOff;
        }
        triMat.push(matIdxs[mi] ?? 0);
        triCell.push(-1);
        triEdgeBase.push(iOff - 3);
      }
    }
    vOff += pA.count;
  }
  triTotal = triMat.length;

  // 4) 三角形归属 + 断口边
  const cellTris = pieces.map(() => []);
  const edgeMap = new Map(); // 'a_b'(顶点对) → [cellA, cellB]
  for (let t = 0; t < triTotal; t++) {
    const o = triEdgeBase[t];
    const a = mIndex[o], b = mIndex[o + 1], c = mIndex[o + 2];
    const cx = (merged.position[a * 3] + merged.position[b * 3] + merged.position[c * 3]) / 3;
    const cy = (merged.position[a * 3 + 1] + merged.position[b * 3 + 1] + merged.position[c * 3 + 1]) / 3;
    const cz = (merged.position[a * 3 + 2] + merged.position[b * 3 + 2] + merged.position[c * 3 + 2]) / 3;
    const cell = cellOf(cx, cy, cz) ?? 0;
    triCell[t] = cell;
    cellTris[cell].push(t);
    const es = [[a, b], [b, c], [c, a]];
    for (const [p, q] of es) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      let e = edgeMap.get(key);
      if (!e) { e = { v1: Math.min(p, q), v2: Math.max(p, q), cells: [] }; edgeMap.set(key, e); }
      e.cells.push(cell);
    }
  }

  // 5) 断口折线：共享边两侧 cell 不同 → 真实断口边；按 cell 对分组后串成折线
  const seamGroups = new Map(); // 'cellA|cellB' → edges[{v1,v2}]
  for (const e of edgeMap.values()) {
    if (e.cells.length < 2) continue;
    const [c1, c2] = e.cells;
    if (c1 === c2) continue;
    const key = c1 < c2 ? `${c1}|${c2}` : `${c2}|${c1}`;
    if (!seamGroups.has(key)) seamGroups.set(key, []);
    seamGroups.get(key).push(e);
  }
  const seamPolylines = new Map(); // 'cellA|cellB' → [pts...]
  for (const [key, edges] of seamGroups) {
    // 顶点邻接 → 贪心串链
    const adj = new Map();
    for (const e of edges) {
      for (const [p, q] of [[e.v1, e.v2], [e.v2, e.v1]]) {
        if (!adj.has(p)) adj.set(p, []);
        adj.get(p).push(q);
      }
    }
    const used = new Set();
    const lines = [];
    for (const e of edges) {
      const k0 = e.v1 < e.v2 ? `${e.v1}_${e.v2}` : `${e.v2}_${e.v1}`;
      if (used.has(k0)) continue;
      used.add(k0);
      const line = [e.v1, e.v2];
      for (const dir of [1, 0]) {
        let end = dir ? line[line.length - 1] : line[0];
        for (;;) {
          const cands = (adj.get(end) || []).filter(n => {
            const k = end < n ? `${end}_${n}` : `${n}_${end}`;
            return !used.has(k);
          });
          if (!cands.length) break;
          const nxt = cands[0];
          const k = end < nxt ? `${end}_${nxt}` : `${nxt}_${end}`;
          used.add(k);
          if (dir) line.push(nxt); else line.unshift(nxt);
          end = nxt;
        }
      }
      if (line.length >= 2) lines.push(line);
    }
    const pts = [];
    for (const line of lines) {
      // 降采样：折线点数上限 ~160，保留首尾
      const step = Math.max(1, Math.ceil(line.length / 160));
      for (let i = 0; i < line.length; i += step) {
        const v = line[i];
        pts.push(merged.position[v * 3], merged.position[v * 3 + 1], merged.position[v * 3 + 2]);
      }
      const v = line[line.length - 1];
      pts.push(merged.position[v * 3], merged.position[v * 3 + 1], merged.position[v * 3 + 2]);
    }
    if (pts.length >= 6) seamPolylines.set(key, pts);
  }

  // 6) 每片几何（非索引拷贝 + 材质分组）
  // 全器统一落位基准：每片的 correctPosition.y 必须用「全器最低点」而不是各自包围盒——
  // 否则不同高度的碎片拼回时上下错位，带间出现裂缝（蒜头瓶颈身断裂即此因）。
  let modelMinY = Infinity;
  for (let i = 1; i < merged.position.length; i += 3) if (merged.position[i] < modelMinY) modelMinY = merged.position[i];
  const fragments = [];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const tris = cellTris[i];
    const byMat = new Map();
    for (const t of tris) {
      const mi = triMat[t];
      if (!byMat.has(mi)) byMat.set(mi, []);
      byMat.get(mi).push(t);
    }
    const nV = tris.length * 3;
    const pos = new Float32Array(nV * 3);
    const nrm = new Float32Array(nV * 3);
    const uvA = new Float32Array(nV * 2);
    const geo = new THREE.BufferGeometry();
    let w = 0;
    const groups = [];
    for (const [mi, list] of [...byMat.entries()].sort((a, b) => a[0] - b[0])) {
      const startV = w;
      for (const t of list) {
        const o = triEdgeBase[t];
        for (let k = 0; k < 3; k++) {
          const v = mIndex[o + k];
          pos[w * 3] = merged.position[v * 3]; pos[w * 3 + 1] = merged.position[v * 3 + 1]; pos[w * 3 + 2] = merged.position[v * 3 + 2];
          nrm[w * 3] = merged.normal[v * 3]; nrm[w * 3 + 1] = merged.normal[v * 3 + 1]; nrm[w * 3 + 2] = merged.normal[v * 3 + 2];
          uvA[w * 2] = merged.uv[v * 2]; uvA[w * 2 + 1] = merged.uv[v * 2 + 1];
          w++;
        }
      }
      groups.push({ startV, countV: w - startV, mi });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
    for (const g of groups) geo.addGroup(g.startV, g.countV, g.mi); // 非索引：start/count 以顶点计
    const mesh = new THREE.Mesh(geo, materials);

    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const bb = geo.boundingBox;
    const midY = (bb.min.y + bb.max.y) / 2;
    const midR = radiusAtSafe(profile, midY);
    mesh.userData = {
      id: i, fragmentIndex: i, col: piece.col, band: piece.band,
      kind: bands[piece.band][0] === 0 && bands[piece.band][1] === R ? 'full' : bands[piece.band][0] === 0 ? 'base' : bands[piece.band][1] === R ? 'rim' : 'mid',
      thetaSpan: net.widthsRad[piece.col],
      ySpan: (bands[piece.band][1] - bands[piece.band][0]) / R * height,
      arcSpan: midR * net.widthsRad[piece.col],
      fromModel: true
    };
    mesh.renderOrder = i;

    const correctEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    const correctQuaternion = new THREE.Quaternion().setFromEuler(correctEuler);
    const correctPosition = new THREE.Vector3(0, P3D.benchTopY + P3D.benchClearance - modelMinY, 0);
    const scatterPosition = new THREE.Vector3();
    const scatterQuaternion = new THREE.Quaternion();
    const scatterEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    mesh.position.copy(scatterPosition);
    mesh.quaternion.copy(scatterQuaternion);

    fragments.push({
      index: i, mesh,
      correctPosition, correctQuaternion, correctEuler,
      scatterPosition, scatterQuaternion, scatterEuler,
      locked: false, revealed: false,
      storyId: vessel.stories?.[i]?.id ?? `f3d-${i}`,
      adjacent: [],
      pattern: null,
      seams: [],
      dust: makeDustBurst(vessel.siteSeed ?? seed, i)
    });
  }

  // 7) 断口折线注册（真实断口边，双片共享同一 state）
  const registerSeam = (aIdx, bIdx, pts) => {
    if (aIdx == null || bIdx == null || aIdx === bIdx || pts.length < 6) return;
    const state = { line: null };
    fragments[aIdx].seams.push({ other: bIdx, pts, state });
    fragments[bIdx].seams.push({ other: aIdx, pts, state });
  };
  for (const [key, pts] of seamPolylines) {
    const [a, b] = key.split('|').map(Number);
    registerSeam(a, b, pts);
  }

  // 8) 散落布局（与程序化版同一落位器）
  planScatterOnBench(fragments, net, { rng, thickness, benchR: benchRadiusFor(fragments.length) });
  for (const f of fragments) {
    f.mesh.position.copy(f.scatterPosition);
    f.mesh.quaternion.copy(f.scatterQuaternion);
  }

  // adjacent：同带右邻列 + 同列另一带
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const rightCol = (piece.col + 1) % nCols;
    const neighbors = [cellIndex.get(`${rightCol}:${piece.band}`)];
    if (nBands > 1) {
      const otherBand = piece.band === 0 ? piece.band + 1 : piece.band - 1;
      neighbors.push(cellIndex.get(`${piece.col}:${otherBand}`));
    } else {
      neighbors.push(cellIndex.get(`${(piece.col - 1 + nCols) % nCols}:0`));
    }
    const adjacent = neighbors.filter(v => v != null && v !== i);
    if (!adjacent.length) adjacent.push(neighbors.find(v => v != null) ?? i);
    fragments[i].adjacent = adjacent;
  }

  // 全器 bbox（口径与 create3DFragments 一致）
  let gMinY = Infinity, gMaxY = -Infinity;
  for (const f of fragments) {
    const bb = f.mesh.geometry.boundingBox;
    gMinY = Math.min(gMinY, bb.min.y);
    gMaxY = Math.max(gMaxY, bb.max.y);
  }

  return { fragments, profile, minY: gMinY, maxY: gMaxY, benchRadius: benchRadiusFor(fragments.length), rng, seed, options, fromModel: true };
}

function radiusAtSafe(profile, y) {
  // 与 puzzle3d.radiusAt 同口径的线性插值（profile: [{x,y},...]，y 升序）
  if (!profile.length) return 1;
  if (y <= profile[0].y) return Math.abs(profile[0].x);
  if (y >= profile[profile.length - 1].y) return Math.abs(profile[profile.length - 1].x);
  for (let i = 1; i < profile.length; i++) {
    if (y <= profile[i].y) {
      const a = profile[i - 1], b = profile[i];
      const t = (y - a.y) / Math.max(1e-6, b.y - a.y);
      return Math.abs(a.x + (b.x - a.x) * t);
    }
  }
  return Math.abs(profile[profile.length - 1].x);
}
