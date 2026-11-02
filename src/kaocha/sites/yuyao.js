// 御窑厂国家考古遗址公园：真实比例体块 + 主要结构（Stage A）。
// 每个构件用 userData.component 标注来源，HUD 据此显示"此构件依据哪张参考图"。
import * as THREE from 'three';
import { SITES } from '../data/sites.js';
import { createLOD } from '../kernel/lod.js';
import { mulberry32 } from '../kernel/noise.js';
import {
  boxMesh, slabGround, plinth, wall, doublePitchRoof, postAndBeamFrame,
  latticeWindow, roundVentHole, barrelVault, stoneRailing
} from '../kernel/parts.js';
import { ROOF } from '../kernel/units.js';

// 构件归属 + LOD 档位标注：HUD 靠 component 找溯源，lod.js 靠 tier 排档。
function mark(object, component, tier) {
  object.traverse(node => {
    node.userData.component = component;
    if (tier) node.userData.tier = tier;
  });
  return object;
}

// ---- 御窑博物馆：8 个多曲面筒拱（拱高 = 半径，轴沿 Z） ----
function buildMuseum(cfg, mat, detail) {
  const group = new THREE.Group();
  group.name = '御窑博物馆';
  for (const v of cfg.vaults) {
    if (detail === 'far') {
      const proxy = boxMesh(v.r * 2, v.r, v.len, mat('qingBrick'));
      proxy.position.set(v.x, v.r / 2, v.z);
      group.add(proxy);
      continue;
    }
    const vault = barrelVault({
      radius: v.r,
      length: v.len,
      thickness: 0.60,
      material: mat(detail === 'near' ? 'qingBrickWorn' : 'qingBrick'),
      baseY: 0.0,
      segments: detail === 'near' ? 44 : 18
    });
    vault.position.set(v.x, 0, v.z);
    group.add(vault);
  }
  // 老窑砖夹砌带（约占 20%，见景点简介）：近档用一道深色砖带表达
  if (detail === 'near') {
    for (const v of cfg.vaults) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(v.r + 0.02, 0.09, 5, 48, Math.PI),
        mat('kilnBrick')
      );
      band.position.set(v.x, 0.02, v.z + v.len * 0.28);
      band.rotation.z = 0;
      group.add(band);
    }
  }
  return group;
}

