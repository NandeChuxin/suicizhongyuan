// 古窑民俗博览区：清代镇窑窑房、狮子窑、宋代龙窑、元代馒头窑、明代葫芦窑、
// 明清御窑六式窑长廊、门楼牌坊群、嵌瓷片墙、晾晒坯架与松柴垛（Stage A：白模 + 结构）。
import * as THREE from 'three';
import { SITES } from '../data/sites.js';
import { createLOD } from '../kernel/lod.js';
import { mulberry32 } from '../kernel/noise.js';
import {
  boxMesh, slabGround, plinth, wall, doublePitchRoof, timberFrame, postAndBeamFrame,
  archedSolid, domeBody, chimney, saggerPile, firewoodStack, greenwareRack
} from '../kernel/parts.js';
import { DEG, ROOF } from '../kernel/units.js';

function mark(object, component, tier) {
  object.traverse(node => {
    node.userData.component = component;
    if (tier) node.userData.tier = tier;
  });
  return object;
}

// ---- 清代镇窑窑房：穿斗木构窑房 + 蛋形窑体 + 双砖烟囱 ----
function buildZhenyao(cfg, mat, detail) {
  const group = new THREE.Group();
  group.name = '清代镇窑窑房';
  group.position.set(cfg.x, 0, cfg.z);
  const far = detail === 'far';

  group.add(plinth({ width: cfg.houseLength + 1.0, depth: cfg.houseWidth + 1.0, material: mat('stoneStep'), steps: 0 }));

  if (far) {
    const hall = boxMesh(cfg.houseLength, cfg.eaveH + 2.6, cfg.houseWidth, mat('kilnBrick'));
    hall.position.y = cfg.eaveH / 2 + 1.3;
    group.add(hall);
    for (const c of cfg.chimneys) {
      const stack = boxMesh(1.5, c.h, 1.5, mat('kilnBrick'));
      stack.position.set(c.dx, c.h / 2, c.dz);
      group.add(stack);
    }
    return group;
  }

  // 木构架（穿斗式，纵长 22m、进深 8m）
  const frame = timberFrame({
    length: cfg.houseLength,
    depth: cfg.houseWidth,
    height: cfg.eaveH,
    columnGap: 1.35,
    levels: [1.60, 3.00],
    material: mat('wood'),
    baseMaterial: mat('stoneStep')
  });
  group.add(frame);

  // 两侧下半截围护（板壁 / 砖砌），避免读成空亭子
  for (const sz of [-1, 1]) {
    const panel = boxMesh(cfg.houseLength, detail === 'near' ? 2.4 : 2.2, 0.16, mat('qingBrickWorn'));
    panel.position.set(0, 1.2, sz * (cfg.houseWidth / 2));
    group.add(panel);
  }
  // 前端山墙（窑门所在端，+X 面向园区）：留出门洞
  const seg = (cfg.houseWidth - cfg.door.w) / 2;
  for (const sz of [-1, 1]) {
    const w = boxMesh(0.26, cfg.eaveH, seg, mat('qingBrickWorn'));
    w.position.set(cfg.houseLength / 2, cfg.eaveH / 2, sz * (cfg.door.w / 2 + seg / 2));
    group.add(w);
  }
  const lintel = boxMesh(0.3, cfg.eaveH - cfg.door.h, cfg.door.w + 0.5, mat('darkWood'));
  lintel.position.set(cfg.houseLength / 2, cfg.door.h + (cfg.eaveH - cfg.door.h) / 2, 0);
  group.add(lintel);
  // 后端山墙（封闭）
  const rear = boxMesh(0.26, cfg.eaveH + 1.0, cfg.houseWidth, mat('qingBrickWorn'));
  rear.position.set(-cfg.houseLength / 2, (cfg.eaveH + 1.0) / 2, 0);
  group.add(rear);

  // 屋面（正脊沿 X，与窑房长向一致）
  const roof = doublePitchRoof({
    width: cfg.houseWidth + 1.4,
    depth: cfg.houseLength + 1.6,
    slope: ROOF.hardSlope,
    eaveY: cfg.eaveH + 0.1,
    material: mat('roofTile'),
    ridgeMaterial: mat('kilnBrick'),
    type: 'overhang',
    gableOverhang: 0.5,
    ridgeHeight: 0.36,
    tileRidges: detail === 'near',
    // 两端山墙三角填充：把山面从檐口封到正脊，屋面不再悬空
    gableMaterial: mat('qingBrickWorn'),
    gableWidth: cfg.houseWidth,
    gableThickness: 0.26,
    gableOffset: cfg.houseLength / 2 - 0.13
  });
  roof.rotation.y = Math.PI / 2;
  group.add(roof);

  // 蛋形窑体（前大后小、最高约 6m）—— 前端朝 +X 的窑门方向
  const kiln = archedSolid({
    length: cfg.kilnLen,
    frontWidth: cfg.frontW,
    backWidth: cfg.backW,
    frontHeight: cfg.frontH,
    backHeight: cfg.backH,
    rings: detail === 'near' ? 28 : 12,
    segments: detail === 'near' ? 22 : 12,
    material: mat('kilnBrick')
  });
  kiln.rotation.y = -Math.PI / 2;
  group.add(kiln);

  // 窑门 + 窑火
  const doorFrame = boxMesh(0.5, cfg.door.h, cfg.door.w, mat('kilnBrick'));
  doorFrame.position.set(cfg.kilnLen / 2 - 0.2, cfg.door.h / 2 + 0.3, 0);
  group.add(doorFrame);
  const fire = new THREE.Mesh(new THREE.PlaneGeometry(cfg.door.w * 0.8, cfg.door.h * 0.8), mat('kilnFire'));
  fire.rotation.y = Math.PI / 2;
  fire.position.set(cfg.kilnLen / 2 + 0.06, cfg.door.h / 2 + 0.3, 0);
  group.add(fire);

  // 双砖烟囱（窑体后端）
  for (const c of cfg.chimneys) {
    const stack = chimney({ height: c.h, rBase: 0.78, rTop: 0.50, material: mat('kilnBrick'), segments: detail === 'near' ? 28 : 12 });
    stack.position.set(c.dx, 0, c.dz);
    group.add(stack);
  }
  return group;
}

