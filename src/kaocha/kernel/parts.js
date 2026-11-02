// 参数化构件库（白模 + 结构层）。
// 关键约定：所有 UV 以**米**为单位铺设，配合 kernel/materials.js 里
// repeat = 1/tileU 的贴图，砖缝、瓦垄、石缝就会自动落在真实尺寸上（见 units.js）。
// 硬边一律不做绝对直角：构件带倒角或厚度，避免"塑料盒"观感。
import * as THREE from 'three';
import { BRICK, TILE, TIMBER, TILE as T, PLINTH, DEG, HUMAN_HEIGHT } from './units.js';

// 给几何体补 uv1（AO 贴图默认用它），并保持原有硬边法线不被平滑。
function meterReady(geometry) {
  const uv = geometry.attributes.uv;
  if (uv) geometry.setAttribute('uv1', new THREE.BufferAttribute(uv.array, 2));
  return geometry;
}

// BoxGeometry 六面各自按真实尺寸铺 UV（面序：+X -X +Y -Y +Z -Z，每面 4 个顶点）。
export function boxMeterUV(geometry, sx, sy, sz) {
  const uv = geometry.attributes.uv;
  if (uv && uv.count === 24) {
    const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
    for (let f = 0; f < 6; f++) {
      const [du, dv] = dims[f];
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        uv.setXY(i, uv.getX(i) * du, uv.getY(i) * dv);
      }
    }
    uv.needsUpdate = true;
  }
  return meterReady(geometry);
}

// 平面按真实尺寸铺 UV（PlaneGeometry 单面 4 顶点）。
export function planeMeterUV(geometry, w, h) {
  const uv = geometry.attributes.uv;
  if (uv) {
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
    uv.needsUpdate = true;
  }
  return meterReady(geometry);
}

// 旋转体按真实周长/素线长铺 UV（烟囱、穹顶）。
export function latheMeterUV(geometry, circumference, profileLength) {
  const uv = geometry.attributes.uv;
  if (uv) {
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circumference, uv.getY(i) * profileLength);
    uv.needsUpdate = true;
  }
  return meterReady(geometry);
}

