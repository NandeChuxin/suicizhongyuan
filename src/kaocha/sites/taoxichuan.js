// 陶溪川文创街区：包豪斯锯齿形屋顶厂房群、红砖烟囱、水景广场、邑空间桁架、入口钢构门架。
// 注意（资料来源结论）：园区总平面无权威资料，本轮**只做可确认的厂房单体 + 烟囱 + 水景关系**，不臆造总规。
import * as THREE from 'three';
import { SITES } from '../data/sites.js';
import { createLOD } from '../kernel/lod.js';
import { mulberry32 } from '../kernel/noise.js';
import {
  boxMesh, slabGround, sawtoothRoof, chimney, trussRoof, steelFrameGate,
  latticeWindow, doublePitchRoof, stoneRailing
} from '../kernel/parts.js';
import { ROOF } from '../kernel/units.js';

function mark(object, component, tier) {
  object.traverse(node => {
    node.userData.component = component;
    if (tier) node.userData.tier = tier;
  });
  return object;
}

// ---- 锯齿厂房端部山墙：随锯齿剖面起伏（竖向天窗面 + 坡屋面），不是一块平板 ----
function sawtoothGable({ width, moduleWidth, eaveH, crestH, thickness = 0.36, material }) {
  const count = Math.max(1, Math.round(width / moduleWidth));
  const w = width / count;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(-width / 2, crestH);
  for (let i = 0; i < count; i++) {
    const z0 = -width / 2 + i * w;
    shape.lineTo(z0 + w, eaveH);
    if (i < count - 1) shape.lineTo(z0 + w, crestH);
  }
  shape.lineTo(width / 2, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  // Shape 的 x 轴需映射到世界 Z（厂房宽度方向），故绕 Y 轴转 -90°
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.y = -Math.PI / 2;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// ---- 锯齿形屋顶厂房（长向沿 X，锯齿沿宽度 Z 等距重复） ----
function buildSawtoothHall(cfg, mat, detail) {
  const group = new THREE.Group();
  group.name = '锯齿形厂房';
  const { length, width, moduleWidth, eaveH, crestH } = cfg;
  const t = 0.36;

  group.add(boxMesh(length + 0.8, 0.4, width + 0.8, mat('stoneStep')).translateY(0.2));

  if (detail === 'far') {
    const block = boxMesh(length, eaveH, width, mat('redBrick'));
    block.position.y = eaveH / 2 + 0.4;
    group.add(block);
    // 远景用一排"齿"交代锯齿轮廓
    const count = Math.max(1, Math.round(width / moduleWidth));
    const w = width / count;
    for (let i = 0; i < count; i++) {
      const crest = boxMesh(length, crestH - eaveH, w * 0.6, mat('redBrick'));
      crest.position.set(0, (eaveH + crestH) / 2 + 0.4, -width / 2 + i * w + w * 0.3);
      group.add(crest);
    }
    return group;
  }

  // 四面红砖墙（清水勾缝）
  for (const sz of [-1, 1]) {
    const face = boxMesh(length, eaveH, t, mat('redBrick'));
    face.position.set(0, eaveH / 2 + 0.4, sz * (width / 2 - t / 2));
    group.add(face);
  }
  // 两端山墙：随锯齿剖面起伏，封到屋脊高度（不能只做矩形板，否则屋顶与墙之间留缝）
  for (const sx of [-1, 1]) {
    const gable = sawtoothGable({
      width, moduleWidth, eaveH: eaveH + 0.4, crestH: crestH + 0.4,
      thickness: t, material: mat('redBrick')
    });
    gable.position.set(sx > 0 ? length / 2 : -length / 2 + t, 0.4, 0);
    group.add(gable);
  }

  // 大面积钢框窗（老厂房的识别特征）：深色玻璃底 + 钢框钢棂
  const winRows = 2;
  for (const sz of [-1, 1]) {
    for (let i = 0; i < winRows; i++) {
      for (let b = 0; b < Math.floor(length / moduleWidth); b++) {
        const cx = -length / 2 + moduleWidth * (b + 0.5);
        const cy = 1.6 + i * 2.0 + 0.4;
        // 窗洞玻璃（贴墙外皮，白天深色、夜间透暖光）
        const pane = boxMesh(moduleWidth * 0.62, 1.44, 0.03, mat('windowGlow'));
        pane.position.set(cx, cy, sz * (width / 2 + 0.012));
        group.add(pane);
        const win = latticeWindow({ width: moduleWidth * 0.66, height: 1.5, cols: 4, rows: 3, material: mat('steel') });
        win.position.set(cx, cy, sz * (width / 2 + 0.05));
        win.rotation.y = sz > 0 ? 0 : Math.PI;
        group.add(win);
      }
    }
  }
  // 门洞
  const door = boxMesh(3.0, 2.8, 0.3, mat('darkWood'));
  door.position.set(0, 1.4, width / 2 + 0.02);
  group.add(door);

  const roof = sawtoothRoof({
    length,
    width,
    moduleWidth,
    eaveHeight: eaveH + 0.4,
    crestHeight: crestH + 0.4,
    // 屋面用灰色金属板，锯齿竖面为采光天窗（不可用砖材，否则整片读成一块大坡顶）
    material: mat('steel'),
    glazingMaterial: mat('glazing'),
    roofThickness: 0.14
  });
  group.add(roof);

  return group;
}

// ---- 邑空间：暴露白色三角桁架 + 红砖墙 + 玻璃店面（taoxichuan_007） ----
function buildAtelier(cfg, mat, detail) {
  const group = new THREE.Group();
  group.name = '邑空间';
  const length = cfg.bayWidth * cfg.bays;
  const h = cfg.trussHeight + 1.6;

  group.add(boxMesh(length + 0.6, 0.3, cfg.span + 0.6, mat('stoneStep')).translateY(0.15));

  if (detail === 'far') {
    const block = boxMesh(length, h, cfg.span, mat('redBrick'));
    block.position.y = h / 2;
    group.add(block);
    return group;
  }

  for (const sz of [-1, 1]) {
    const face = boxMesh(length, h, 0.36, mat('redBrick'));
    face.position.set(0, h / 2 + 0.3, sz * (cfg.span / 2 - 0.18));
    group.add(face);
  }
  for (const sx of [-1, 1]) {
    const gable = boxMesh(0.36, h, cfg.span, mat('redBrick'));
    gable.position.set(sx * (length / 2 - 0.18), h / 2 + 0.3, 0);
    group.add(gable);
  }
  // 玻璃店面（朝向 -Z 的广场一侧）
  const shop = boxMesh(length * 0.8, 2.6, 0.08, mat('glass'));
  shop.position.set(0, 1.6, -cfg.span / 2 - 0.02);
  group.add(shop);
  for (let i = 0; i < cfg.bays; i++) {
    const mullion = boxMesh(0.14, 2.6, 0.16, mat('steel'));
    mullion.position.set(-length * 0.4 + (length * 0.8 / cfg.bays) * i, 1.6, -cfg.span / 2 - 0.06);
    group.add(mullion);
  }

  const truss = trussRoof({ length, span: cfg.span, height: cfg.trussHeight, bays: cfg.bays, material: mat('steel') });
  truss.position.y = h + 0.2;
  group.add(truss);

  group.position.set(cfg.x, 0, cfg.z);
  group.rotation.y = cfg.rotY;
  return group;
}

// ---- 入口钢构门架 + 耐候钢标识墙 ----
function buildEntrance(cfg, mat) {
  const group = new THREE.Group();
  group.name = '入口钢构门架';
  const gate = steelFrameGate({
    frames: cfg.frames,
    frameWidth: cfg.frameWidth,
    frameHeight: cfg.frameHeight,
    tilt: cfg.tilt * Math.PI / 180,
    spacing: cfg.spacing,
    material: mat('steel')
  });
  group.add(gate);
  const sign = boxMesh(cfg.signLength, 2.2, 0.22, mat('weatherSteel'));
  sign.position.set(0, 1.1, -3.2);
  group.add(sign);
  // 标识墙镂空竖缝
  for (let i = 0; i < 14; i++) {
    const slit = boxMesh(0.16, 1.5, 0.06, mat('ground'));
    slit.position.set(-cfg.signLength / 2 + 0.6 + i * ((cfg.signLength - 1.2) / 13), 1.2, -3.06);
    group.add(slit);
  }
  group.position.set(cfg.x, 0, cfg.z);
  return group;
}

// ---- 远景：城市轮廓 + 山体剪影 ----
function buildFar(cfg, mat, seed) {
  const group = new THREE.Group();
  group.name = '远景城市轮廓';
  for (const hill of cfg.hills) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(hill.r, hill.h, 7, 1), mat('ground'));
    cone.position.set(hill.x, hill.h / 2 - 2, hill.z);
    group.add(cone);
  }
  const rng = mulberry32(seed);
  const { skyline } = cfg;
  for (let i = 0; i < skyline.count; i++) {
    const h = skyline.height * (0.4 + rng());
    const w = 12 + rng() * 22;
    const block = boxMesh(w, h, skyline.depth, mat('stone'));
    block.position.set(
      skyline.x + (i / (skyline.count - 1) - 0.5) * skyline.spread,
      h / 2,
      skyline.z + (rng() - 0.5) * 50
    );
    group.add(block);
  }
  return group;
}