// ---- 门楼（狮子窑 / 葫芦窑 / 牌坊群共用） ----
function buildGate({ width, height, span, depth = 1.6, plaqueMaterial, mat, detail = 'mid' }) {
  const group = new THREE.Group();
  const frame = postAndBeamFrame({
    length: span,
    depth,
    height,
    bays: 1,
    material: mat('wood'),
    baseMaterial: mat('stoneStep')
  });
  group.add(frame);
  // 两侧砖墩
  for (const sx of [-1, 1]) {
    const pier = boxMesh(width / 2 - span / 2, height * 0.92, 0.5, mat('qingBrickWorn'));
    pier.position.set(sx * (span / 2 + (width / 2 - span / 2) / 2), height * 0.46, 0);
    group.add(pier);
  }
  const roof = doublePitchRoof({
    width: span + 2.2,
    depth: depth + 1.4,
    slope: ROOF.hardSlope,
    eaveY: height,
    material: mat('roofTile'),
    ridgeMaterial: plaqueMaterial || mat('kilnBrick'),
    type: 'overhang',
    gableOverhang: 0.4,
    ridgeHeight: 0.3,
    tileRidges: detail === 'near'
  });
  group.add(roof);
  // 悬匾
  const plaque = boxMesh(1.7, 0.56, 0.10, mat('darkWood'));
  plaque.position.set(0, height - 0.75, depth / 2 + 0.12);
  group.add(plaque);
  const plate = boxMesh(1.45, 0.36, 0.05, mat('porcelainInlay'));
  plate.position.set(0, height - 0.75, depth / 2 + 0.18);
  group.add(plate);
  return group;
}

// ---- 宋代龙窑：依坡砌筑的长条拱形窑身 + 敞廊 ----
function buildLongyao(cfg, mat, detail) {
  const group = new THREE.Group();
  group.name = '宋代龙窑';
  const slope = cfg.slope * DEG;
  const ramp = new THREE.Group();
  ramp.rotation.z = slope; // 窑身随坡度倾斜，窑底即坡面
  group.add(ramp);

  // 山体（下埋） + 坡面
  const earth = boxMesh(cfg.length + 12, 9.0, cfg.shedWidth + 4, mat('rammedEarth'));
  earth.position.y = -4.4;
  ramp.add(earth);
  const deck = boxMesh(cfg.length + 4, 0.5, cfg.shedWidth, mat('stoneStep'));
  deck.position.y = 0.25;
  ramp.add(deck);

  const body = archedSolid({
    length: cfg.length,
    frontWidth: cfg.width,
    backWidth: cfg.width * 0.82,
    frontHeight: cfg.height,
    backHeight: cfg.height * 0.86,
    rings: detail === 'near' ? 24 : 10,
    segments: detail === 'near' ? 16 : 10,
    material: mat('kilnBrick')
  });
  body.rotation.y = -Math.PI / 2;
  body.position.y = 0.5;
  ramp.add(body);

  // 敞廊：沿坡等距立柱 + 单坡廊顶
  const bays = Math.max(4, Math.round(cfg.length / 4));
  const postGeo = new THREE.CylinderGeometry(0.11, 0.11, 3.2, 8);
  for (let i = 0; i <= bays; i++) {
    const x = -cfg.length / 2 + (cfg.length / bays) * i;
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, mat('wood'));
      post.position.set(x, 2.1, sz * (cfg.shedWidth / 2 - 0.3));
      post.castShadow = post.receiveShadow = true;
      ramp.add(post);
    }
  }
  const shed = boxMesh(cfg.length + 2, 0.24, cfg.shedWidth, mat('roofTile'));
  shed.position.y = 3.8;
  ramp.add(shed);

  // 窑头（低端）工作台
  const head = boxMesh(3.0, 1.6, cfg.shedWidth * 0.8, mat('stoneStep'));
  head.position.set(cfg.length / 2 + 1.6, 1.3, 0);
  ramp.add(head);

  group.position.set(cfg.x, 0, cfg.z);
  return group;
}