// ---- 龙珠阁：珠山台地 + 3 层重檐楼阁（层数与总高为图测，待确认） ----
function buildLongzhu(cfg, mat, detail) {
  const group = new THREE.Group();
  group.name = '龙珠阁';
  const seg = detail === 'near' ? 16 : 8;

  const hill = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.hillRTop, cfg.hillRBottom, cfg.hillH, seg, 1),
    mat('rammedEarth')
  );
  hill.position.set(cfg.x, cfg.hillH / 2, cfg.z);
  hill.castShadow = hill.receiveShadow = true;
  group.add(hill);

  if (detail === 'far') {
    const tower = boxMesh(cfg.bodyDia * 1.7, 18, cfg.bodyDia * 1.7, mat('roofTile'));
    tower.position.set(cfg.x, cfg.hillH + 9, cfg.z);
    group.add(tower);
    group.userData.height = cfg.hillH + 18;
    return group;
  }

  let y = cfg.hillH;
  const podium = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.podiumR, cfg.podiumR * 1.06, cfg.podiumH, seg),
    mat('stoneStep')
  );
  podium.position.set(cfg.x, y + cfg.podiumH / 2, cfg.z);
  podium.castShadow = podium.receiveShadow = true;
  group.add(podium);
  if (detail === 'near') {
    const rail = stoneRailing({ length: 24, height: 0.95, postGap: 2.4, material: mat('stone') });
    rail.position.set(cfg.x, y + cfg.podiumH, cfg.z + cfg.podiumR + 0.1);
    group.add(rail);
  }
  y += cfg.podiumH;

  for (let s = 0; s < cfg.storeys; s++) {
    const r = cfg.bodyDia / 2 - s * 0.55;
    const h = cfg.storeyHeight - s * 0.25;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, seg),
      mat(s === 0 ? 'wood' : 'darkWood')
    );
    body.position.set(cfg.x, y + h / 2, cfg.z);
    body.castShadow = body.receiveShadow = true;
    group.add(body);

    const tie = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.12, r + 0.12, 0.22, seg), mat('darkWood'));
    tie.position.set(cfg.x, y + h - 0.11, cfg.z);
    tie.castShadow = tie.receiveShadow = true;
    group.add(tie);

    // 重檐：每层一圈出檐瓦顶
    const eaveH = 1.5 - s * 0.15;
    const eave = new THREE.Mesh(new THREE.ConeGeometry(r + 1.9, eaveH, seg), mat('roofTile'));
    eave.position.set(cfg.x, y + h + eaveH / 2, cfg.z);
    eave.castShadow = eave.receiveShadow = true;
    group.add(eave);

    if (detail === 'near') {
      // 每层四面槛窗
      for (let k = 0; k < 4; k++) {
        const win = latticeWindow({ width: 1.15, height: 1.5, cols: 4, rows: 6, material: mat('darkWood') });
        const a = k * Math.PI / 2;
        win.position.set(cfg.x + Math.cos(a) * (r + 0.03), y + h * 0.58, cfg.z + Math.sin(a) * (r + 0.03));
        win.rotation.y = -a + Math.PI / 2;
        group.add(win);
      }
    }
    y += h + eaveH * 0.55;
  }

  const top = new THREE.Mesh(new THREE.ConeGeometry(cfg.bodyDia / 2 - 0.9, 2.6, seg), mat('roofTile'));
  top.position.set(cfg.x, y + 1.3, cfg.z);
  top.castShadow = top.receiveShadow = true;
  group.add(top);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), mat('steel'));
  finial.position.set(cfg.x, y + 2.72, cfg.z);
  group.add(finial);

  group.userData.height = y + 3.0;
  return group;
}

// ---- 遗址探方：4 个文化层剖面展示（层位比例按 yuyao_013 剖面） ----
function buildTrenches(cfg, mat) {
  const group = new THREE.Group();
  group.name = '遗址探方群';
  const layerMats = ['ground', 'stone', 'porcelainInlay', 'rammedEarth'];
  const layerH = cfg.depth / cfg.layers;
  for (let c = 0; c < cfg.cols; c++) {
    for (let r = 0; r < cfg.rows; r++) {
      const x = cfg.x + (c - (cfg.cols - 1) / 2) * (cfg.size + cfg.gap);
      const z = cfg.z + (r - (cfg.rows - 1) / 2) * (cfg.size + cfg.gap);
      for (let l = 0; l < cfg.layers; l++) {
        const block = boxMesh(cfg.size, layerH, cfg.size, mat(layerMats[l % layerMats.length]));
        block.position.set(x, l * layerH + layerH / 2, z);
        group.add(block);
      }
      // 探方边框（木栏）
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(cfg.size * 0.71, 0.05, 4, 4),
        mat('darkWood')
      );
      rim.rotation.x = Math.PI / 2;
      rim.rotation.z = Math.PI / 4;
      rim.position.set(x, cfg.depth + 0.03, z);
      group.add(rim);
    }
  }
  return group;
}

// ---- 元代路面 + 两侧瓷片堆积（yuyao_025） ----
function buildYuanRoad(cfg, mat) {
  const group = new THREE.Group();
  group.name = '元代路面';
  const road = slabGround({ width: cfg.width, depth: cfg.length, material: mat('stone'), y: 0.04 });
  road.position.set(cfg.x, 0.04, cfg.z);
  group.add(road);
  for (const side of [-1, 1]) {
    const pile = boxMesh(1.6, 1.1, cfg.length, mat('porcelainInlay'));
    pile.position.set(cfg.x + side * (cfg.width / 2 + 1.0), 0.55, cfg.z);
    group.add(pile);
  }
  return group;
}