// ----------------------------------------------------------------------
// 基础体块
// ----------------------------------------------------------------------
export function boxMesh(w, h, d, material, { bevel = 0 } = {}) {
  const w2 = Math.max(0.001, w - bevel * 2);
  const geo = new THREE.BoxGeometry(w2, h, Math.max(0.001, d - bevel * 2));
  boxMeterUV(geo, w2, h, Math.max(0.001, d - bevel * 2));
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// 台基 + 踏跺（几乎所有官式建筑都有，做上它比例才立得住）
export function plinth({ width, depth, height = PLINTH.height, material, steps = 0, stepSide = 'south' }) {
  const group = new THREE.Group();
  group.name = '台基';
  const base = boxMesh(width, height, depth, material);
  base.position.y = height / 2;
  group.add(base);
  // 压边线（台基上沿一圈收进的细边）
  const cap = boxMesh(width + 0.08, 0.06, depth + 0.08, material);
  cap.position.y = height + 0.03;
  group.add(cap);

  if (steps > 0) {
    const rise = PLINTH.stepHeight;
    const tread = 0.30;
    const flightW = Math.min(width * 0.4, 3.0);
    for (let i = 0; i < steps; i++) {
      const s = boxMesh(flightW, rise, tread, material);
      s.position.set(0, height - rise * (i + 1) + rise / 2, 0);
      const dir = stepSide === 'south' ? 1 : -1;
      s.position.z = dir * (depth / 2 + tread * (i + 0.5));
      group.add(s);
    }
  }
  return group;
}

// ----------------------------------------------------------------------
// 墙体
// ----------------------------------------------------------------------
// 清水砖墙（整片）：中/远档用，靠贴图表达砌法。
export function wall({ length, height, thickness = 0.24, material }) {
  const mesh = boxMesh(length, height, thickness, material, { bevel: 0.008 });
  mesh.position.y = height / 2;
  return mesh;
}

// 逐砖实例化清水砖墙：近景高模用，真实错缝砌法 + 收分 + 逐砖色差。
export function brickWallDetailed({
  length, height, thickness = 0.24, material,
  brick = BRICK, taper = 0.0, seed = 1
}) {
  const group = new THREE.Group();
  group.name = '清水砖墙（实例化）';
  const cols = Math.max(1, Math.floor(length / brick.moduleX));
  const rows = Math.max(1, Math.floor(height / brick.moduleY));
  const count = cols * rows;

  const geo = new THREE.BoxGeometry(brick.length, brick.height, brick.width);
  geo.translate(0, 0, 0);
  const inst = new THREE.InstancedMesh(meterReady(geo), material, count);
  inst.castShadow = inst.receiveShadow = true;
  inst.name = '砖（InstancedMesh）';

  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  let i = 0;
  const halfLen = cols * brick.moduleX / 2;
  for (let r = 0; r < rows; r++) {
    const y = brick.height / 2 + r * brick.moduleY;
    const bond = (r & 1) * brick.moduleX * 0.5;
    // 收分：越往上墙体越向内收（相邻皮错开 1–3mm）
    const inset = taper * (r / rows);
    for (let c = 0; c < cols; c++) {
      const x = -halfLen + bond + brick.length / 2 + c * brick.moduleX;
      if (x - brick.length / 2 > halfLen) continue;
      m.makeTranslation(x, y, inset);
      inst.setMatrixAt(i, m);
      // 逐砖色差：青砖不是纯灰，同一面墙要有深浅
      const v = (hash(c, r, seed) - 0.5) * 0.16;
      color.setRGB(1 + v, 1 + v * 0.92, 1 + v * 0.86);
      inst.setColorAt(i, color);
      i++;
      if (i >= count) break;
    }
    if (i >= count) break;
  }
  inst.count = i;
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  group.add(inst);
  return group;
}

function hash(x, y, seed) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 2147483629;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 山墙三角填充：把两端"半空"的双坡屋面封成实心山面（硬山/悬山都必须有）。
// Shape 在 XY 平面构建（X = 跨度方向，Y = 高度），挤出方向为局部 +Z（即屋脊方向）。
function gableInfill({ width, rise, thickness, material }) {
  const half = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  meterReady(geo);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// ----------------------------------------------------------------------
// 双坡屋面（硬山顶 / 悬山顶）
// 硬山：屋面不出山墙；悬山：两端出挑。
// 传 gableMaterial 即自动补两端三角山墙（否则屋面两端只剩一块悬空薄板）。
// ----------------------------------------------------------------------
export function doublePitchRoof({
  width, depth, slope = 24 * DEG, eaveY = 0,
  material, ridgeMaterial, type = 'hard', overhang = 0.6,
  gableOverhang = 0, ridgeHeight = 0.28, thickness = 0.07,
  tileRidges = false,
  gableMaterial = null, gableOffset = null, gableThickness = 0.24,
  gableWidth = null
}) {
  const group = new THREE.Group();
  group.name = type === 'hard' ? '硬山顶屋面' : '悬山顶屋面';

  const gableOut = type === 'overhang' ? (gableOverhang || 0.35) : gableOverhang;
  const slabDepth = depth + gableOut * 2;
  const halfSpan = width / 2 + overhang;
  const slopeLen = halfSpan / Math.cos(slope);
  const rise = halfSpan * Math.tan(slope);
  const ridgeY = eaveY + rise;
  const ridgeLen = slabDepth + 0.2;

  for (const side of [1, -1]) {
    const slopeGroup = new THREE.Group();
    const slab = boxMesh(slopeLen, thickness, slabDepth, material, { bevel: 0.01 });
    slopeGroup.add(slab);
    // 檐口滴水线
    const fascia = boxMesh(0.10, 0.14, slabDepth, ridgeMaterial || material);
    fascia.position.set(slopeLen / 2 - 0.05, -0.02, 0);
    slopeGroup.add(fascia);

    if (tileRidges) {
      const gap = T.ridgeGap;
      const n = Math.max(2, Math.floor(slabDepth / gap));
      const geo = new THREE.CylinderGeometry(0.052, 0.052, slopeLen, 6, 1, false);
      geo.rotateZ(Math.PI / 2);
      meterReady(geo);
      const inst = new THREE.InstancedMesh(geo, ridgeMaterial || material, n);
      inst.name = '盖瓦（InstancedMesh）';
      inst.castShadow = inst.receiveShadow = true;
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        m.makeTranslation(0, thickness / 2 + 0.03, -slabDepth / 2 + (i + 0.5) * gap);
        inst.setMatrixAt(i, m);
      }
      inst.instanceMatrix.needsUpdate = true;
      // 瓦垄是"盖瓦"，比瓦面高出一线，用自身几何偏移实现
      slopeGroup.add(inst);
    }

    slopeGroup.rotation.z = -side * slope;
    const nx = Math.sin(slope) * side, ny = Math.cos(slope);
    slopeGroup.position.set(
      side * halfSpan / 2 + nx * thickness / 2,
      (eaveY + rise / 2) + ny * thickness / 2,
      0
    );
    group.add(slopeGroup);
  }

  // 两端三角山墙填充（硬山/悬山都需要，否则屋面两端只剩悬空薄板）
  if (gableMaterial) {
    const gz = gableOffset ?? (depth / 2 - gableThickness / 2);
    for (const sz of [1, -1]) {
      const gable = gableInfill({
        width: gableWidth ?? halfSpan * 2,
        rise,
        thickness: gableThickness,
        material: gableMaterial
      });
      gable.position.set(0, eaveY, sz * gz);
      group.add(gable);
    }
  }

  // 正脊（硬山顶常见带脊饰的红脊，见 yuyao_007）
  const ridge = boxMesh(0.32, ridgeHeight, ridgeLen, ridgeMaterial || material);
  ridge.position.set(0, ridgeY + ridgeHeight / 2 - 0.02, 0);
  group.add(ridge);
  const ridgeCap = boxMesh(0.40, 0.06, ridgeLen + 0.06, ridgeMaterial || material);
  ridgeCap.position.set(0, ridgeY + ridgeHeight + 0.01, 0);
  group.add(ridgeCap);

  group.userData.ridgeY = ridgeY;
  group.userData.eaveY = eaveY;
  return group;
}

// ----------------------------------------------------------------------
// 穿斗式木构（窑房、敞廊、六式窑）与抬梁式（古建厅堂）
// 结构：落地柱 + 柱础石 + 多道穿枋 + 纵向檩条
// ----------------------------------------------------------------------
export function timberFrame({
  length, depth, height,
  columnGap = 1.25, levels = [1.30, 2.30], eaveLevel = null,
  material, baseMaterial, columnDia = TIMBER.columnDia, purlinGap = TIMBER.purlinGap
}) {
  const group = new THREE.Group();
  group.name = '穿斗式木构';
  const eave = eaveLevel ?? height;

  const cols = Math.max(2, Math.round(length / columnGap) + 1);
  const span = length / (cols - 1);
  const colGeo = new THREE.CylinderGeometry(columnDia / 2, columnDia / 2 * 1.04, height, 10);
  latheMeterUV(colGeo, Math.PI * columnDia, height);
  const baseGeo = new THREE.CylinderGeometry(columnDia * 0.9, columnDia * 1.0, 0.12, 10);
  latheMeterUV(baseGeo, Math.PI * columnDia * 2, 0.12);

  const tieGeoCache = new Map();
  for (let i = 0; i < cols; i++) {
    const x = -length / 2 + i * span;
    for (const z of [-depth / 2, depth / 2]) {
      const col = new THREE.Mesh(colGeo, material);
      col.position.set(x, height / 2, z);
      col.castShadow = col.receiveShadow = true;
      group.add(col);
      const base = new THREE.Mesh(baseGeo, baseMaterial || material);
      base.position.set(x, 0.06, z);
      base.castShadow = base.receiveShadow = true;
      group.add(base);
    }
  }

  // 穿枋：横向贯穿所有柱，是穿斗式的识别特征
  const allLevels = [...levels, eave];
  for (const y of allLevels) {
    for (const z of [-depth / 2, depth / 2]) {
      const key = `tie-${y}-${z}`;
      let geo = tieGeoCache.get(key);
      if (!geo) {
        geo = new THREE.BoxGeometry(length, TIMBER.tieBeam, 0.12);
        boxMeterUV(geo, length, TIMBER.tieBeam, 0.12);
        tieGeoCache.set(key, geo);
      }
      const tie = new THREE.Mesh(geo, material);
      tie.position.set(0, y, z);
      tie.castShadow = tie.receiveShadow = true;
      group.add(tie);
    }
  }

  // 檩条：纵向（沿 length）布在柱顶与中间层，承屋面
  const purlins = Math.max(2, Math.round(depth / purlinGap));
  for (let i = 0; i < purlins; i++) {
    const z = -depth / 2 + (depth / (purlins - 1)) * i;
    const geo = new THREE.CylinderGeometry(0.09, 0.09, length, 8);
    geo.rotateZ(Math.PI / 2);
    latheMeterUV(geo, Math.PI * 0.18, length);
    for (const y of [eave, eave - 0.24]) {
      const purlin = new THREE.Mesh(geo, material);
      purlin.position.set(0, y, z);
      purlin.castShadow = purlin.receiveShadow = true;
      group.add(purlin);
    }
  }
  return group;
}

// 抬梁式梁架（古建厅堂、佑陶灵祠门罩）
export function postAndBeamFrame({ length, depth, height, bays = 3, material, baseMaterial }) {
  const group = new THREE.Group();
  group.name = '抬梁式梁架';
  const span = length / bays;
  const colGeo = new THREE.CylinderGeometry(0.13, 0.14, height, 10);
  latheMeterUV(colGeo, Math.PI * 0.27, height);

  for (let i = 0; i <= bays; i++) {
    const x = -length / 2 + i * span;
    for (const z of [-depth / 2, depth / 2]) {
      const col = new THREE.Mesh(colGeo, material);
      col.position.set(x, height / 2, z);
      col.castShadow = col.receiveShadow = true;
      group.add(col);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.14, 10), baseMaterial || material);
      base.position.set(x, 0.07, z);
      base.castShadow = base.receiveShadow = true;
      group.add(base);
    }
    // 大梁：沿进深方向架在柱头
    const beam = boxMesh(0.20, 0.34, depth, material);
    beam.position.set(x, height - 0.17, 0);
    group.add(beam);
    // 瓜柱 + 上层短梁
    const post = boxMesh(0.16, 0.46, 0.16, material);
    post.position.set(x, height + 0.23, 0);
    group.add(post);
    const upper = boxMesh(0.16, 0.24, depth * 0.62, material);
    upper.position.set(x, height + 0.55, 0);
    group.add(upper);
  }
  // 檩条
  for (const z of [-depth / 2, 0, depth / 2]) {
    const geo = new THREE.CylinderGeometry(0.10, 0.10, length, 8);
    geo.rotateZ(Math.PI / 2);
    latheMeterUV(geo, Math.PI * 0.2, length);
    const p = new THREE.Mesh(geo, material);
    p.position.set(0, height - 0.02, z);
    p.castShadow = p.receiveShadow = true;
    group.add(p);
  }
  return group;
}