export function createTaoxichuanScene({ library, environment, quality, lodManager }) {
  const site = SITES.taoxichuan;
  const L = site.layout;
  const mat = id => library.get(id);
  const root = new THREE.Group();
  root.name = site.name;
  const lods = [];

  function addLOD(component, near, mid, far) {
    const lod = createLOD({
      near: near ? mark(near, component, 'near') : null,
      mid: mark(mid, component, 'mid'),
      far: far ? mark(far, component, 'far') : null,
      distances: site.lod
    });
    lod.name = component;
    root.add(lod);
    lodManager?.add(lod, { distances: site.lod });
    lods.push(lod);
    return lod;
  }

  const ground = slabGround({ width: site.ground.width, depth: site.ground.depth, material: mat('ground') });
  mark(ground, 'ground', 'mid');
  root.add(ground);

  // 三栋锯齿形厂房（同一构件，逐栋按官网 22 栋中的可确认单体建模）
  for (const hall of L.halls) {
    const cfg = { ...L.sawtooth };
    const near = buildSawtoothHall(cfg, mat, 'near');
    const mid = buildSawtoothHall(cfg, mat, 'mid');
    const far = buildSawtoothHall(cfg, mat, 'far');
    for (const g of [near, mid, far]) {
      g.position.set(hall.x, 0, hall.z);
      g.rotation.y = hall.rotY;
    }
    addLOD('sawtooth', near, mid, far);
  }

  // 红砖烟囱（高 20m，锥形收分 + 顶部收口）
  {
    const near = chimney({ height: L.chimney.height, rBase: L.chimney.rBase, rTop: L.chimney.rTop, material: mat('redBrick'), segments: 32 });
    near.position.set(L.chimney.x, 0, L.chimney.z);
    const mid = chimney({ height: L.chimney.height, rBase: L.chimney.rBase, rTop: L.chimney.rTop, material: mat('redBrick'), segments: 16 });
    mid.position.set(L.chimney.x, 0, L.chimney.z);
    const far = boxMesh(L.chimney.rBase * 2, L.chimney.height, L.chimney.rBase * 2, mat('redBrick'));
    far.position.set(L.chimney.x, L.chimney.height / 2, L.chimney.z);
    addLOD('chimney', near, mid, far);
  }

  // 水景广场：镜面浅水池 + 卵石池底 + 石岸 + 环水木栈道
  {
    const bed = slabGround({ width: L.pool.width, depth: L.pool.depth, material: mat('cobble'), y: 0.02 });
    bed.position.set(L.pool.x, 0.02, L.pool.z);
    root.add(mark(bed, 'pool', 'near'));
    const water = slabGround({ width: L.pool.width, depth: L.pool.depth, material: mat('water'), y: L.pool.rim });
    water.position.set(L.pool.x, L.pool.rim, L.pool.z);
    root.add(mark(water, 'pool', 'near'));
    for (const [sx, sz, w, d] of [
      [0, -1, L.pool.width + 0.9, 0.45],
      [0, 1, L.pool.width + 0.9, 0.45],
      [-1, 0, 0.45, L.pool.depth + 0.9],
      [1, 0, 0.45, L.pool.depth + 0.9]
    ]) {
      const h = L.pool.rim + 0.1;
      const rim = boxMesh(w, h, d, mat('stone'));
      rim.position.set(
        L.pool.x + sx * (L.pool.width / 2 + 0.225),
        h / 2,
        L.pool.z + sz * (L.pool.depth / 2 + 0.225)
      );
      root.add(mark(rim, 'pool', 'near'));
    }
    // 环水木栈道（两条长边）
    for (const sz of [-1, 1]) {
      const deck = boxMesh(L.pool.width + 2.4, 0.18, 1.6, mat('wood'));
      deck.position.set(L.pool.x, 0.5, L.pool.z + sz * (L.pool.depth / 2 + 1.3));
      root.add(mark(deck, 'pool', 'mid'));
      const rail = stoneRailing({ length: L.pool.width + 2.4, height: 1.0, postGap: 2.2, material: mat('steel') });
      rail.position.set(L.pool.x, 0.59, L.pool.z + sz * (L.pool.depth / 2 + 2.05));
      root.add(mark(rail, 'pool', 'mid'));
    }
  }

  // 邑空间
  {
    const near = buildAtelier(L.atelier, mat, 'near');
    const mid = buildAtelier(L.atelier, mat, 'mid');
    const far = buildAtelier(L.atelier, mat, 'far');
    addLOD('atelier', near, mid, far);
  }

  // 入口钢构门架
  root.add(mark(buildEntrance(L.gate, mat), 'gate', 'mid'));

  // 厂区辅助建筑（老厂房的次要体块，让场地不空——仅示意，不做臆造总规）
  {
    const rng = mulberry32(site.seed + 7);
    for (let i = 0; i < 6; i++) {
      const w = 14 + rng() * 12;
      const d = 10 + rng() * 8;
      const h = 4.5 + rng() * 2.5;
      const x = -80 + rng() * 160;
      const z = 40 + rng() * 40;
      const block = boxMesh(w, h, d, mat('redBrick'));
      block.position.set(0, h / 2, 0);
      const roof = doublePitchRoof({
        width: d + 0.8, depth: w + 0.8, slope: ROOF.hardSlope, eaveY: h,
        material: mat('roofTile'), ridgeMaterial: mat('redBrick'),
        type: 'hard', overhang: 0.5, ridgeHeight: 0.26, tileRidges: false,
        // 补三角山墙，避免屋面两端悬空
        gableMaterial: mat('redBrick'), gableWidth: d,
        gableThickness: 0.24, gableOffset: w / 2 - 0.12
      });
      roof.rotation.y = Math.PI / 2;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.add(block, roof);
      root.add(mark(g, 'sawtooth', 'far'));
    }
  }

  root.add(mark(buildFar(L.far, mat, site.seed), 'farSkyline', 'far'));

  for (const light of site.roleLights) {
    environment?.addRoleLight(light.role, new THREE.Vector3(...light.position), light.options);
  }

  return {
    id: site.id,
    site,
    root,
    lods,
    cameras: site.cameras,
    focus: new THREE.Vector3(0, 5, 0),
    dispose() {
      root.traverse(node => {
        if (node.geometry) node.geometry.dispose();
      });
      root.parent?.remove(root);
      lods.length = 0;
    }
  };
}