// ---- 年号格栅景墙：锈红耐候钢镂空板（yuyao_006） ----
function buildGratingWall(cfg, mat) {
  const group = new THREE.Group();
  group.name = '年号格栅景墙';
  const slats = 26;
  const pitch = cfg.length / slats;
  for (let i = 0; i < slats; i++) {
    const h = cfg.height * (0.72 + (i % 5) * 0.055);
    const slat = boxMesh(pitch * 0.46, h, cfg.thickness, mat('weatherSteel'));
    slat.position.set(-cfg.length / 2 + (i + 0.5) * pitch, h / 2, 0);
    group.add(slat);
  }
  const rail = boxMesh(cfg.length, 0.16, cfg.thickness + 0.06, mat('weatherSteel'));
  rail.position.set(0, cfg.height * 0.94, 0);
  group.add(rail);
  const foot = boxMesh(cfg.length, 0.22, cfg.thickness + 0.12, mat('weatherSteel'));
  foot.position.set(0, 0.11, 0);
  group.add(foot);
  group.position.set(cfg.x, 0, cfg.z);
  return group;
}

// ---- 仿古青砖两层楼：3 开间 × 3.3m，两层各 3.3m，硬山带红脊（yuyao_007） ----
function buildBrickHouse(cfg, mat, detail) {
  const group = new THREE.Group();
  group.name = '仿古青砖两层楼';
  const width = cfg.bay * cfg.bays;
  const height = cfg.storeyHeight * cfg.storeys;
  const t = 0.24;

  group.add(plinth({ width: width + 0.5, depth: cfg.depth + 0.5, material: mat('stoneStep'), steps: detail === 'far' ? 0 : 2 }));

  if (detail === 'far') {
    const block = boxMesh(width, height, cfg.depth, mat('qingBrick'));
    block.position.y = height / 2;
    group.add(block);
  } else {
    for (const [w, h, d, px, pz] of [
      [width, height, t, 0, -cfg.depth / 2 + t / 2],
      [width, height, t, 0, cfg.depth / 2 - t / 2]
    ]) {
      const face = boxMesh(w, h, d, mat('qingBrick'));
      face.position.set(px, h / 2, pz);
      group.add(face);
    }
    for (const sx of [-1, 1]) {
      const gable = boxMesh(t, height + 0.9, cfg.depth, mat('qingBrick'), { bevel: 0.01 });
      gable.position.set(sx * (width / 2 - t / 2), (height + 0.9) / 2, 0);
      group.add(gable);
      // 圆通风孔（图中山墙上的清水砖圆孔）
      for (let k = 0; k < 3; k++) {
        const hole = roundVentHole({ radius: 0.20, material: mat('darkWood') });
        hole.position.set(sx * (width / 2 + 0.01), height * 0.62 + k * 1.35, 0);
        hole.rotation.y = sx * Math.PI / 2;
        group.add(hole);
      }
    }
    // 腰檐线脚
    const belt = boxMesh(width + 0.24, 0.22, cfg.depth + 0.24, mat('stoneStep'));
    belt.position.y = cfg.storeyHeight;
    group.add(belt);
    // 门窗：两层各 3 樘木棂窗 + 底层居中格扇门
    for (let s = 0; s < cfg.storeys; s++) {
      for (let b = 0; b < cfg.bays; b++) {
        const x = -width / 2 + cfg.bay * (b + 0.5);
        const y = cfg.storeyHeight * s + cfg.storeyHeight * 0.56;
        const isDoor = s === 0 && b === Math.floor(cfg.bays / 2);
        const win = isDoor
          ? latticeWindow({ width: 1.10, height: 2.30, cols: 3, rows: 8, material: mat('darkWood') })
          : latticeWindow({ width: 1.25, height: 1.50, cols: 4, rows: 6, material: mat('darkWood') });
        win.position.set(x, y, cfg.depth / 2 + 0.05);
        group.add(win);
      }
    }
  }

  const roof = doublePitchRoof({
    width: cfg.depth + 0.5,
    depth: width + 0.7,
    slope: ROOF.hardSlope,
    eaveY: height + 0.05,
    material: mat('roofTile'),
    ridgeMaterial: mat('redBrick'),
    type: 'hard',
    overhang: 0.55,
    ridgeHeight: ROOF.ridgeHeight,
    tileRidges: detail === 'near',
    // 山墙三角填充：把两端山面从檐口封到正脊（现有山墙只砌到檐上 0.9m，上方仍会留缝）
    gableMaterial: mat('qingBrick'),
    gableWidth: cfg.depth,
    gableThickness: 0.24,
    gableOffset: width / 2 - 0.12
  });
  roof.rotation.y = Math.PI / 2;
  group.add(roof);

  group.rotation.y = cfg.rotY;
  group.position.set(cfg.x, 0, cfg.z);
  return group;
}