// ----------------------------------------------------------------------
// 门窗
// ----------------------------------------------------------------------
// 木棂窗（圆通风孔另用 openRoundHole）
export function latticeWindow({ width = 1.4, height = 1.6, cols = 5, rows = 6, material, frameDepth = 0.09 }) {
  const group = new THREE.Group();
  group.name = '木棂窗';
  const bar = 0.045;
  const frame = 0.075;
  group.add(place(boxMesh(width, frame, frameDepth, material), 0, height / 2 - frame / 2, 0));
  group.add(place(boxMesh(width, frame, frameDepth, material), 0, -height / 2 + frame / 2, 0));
  group.add(place(boxMesh(frame, height, frameDepth, material), -width / 2 + frame / 2, 0, 0));
  group.add(place(boxMesh(frame, height, frameDepth, material), width / 2 - frame / 2, 0, 0));
  const innerW = width - frame * 2, innerH = height - frame * 2;
  for (let i = 1; i < cols; i++) {
    const x = -innerW / 2 + (innerW / cols) * i;
    group.add(place(boxMesh(bar, innerH, frameDepth * 0.7, material), x, 0, 0));
  }
  for (let j = 1; j < rows; j++) {
    const y = -innerH / 2 + (innerH / rows) * j;
    group.add(place(boxMesh(innerW, bar, frameDepth * 0.7, material), 0, y, 0));
  }
  return group;
}