// ---- 元代馒头窑：马蹄形窑床 + 穹顶 + 两根烟囱 + 明黄砖高墙 ----
function buildMantou(cfg, mat, detail) {
  const group = new THREE.Group();
  group.name = '元代馒头窑';
  const far = detail === 'far';

  const bed = boxMesh(cfg.bedWidth, 0.6, cfg.bedDepth, mat('kilnBrick'));
  bed.position.y = 0.3;
  group.add(bed);

  const dome = domeBody({ radius: cfg.radius, height: cfg.height, material: mat('kilnBrick'), segments: far ? 12 : 28 });
  dome.position.y = 0.6;
  group.add(dome);

  // 窑门洞（朝 +Z）
  const door = boxMesh(1.6, 1.5, 0.4, mat('kilnFire'));
  door.position.set(0, 1.35, cfg.radius - 0.1);
  group.add(door);

  // 两根烟囱（官网原文特征，结构校验要点）
  for (const c of cfg.chimneys) {
    const stack = chimney({ height: c.h, rBase: 0.46, rTop: 0.32, material: mat('kilnBrick'), segments: far ? 10 : 24 });
    stack.position.set(c.dx, 0.6, c.dz);
    group.add(stack);
  }

  // 明黄砖高墙（门墙）
  const gw = cfg.gateWall;
  const wallMesh = boxMesh(gw.w, gw.h, gw.thickness, mat('rammedEarth'), { bevel: 0.02 });
  wallMesh.position.set(0, gw.h / 2, cfg.radius + 1.2);
  group.add(wallMesh);
  const gap = boxMesh(2.0, 2.3, gw.thickness + 0.2, mat('kilnBrick'));
  gap.position.set(0, 1.15, cfg.radius + 1.2);
  group.add(gap);

  group.position.set(cfg.x, 0, cfg.z);
  return group;
}

// ---- 明代葫芦窑：前大后小 + 门楼墙头横码匣钵 ----
function buildHulu(cfg, mat, detail) {
  const group = new THREE.Group();
  group.name = '明代葫芦窑';

  if (detail === 'far') {
    const block = boxMesh(cfg.frontDia, cfg.height, cfg.length, mat('kilnBrick'));
    block.position.y = cfg.height / 2;
    group.add(block);
  } else {
    const body = archedSolid({
      length: cfg.length,
      frontWidth: cfg.frontDia,
      backWidth: cfg.backDia,
      frontHeight: cfg.height,
      backHeight: cfg.height * 0.78,
      rings: detail === 'near' ? 24 : 12,
      segments: detail === 'near' ? 20 : 12,
      material: mat('kilnBrick')
    });
    body.rotation.y = Math.PI; // 前端（大端）朝 +Z，面向广场
    body.position.z = 0;
    group.add(body);
    const fire = new THREE.Mesh(new THREE.PlaneGeometry(cfg.frontDia * 0.42, cfg.height * 0.55), mat('kilnFire'));
    fire.position.set(0, cfg.height * 0.35, cfg.length / 2 + 0.05);
    group.add(fire);
  }

  // 门楼 + 两侧矮墙（墙头横码 3 排匣钵，见 guyao_120）
  const gate = buildGate({
    width: cfg.gate.w + 2.4,
    height: cfg.gate.h,
    span: cfg.gate.w,
    depth: cfg.gate.depth,
    mat,
    detail
  });
  gate.position.set(0, 0, cfg.length / 2 + cfg.gate.depth);
  group.add(gate);

  const wingW = 3.2;
  const wingH = cfg.gate.h * 0.62;
  for (const sx of [-1, 1]) {
    const wing = boxMesh(wingW, wingH, cfg.gate.depth * 1.4, mat('qingBrickWorn'));
    wing.position.set(sx * (cfg.gate.w / 2 + 1.2 + wingW / 2), wingH / 2, cfg.length / 2 + cfg.gate.depth);
    group.add(wing);
    for (let k = 0; k < 2; k++) {
      const pile = saggerPile({
        count: cfg.gate.saggerRows,
        radius: 0.26,
        x: sx * (cfg.gate.w / 2 + 1.2 + wingW * (0.28 + k * 0.44)),
        z: cfg.length / 2 + cfg.gate.depth,
        seed: 17 + k + (sx > 0 ? 5 : 0),
        material: mat('kilnBrick')
      });
      pile.position.y = wingH;
      group.add(pile);
    }
  }

  group.position.set(cfg.x, 0, cfg.z);
  return group;
}