// ---- 佑陶灵祠门罩：抬梁式木构 + 黑漆描金门罩 + 悬匾 + 石香炉（yuyao_016） ----
function buildShrine(cfg, mat) {
  const group = new THREE.Group();
  group.name = '佑陶灵祠门罩';
  const w = cfg.bay;
  const h = cfg.gateHeight;

  group.add(boxMesh(w + 1.6, 0.35, cfg.depth + 1.2, mat('stoneStep')).translateY(0.175));
  const frame = postAndBeamFrame({ length: w, depth: cfg.depth, height: h, bays: 2, material: mat('wood'), baseMaterial: mat('stone') });
  frame.position.y = 0.35;
  group.add(frame);

  // 黑漆描金门罩（门罩本体）
  const hood = boxMesh(w + 1.1, 0.85, 0.30, mat('darkWood'));
  hood.position.set(0, 0.35 + h - 0.2, cfg.depth / 2 + 0.18);
  group.add(hood);
  // 悬匾
  const plaque = boxMesh(1.5, 0.5, 0.10, mat('darkWood'));
  plaque.position.set(0, 0.35 + h - 1.05, cfg.depth / 2 + 0.12);
  group.add(plaque);
  const gold = boxMesh(1.28, 0.32, 0.04, mat('steel'));
  gold.position.set(0, 0.35 + h - 1.05, cfg.depth / 2 + 0.18);
  group.add(gold);
  // 门扇
  const door = latticeWindow({ width: 1.7, height: 2.2, cols: 3, rows: 7, material: mat('darkWood') });
  door.position.set(0, 0.35 + 1.2, cfg.depth / 2 + 0.06);
  group.add(door);
  // 石香炉
  const censer = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.36, 0.62, 12), mat('stone'));
  censer.position.set(0, 0.31, cfg.depth / 2 + 1.5);
  censer.castShadow = censer.receiveShadow = true;
  group.add(censer);

  group.position.set(cfg.x, 0, cfg.z);
  return group;
}

// ---- 远景：山体剪影与城市轮廓（低模 + 单张合并贴图思路） ----
function buildFar(cfg, mat, seed) {
  const group = new THREE.Group();
  group.name = '远景山体与城市轮廓';
  for (const hill of cfg.hills) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(hill.r, hill.h, 7, 1), mat('ground'));
    cone.position.set(hill.x, hill.h / 2 - 2, hill.z);
    group.add(cone);
  }
  const rng = mulberry32(seed);
  const { skyline } = cfg;
  for (let i = 0; i < skyline.count; i++) {
    const h = skyline.height * (0.5 + rng());
    const w = 10 + rng() * 18;
    const block = boxMesh(w, h, skyline.depth, mat('stone'));
    block.position.set(
      skyline.x + (i / (skyline.count - 1) - 0.5) * skyline.spread,
      h / 2,
      skyline.z + (rng() - 0.5) * 40
    );
    group.add(block);
  }
  return group;
}