function place(mesh, x, y, z) { mesh.position.set(x, y, z); return mesh; }

// 圆通风孔（yuyao_007 清水砖墙上的圆形通风孔）
export function roundVentHole({ radius = 0.22, material, depth = 0.10 }) {
  const geo = new THREE.TorusGeometry(radius, 0.035, 6, 16);
  meterReady(geo);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// 格扇门（古建厅堂的隔扇）
export function latticeDoor({ width = 0.9, height = 2.4, cols = 4, rows = 8, material }) {
  const g = latticeWindow({ width, height, cols, rows, material, frameDepth: 0.10 });
  g.name = '格扇门';
  return g;
}

// ----------------------------------------------------------------------
// 地面
// ----------------------------------------------------------------------
export function slabGround({ width, depth, material, y = 0 }) {
  const geo = new THREE.PlaneGeometry(width, depth);
  planeMeterUV(geo, width, depth);
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

// ----------------------------------------------------------------------
// 包豪斯锯齿形屋面（陶溪川厂房）
// 锯齿沿**建筑宽度（width，Z 向）**等距重复，每个锯齿的坡面沿**长向（length，X）**贯通：
// 竖向天窗面（高）在 z0 处，坡屋面自脊顶向 +Z 落到檐口，一排排锯齿朝同一方向采光。
// ----------------------------------------------------------------------
export function sawtoothRoof({
  length, width, moduleWidth, eaveHeight, crestHeight,
  material, glazingMaterial = null, roofThickness = 0.12,
  count: countArg = null
}) {
  const group = new THREE.Group();
  group.name = '锯齿形屋面';
  const count = Math.max(1, countArg || Math.round(width / moduleWidth));
  const w = width / count;
  const rise = crestHeight - eaveHeight;
  const slopeRun = w;
  const slopeLen = Math.hypot(slopeRun, rise);
  const angle = Math.atan2(rise, slopeRun);
  const L = length * 0.98;
  const midY = (eaveHeight + crestHeight) / 2;

  for (let i = 0; i < count; i++) {
    const z0 = -width / 2 + i * w;
    // 竖向天窗（发光面板）：沿长向贯通，位于该锯齿的高侧
    if (glazingMaterial) {
      const glass = boxMesh(L * 0.94, rise * 0.9, 0.10, glazingMaterial);
      glass.position.set(0, midY, z0 + 0.06);
      glass.castShadow = false;
      group.add(glass);
      // 天窗上下横梁（钢框）
      for (const y of [eaveHeight + 0.06, crestHeight - 0.06]) {
        const rail = boxMesh(L, 0.12, 0.16, material);
        rail.position.set(0, y, z0 + 0.06);
        group.add(rail);
      }
      // 天窗竖梃（每开间一根）
      const mullions = Math.max(2, Math.round(length / 6));
      for (let m = 0; m <= mullions; m++) {
        const post = boxMesh(0.10, rise, 0.14, material);
        post.position.set(-L / 2 + (L / mullions) * m, midY, z0 + 0.06);
        group.add(post);
      }
    }
    // 坡屋面：脊端（z0，高）→ 檐端（z0+w，低），沿长向贯通
    const slab = boxMesh(L, roofThickness, slopeLen, material, { bevel: 0.01 });
    slab.rotation.x = angle;
    slab.position.set(0, midY, z0 + w / 2);
    group.add(slab);
    // 檐口薄檐板（收边）
    const fascia = boxMesh(L, 0.10, 0.14, material);
    fascia.position.set(0, eaveHeight - 0.03, z0 + w);
    group.add(fascia);
  }
  group.userData.eaveHeight = eaveHeight;
  group.userData.crestHeight = crestHeight;
  group.userData.toothCount = count;
  return group;
}

// ----------------------------------------------------------------------
// 红砖烟囱（下粗上细带锥形收分，顶部收口）
// ----------------------------------------------------------------------
export function chimney({ height, rBase, rTop, material, wallThickness = 0.5, segments = 28 }) {
  const group = new THREE.Group();
  group.name = '砖烟囱';
  const inner = Math.max(0.12, rTop - 0.12);
  const profile = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // 轻微外凸的收分曲线，越往下越粗
    const r = rBase + (rTop - rBase) * Math.pow(t, 0.82);
    profile.push(new THREE.Vector2(r, t * height));
  }
  const geo = new THREE.LatheGeometry(profile, segments);
  latheMeterUV(geo, 2 * Math.PI * (rBase + rTop) / 2, height);
  const body = new THREE.Mesh(geo, material);
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  // 顶部收口：一圈加厚的压顶
  const capGeo = new THREE.CylinderGeometry(rTop * 1.10, rTop * 1.06, 0.55, segments);
  latheMeterUV(capGeo, 2 * Math.PI * rTop, 0.55);
  const cap = new THREE.Mesh(capGeo, material);
  cap.position.y = height + 0.20;
  cap.castShadow = cap.receiveShadow = true;
  group.add(cap);

  // 顶部内壁（仰视能看见筒口）
  const boreGeo = new THREE.CylinderGeometry(inner, inner, 1.2, segments, 1, true);
  const bore = new THREE.Mesh(boreGeo, material);
  bore.position.y = height - 0.3;
  bore.material.side = THREE.DoubleSide;
  group.add(bore);

  void wallThickness;
  group.userData.top = height + 0.48;
  return group;
}

// ----------------------------------------------------------------------
// 筒拱（御窑厂博物馆的多曲面拱体）：半环截面挤出，带真实壁厚与端头
// ----------------------------------------------------------------------
export function barrelVault({
  radius, length, thickness = 0.6, material, baseY = 0, segments = 36
}) {
  const group = new THREE.Group();
  group.name = '筒拱';
  const shape = new THREE.Shape();
  const rIn = radius - thickness;
  shape.moveTo(radius, 0);
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI * i / segments;
    shape.lineTo(radius * Math.cos(a), radius * Math.sin(a));
  }
  for (let i = segments; i >= 0; i--) {
    const a = Math.PI * i / segments;
    shape.lineTo(rIn * Math.cos(a), rIn * Math.sin(a));
  }
  shape.closePath();
  // ExtrudeGeometry 的世界坐标 UV 恰好就是"米"，与砖贴图重复率天然吻合
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 1,
    curveSegments: segments
  });
  geo.translate(0, 0, -length / 2);
  meterReady(geo);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = baseY;
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  group.userData.height = radius + baseY;
  return group;
}