// ---- 明清御窑六式窑长廊：6 间穿斗敞廊，逐间悬匾 ----
// 匾额文字：青窑 / 龙缸窑 / 风火窑 / 色窑 / 爁熿窑 / 匣窑（列表见 data/sites.js 的构件说明）
function buildLiushi(cfg, mat, detail) {
  const group = new THREE.Group();
  group.name = '御窑六式窑长廊';
  const length = cfg.bayWidth * cfg.bays;

  const frame = timberFrame({
    length,
    depth: cfg.depth,
    height: cfg.eaveH,
    columnGap: cfg.bayWidth,
    levels: [1.5, 2.6],
    material: mat('wood'),
    baseMaterial: mat('stoneStep')
  });
  group.add(frame);

  // 后墙（青砖）
  const backWall = wall({ length, height: cfg.eaveH, thickness: 0.30, material: mat('qingBrickWorn') });
  backWall.position.set(0, 0, -cfg.depth / 2);
  group.add(backWall);

  const roof = doublePitchRoof({
    width: cfg.depth + 1.4,
    depth: length + 1.0,
    slope: ROOF.hardSlope,
    eaveY: cfg.eaveH,
    material: mat('roofTile'),
    ridgeMaterial: mat('kilnBrick'),
    type: 'overhang',
    gableOverhang: 0.4,
    ridgeHeight: cfg.ridgeH,
    tileRidges: detail === 'near',
    // 敞廊两端加薄山花板（悬山顶做法），封住山面但不砌实墙
    gableMaterial: mat('darkWood'),
    gableWidth: cfg.depth,
    gableOffset: length / 2 - 0.06,
    gableThickness: 0.12
  });
  roof.rotation.y = Math.PI / 2;
  group.add(roof);

  // 逐间悬匾 + 窑门
  for (let i = 0; i < cfg.bays; i++) {
    const x = -length / 2 + cfg.bayWidth * (i + 0.5);
    const plaque = boxMesh(cfg.bayWidth * 0.5, 0.5, 0.08, mat('darkWood'));
    plaque.position.set(x, cfg.eaveH - 0.6, cfg.depth / 2 + 0.06);
    group.add(plaque);
    const plate = boxMesh(cfg.bayWidth * 0.42, 0.32, 0.04, mat('porcelainInlay'));
    plate.position.set(x, cfg.eaveH - 0.6, cfg.depth / 2 + 0.12);
    group.add(plate);
    const kilnDoor = boxMesh(1.8, 1.9, 0.2, mat('kilnBrick'));
    kilnDoor.position.set(x, 0.95, -cfg.depth / 2 + 0.2);
    group.add(kilnDoor);
  }

  group.position.set(cfg.x, 0, cfg.z);
  return group;
}

// ---- 嵌青花碎瓷片砖墙 ----
function buildInlayWall(cfg, mat) {
  const group = new THREE.Group();
  group.name = '嵌瓷片墙';
  const body = boxMesh(cfg.length, cfg.height, cfg.thickness, mat('porcelainInlay'), { bevel: 0.012 });
  body.position.y = cfg.height / 2;
  group.add(body);
  const base = boxMesh(cfg.length + 0.3, 0.34, cfg.thickness + 0.18, mat('qingBrickWorn'));
  base.position.y = 0.17;
  group.add(base);
  const cap = boxMesh(cfg.length + 0.34, 0.14, cfg.thickness + 0.24, mat('roofTile'));
  cap.position.y = cfg.height + 0.07;
  group.add(cap);
  group.position.set(cfg.x, 0, cfg.z);
  return group;
}

// ---- 远景 ----
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