export function createYuyaoScene({ library, environment, quality, lodManager }) {
  const site = SITES.yuyao;
  const L = site.layout;
  const mat = id => library.get(id);
  const root = new THREE.Group();
  root.name = site.name;
  const lods = [];

  function addLOD(component, near, mid, far) {
    const lod = createLOD({
      near: mark(near, component, 'near'),
      mid: mark(mid, component, 'mid'),
      far: mark(far, component, 'far'),
      distances: site.lod
    });
    lod.name = component;
    root.add(lod);
    lodManager?.add(lod, { distances: site.lod });
    lods.push(lod);
    return lod;
  }

  // 场地
  const ground = slabGround({ width: site.ground.width, depth: site.ground.depth, material: mat('ground') });
  mark(ground, 'ground', 'mid');
  root.add(ground);

  // 御窑博物馆：8 拱 LOD 三档
  addLOD(
    'museum',
    buildMuseum(L.museum, mat, 'near'),
    buildMuseum(L.museum, mat, 'mid'),
    buildMuseum(L.museum, mat, 'far')
  );
  // 拱下浅水镜面 + 石池岸（近档细节，不影响比例）
  const pool = slabGround({ width: L.museum.pool.width, depth: L.museum.pool.depth, material: mat('water'), y: L.museum.pool.rim });
  pool.position.set(L.museum.pool.x, L.museum.pool.rim, L.museum.pool.z);
  mark(pool, 'museum', 'near');
  root.add(pool);
  const poolBed = slabGround({ width: L.museum.pool.width, depth: L.museum.pool.depth, material: mat('cobble'), y: 0.02 });
  poolBed.position.set(L.museum.pool.x, 0.02, L.museum.pool.z);
  mark(poolBed, 'museum', 'near');
  root.add(poolBed);
  for (const [sx, sz, w, d] of [
    [0, -1, L.museum.pool.width + 0.7, 0.35],
    [0, 1, L.museum.pool.width + 0.7, 0.35],
    [-1, 0, 0.35, L.museum.pool.depth + 0.7],
    [1, 0, 0.35, L.museum.pool.depth + 0.7]
  ]) {
    const h = L.museum.pool.rim + 0.12;
    const rim = boxMesh(w, h, d, mat('stone'));
    rim.position.set(
      L.museum.pool.x + sx * (L.museum.pool.width / 2 + 0.175),
      h / 2,
      L.museum.pool.z + sz * (L.museum.pool.depth / 2 + 0.175)
    );
    mark(rim, 'museum', 'near');
    root.add(rim);
  }

  // 龙珠阁（珠山）
  addLOD(
    'longzhu',
    buildLongzhu(L.longzhu, mat, 'near'),
    buildLongzhu(L.longzhu, mat, 'mid'),
    buildLongzhu(L.longzhu, mat, 'far')
  );

  // 遗址探方群 / 元代路面
  root.add(mark(buildTrenches(L.trench, mat), 'trench', 'mid'));
  root.add(mark(buildYuanRoad(L.yuanRoad, mat), 'yuanRoad', 'mid'));

  // 入口年号格栅景墙
  root.add(mark(buildGratingWall(L.gratingWall, mat), 'gratingWall', 'mid'));

  // 青砖两层楼（LOD 三档）
  addLOD(
    'brickHouse',
    buildBrickHouse(L.brickHouse, mat, 'near'),
    buildBrickHouse(L.brickHouse, mat, 'mid'),
    buildBrickHouse(L.brickHouse, mat, 'far')
  );

  // 佑陶灵祠门罩
  root.add(mark(buildShrine(L.shrine, mat), 'shrine', 'mid'));

  // 园墙（把园区围起来，避免"孤楼"观感）
  for (const [x, z, len, rot] of [
    [0, -70, 150, 0], [0, 78, 150, 0], [-75, 0, 150, Math.PI / 2], [75, 0, 150, Math.PI / 2]
  ]) {
    const w = wall({ length: len, height: 2.4, thickness: 0.36, material: mat('qingBrickWorn') });
    w.position.set(x, 0, z);
    w.rotation.y = rot;
    root.add(mark(w, 'brickHouse', 'far'));
  }

  // 远景
  root.add(mark(buildFar(L.far, mat, site.seed), 'farHills', 'far'));

  // 位置光（强度由光照预设驱动）
  for (const light of site.roleLights) {
    environment?.addRoleLight(light.role, new THREE.Vector3(...light.position), light.options);
  }

  return {
    id: site.id,
    site,
    root,
    lods,
    cameras: site.cameras,
    focus: new THREE.Vector3(0, 4, 4),
    dispose() {
      root.traverse(node => {
        if (node.geometry) node.geometry.dispose();
      });
      root.parent?.remove(root);
      lods.length = 0;
    }
  };
}