// ----------------------------------------------------------------------
// 拱形窑体（镇窑蛋形 / 葫芦窑前大后小 / 龙窑斜置长条 / 狮子窑近似）
// 用一个"沿长度收分的半椭圆拱实体"统一表达：
//   环向半椭圆 → 拱；沿长度插值收分 → 蛋形/葫芦形的识别特征。
// UV：u = 环向弧长（米），v = 纵向长度（米）。
// ----------------------------------------------------------------------
export function archedSolid({
  length, frontWidth, backWidth, frontHeight, backHeight,
  rings = 24, segments = 20, material, cap = true
}) {
  const positions = [];
  const uvs = [];
  const indices = [];

  const ringData = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const w = frontWidth + (backWidth - frontWidth) * t;
    const h = frontHeight + (backHeight - frontHeight) * t;
    ringData.push({ t, w, h });
  }

  for (let i = 0; i <= rings; i++) {
    const { t, w, h } = ringData[i];
    const z = -length / 2 + t * length;
    let arc = 0;
    let prev = null;
    for (let j = 0; j <= segments; j++) {
      const a = Math.PI * j / segments;
      const x = -(w / 2) * Math.cos(a);
      const y = h * Math.sin(a);
      if (prev) arc += Math.hypot(x - prev.x, y - prev.y);
      prev = { x, y };
      positions.push(x, y, z);
      uvs.push(arc, z);
    }
  }

  const stride = segments + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = (i + 1) * stride + j;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  meterReady(geo);

  const group = new THREE.Group();
  group.name = '拱形窑体';
  const shell = new THREE.Mesh(geo, material);
  shell.material = material;
  shell.castShadow = shell.receiveShadow = true;
  group.add(shell);

  if (cap) {
    // 两端封头：用同样弧线做扇形收口，避免镂空穿视
    for (const [idx, sign] of [[0, -1], [rings, 1]]) {
      const { w, h } = ringData[idx];
      const pos = [];
      const uvs2 = [];
      const idxs = [];
      pos.push(0, h * 0.5, 0); uvs2.push(0, 0);
      for (let j = 0; j <= segments; j++) {
        const a = Math.PI * j / segments;
        const x = -(w / 2) * Math.cos(a);
        const y = h * Math.sin(a);
        pos.push(x, y, 0);
        uvs2.push(x, y);
      }
      for (let j = 1; j <= segments; j++) idxs.push(0, j, j + 1);
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g2.setAttribute('uv', new THREE.Float32BufferAttribute(uvs2, 2));
      g2.setIndex(idxs);
      g2.computeVertexNormals();
      meterReady(g2);
      const capMesh = new THREE.Mesh(g2, material);
      capMesh.position.z = sign * length / 2;
      capMesh.castShadow = capMesh.receiveShadow = true;
      group.add(capMesh);
    }
  }
  group.userData.length = length;
  return group;
}