export function createGuyaoScene({ library, environment, quality, lodManager }) {
  const site = SITES.guyao;
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

  // 清代镇窑（核心，三档 LOD）
  addLOD('zhenyao', buildZhenyao(L.zhenyao, mat, 'near'), buildZhenyao(L.zhenyao, mat, 'mid'), buildZhenyao(L.zhenyao, mat, 'far'));

  // 狮子窑（仅正立面有依据，窑体图测）
  const shizi = new THREE.Group();
  shizi.add(buildGate({ width: L.shizi.gate.w + 2.6, height: L.shizi.gate.h, span: L.shizi.gate.w, depth: L.shizi.gate.depth, mat }));
  const shiziBody = archedSolid({
    length: L.shizi.length,
    frontWidth: L.shizi.frontW,
    backWidth: L.shizi.backW,
    frontHeight: L.shizi.frontH,
    backHeight: L.shizi.backH,
    rings: 14,
    segments: 12,
    material: mat('kilnBrick')
  });
  shiziBody.rotation.y = Math.PI;
  shiziBody.position.z = -(L.shizi.gate.depth + L.shizi.length / 2) - 0.6;
  shizi.add(shiziBody);
  shizi.position.set(L.shizi.x, 0, L.shizi.z);
  root.add(mark(shizi, 'shizi', 'mid'));

  // 宋代龙窑（依坡）
  addLOD('longyao', buildLongyao(L.longyao, mat, 'near'), buildLongyao(L.longyao, mat, 'mid'), null);

  // 元代馒头窑
  addLOD('mantou', buildMantou(L.mantou, mat, 'near'), buildMantou(L.mantou, mat, 'mid'), buildMantou(L.mantou, mat, 'far'));

  // 明代葫芦窑
  addLOD('hulu', buildHulu(L.hulu, mat, 'near'), buildHulu(L.hulu, mat, 'mid'), buildHulu(L.hulu, mat, 'far'));

  // 明清御窑六式窑长廊
  addLOD('liushi', buildLiushi(L.liushi, mat, 'near'), buildLiushi(L.liushi, mat, 'mid'), null);

  // 嵌瓷片墙
  root.add(mark(buildInlayWall(L.inlayWall, mat), 'inlayWall', 'mid'));

  // 门楼牌坊群
  for (const g of L.gates) {
    const gate = buildGate({ width: g.w + 2.4, height: g.h, span: g.span, mat, detail: 'near' });
    gate.position.set(g.x, 0, g.z);
    root.add(mark(gate, 'gates', 'mid'));
  }

  // 晾晒坯架 / 松柴垛 / 匣钵堆
  for (const r of L.racks) {
    const rack = greenwareRack({
      length: 4.0, height: 1.9, depth: 0.8,
      material: mat('wood'), blankMaterial: mat('porcelainInlay'),
      shelves: 4, perShelf: 7
    });
    rack.position.set(r.x, 0, r.z);
    rack.rotation.y = r.rot;
    root.add(mark(rack, 'racks', 'mid'));
  }
  for (const f of L.firewood) {
    const stack = firewoodStack({ length: 2.4, height: 1.2, depth: 1.0, material: mat('wood'), rows: 5 });
    stack.position.set(f.x, 0, f.z);
    root.add(mark(stack, 'firewood', 'mid'));
  }
  for (let i = 0; i < 8; i++) {
    const pile = saggerPile({
      count: 4 + (i % 3),
      radius: 0.3,
      x: -18 + (i % 4) * 13,
      z: 18 + Math.floor(i / 4) * 9,
      seed: 31 + i,
      material: mat('kilnBrick')
    });
    root.add(mark(pile, 'shizi', 'far'));
  }

  // 园区围墙
  for (const [x, z, len, rot] of [
    [0, -80, 170, 0], [0, 88, 170, 0], [-85, 0, 170, Math.PI / 2], [85, 0, 170, Math.PI / 2]
  ]) {
    const w = wall({ length: len, height: 2.3, thickness: 0.36, material: mat('qingBrickWorn') });
    w.position.set(x, 0, z);
    w.rotation.y = rot;
    root.add(mark(w, 'gates', 'far'));
  }

  root.add(mark(buildFar(L.far, mat, site.seed), 'farHills', 'far'));

  for (const light of site.roleLights) {
    environment?.addRoleLight(light.role, new THREE.Vector3(...light.position), light.options);
  }

  return {
    id: site.id,
    site,
    root,
    lods,
    cameras: site.cameras,
    focus: new THREE.Vector3(-8, 4, 4),
    dispose() {
      root.traverse(node => {
        if (node.geometry) node.geometry.dispose();
      });
      root.parent?.remove(root);
      lods.length = 0;
    }
  };
}