// 穹顶窑体（元代馒头窑：马蹄形窑床 + 砖砌穹顶 + 两根烟囱）
export function domeBody({ radius, height, material, segments = 28 }) {
  const profile = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    profile.push(new THREE.Vector2(radius * Math.cos(t * Math.PI / 2) + 0.02, height * Math.sin(t * Math.PI / 2)));
  }
  const geo = new THREE.LatheGeometry(profile, segments);
  latheMeterUV(geo, 2 * Math.PI * radius, height);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// ----------------------------------------------------------------------
// 石栏（龙珠阁、石拱桥的望柱栏杆）
// ----------------------------------------------------------------------
export function stoneRailing({ length, height = 1.05, postGap = 2.0, material }) {
  const group = new THREE.Group();
  group.name = '石栏';
  const rail = boxMesh(length, 0.14, 0.22, material);
  rail.position.y = height;
  group.add(rail);
  const sub = boxMesh(length, 0.09, 0.16, material);
  sub.position.y = height * 0.42;
  group.add(sub);
  const n = Math.max(2, Math.round(length / postGap));
  const postGeo = new THREE.BoxGeometry(0.20, height + 0.16, 0.24);
  boxMeterUV(postGeo, 0.20, height + 0.16, 0.24);
  for (let i = 0; i <= n; i++) {
    const post = new THREE.Mesh(postGeo, material);
    post.position.set(-length / 2 + (length / n) * i, (height + 0.16) / 2, 0);
    post.castShadow = post.receiveShadow = true;
    group.add(post);
  }
  return group;
}

// ----------------------------------------------------------------------
// 钢构：入口门架（倾斜矩形钢框）与三角桁架（邑空间）
// ----------------------------------------------------------------------
export function steelFrameGate({ frames = 5, frameWidth = 1.6, frameHeight = 5.0, tilt = 12 * DEG, spacing = 2.4, material }) {
  const group = new THREE.Group();
  group.name = '钢构门架';
  const t = 0.14;
  for (let i = 0; i < frames; i++) {
    const frame = new THREE.Group();
    frame.add(place(boxMesh(frameWidth, t, t, material), 0, frameHeight / 2, 0));
    frame.add(place(boxMesh(frameWidth, t, t, material), 0, -frameHeight / 2, 0));
    frame.add(place(boxMesh(t, frameHeight, t, material), -frameWidth / 2, 0, 0));
    frame.add(place(boxMesh(t, frameHeight, t, material), frameWidth / 2, 0, 0));
    frame.rotation.z = tilt;
    frame.position.set((i - (frames - 1) / 2) * spacing, frameHeight / 2 * Math.cos(tilt), 0);
    group.add(frame);
  }
  return group;
}

export function trussRoof({ length, span, height, bays = 4, material }) {
  const group = new THREE.Group();
  group.name = '三角桁架';
  const t = 0.10;
  const n = Math.max(1, bays);
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + (length / n) * i;
    const truss = new THREE.Group();
    // 下弦
    truss.add(place(boxMesh(span, t, t, material), 0, 0, 0));
    // 上弦两段
    const chordLen = Math.hypot(span / 2, height);
    const up = boxMesh(chordLen, t, t, material);
    up.rotation.z = Math.atan2(height, span / 2);
    up.position.set(span / 4, height / 2, 0);
    truss.add(up);
    const up2 = boxMesh(chordLen, t, t, material);
    up2.rotation.z = -Math.atan2(height, span / 2);
    up2.position.set(-span / 4, height / 2, 0);
    truss.add(up2);
    // 腹杆
    for (const k of [-0.6, 0, 0.6]) {
      const v = boxMesh(t, height * (1 - Math.abs(k)) + 0.1, t, material);
      v.position.set(k * span / 2, (height * (1 - Math.abs(k))) / 2, 0);
      truss.add(v);
    }
    truss.position.x = x;
    group.add(truss);
  }
  return group;
}

// ----------------------------------------------------------------------
// 比例参照：1.7m 人物剪影（HUD 打开时加入场景，用于直接判读比例）
// ----------------------------------------------------------------------
export function humanSilhouette(height = HUMAN_HEIGHT, color = 0x101418) {
  const group = new THREE.Group();
  group.name = `人物参照 ${height}m`;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, depthWrite: false });
  const legH = height * 0.47, torsoH = height * 0.31, headR = height * 0.075;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(height * 0.16, legH, height * 0.10), mat);
  legs.position.y = legH / 2;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(height * 0.24, torsoH, height * 0.13), mat);
  torso.position.y = legH + torsoH / 2;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 10, 8), mat);
  head.position.y = legH + torsoH + headR * 1.05;
  group.add(head);
  group.userData.isReference = true;
  return group;
}

// 匣钵堆（窑具，古窑满地都是，成本低、识别度高）
export function saggerPile({ count = 6, radius = 0.30, x = 0, z = 0, seed = 3, material }) {
  const group = new THREE.Group();
  group.name = '匣钵堆';
  const geo = new THREE.CylinderGeometry(radius, radius * 0.94, 0.20, 14);
  latheMeterUV(geo, 2 * Math.PI * radius, 0.20);
  const inst = new THREE.InstancedMesh(geo, material, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const jx = (hash(i, seed, 7) - 0.5) * 0.05;
    const jz = (hash(i, seed, 13) - 0.5) * 0.05;
    m.makeTranslation(x + jx, 0.10 + i * 0.21, z + jz);
    inst.setMatrixAt(i, m);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = inst.receiveShadow = true;
  group.add(inst);
  return group;
}

// 松柴垛（古窑复烧燃料，guyao_068 / guyao_123）
export function firewoodStack({ length = 2.4, height = 1.2, depth = 1.0, material, rows = 5 }) {
  const group = new THREE.Group();
  group.name = '松柴垛';
  const perRow = Math.max(4, Math.round(depth / 0.14));
  const r = 0.065;
  const geo = new THREE.CylinderGeometry(r, r, length, 7);
  geo.rotateZ(Math.PI / 2);
  latheMeterUV(geo, Math.PI * r * 2, length);
  const total = perRow * rows;
  const inst = new THREE.InstancedMesh(geo, material, total);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let row = 0; row < rows; row++) {
    const y = r + row * r * 1.7;
    const off = (row & 1) * r * 0.9;
    for (let c = 0; c < perRow; c++) {
      const z = -depth / 2 + off + c * (depth / perRow);
      m.makeTranslation(0, y, z);
      inst.setMatrixAt(i++, m);
    }
  }
  inst.count = i;
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = inst.receiveShadow = true;
  group.add(inst);
  void height;
  return group;
}

// 晾晒坯架（guyao_098 / guyao_033：木架上列阵瓷坯，是古窑独有的识别特征）
export function greenwareRack({ length = 4.0, height = 1.9, depth = 0.8, material, blankMaterial, shelves = 4, perShelf = 7 }) {
  const group = new THREE.Group();
  group.name = '晾晒坯架';
  const postGeo = new THREE.BoxGeometry(0.09, height, 0.09);
  boxMeterUV(postGeo, 0.09, height, 0.09);
  for (const x of [-length / 2 + 0.05, length / 2 - 0.05]) {
    for (const z of [-depth / 2, depth / 2]) {
      const p = new THREE.Mesh(postGeo, material);
      p.position.set(x, height / 2, z);
      p.castShadow = p.receiveShadow = true;
      group.add(p);
    }
  }
  const shelfGeo = new THREE.BoxGeometry(length, 0.05, depth * 0.9);
  boxMeterUV(shelfGeo, length, 0.05, depth * 0.9);
  const bowlGeo = new THREE.CylinderGeometry(0.10, 0.055, 0.075, 12);
  latheMeterUV(bowlGeo, Math.PI * 0.2, 0.075);
  const bowlInst = new THREE.InstancedMesh(bowlGeo, blankMaterial, shelves * perShelf);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let s = 0; s < shelves; s++) {
    const y = 0.30 + s * ((height - 0.4) / shelves);
    const shelf = new THREE.Mesh(shelfGeo, material);
    shelf.position.set(0, y, 0);
    shelf.castShadow = shelf.receiveShadow = true;
    group.add(shelf);
    for (let b = 0; b < perShelf; b++) {
      const x = -length / 2 + 0.25 + b * ((length - 0.5) / Math.max(1, perShelf - 1));
      m.makeTranslation(x, y + 0.065, 0);
      bowlInst.setMatrixAt(n++, m);
    }
  }
  bowlInst.count = n;
  bowlInst.instanceMatrix.needsUpdate = true;
  bowlInst.castShadow = bowlInst.receiveShadow = true;
  group.add(bowlInst);
  return group;
}

void BRICK; void TIMBER; void TILE;