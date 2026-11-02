import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VESSELS } from '../src/data/vessels.js';
import { create3DFragments } from '../src/modules/puzzle3d.js';
import { vesselProfile } from '../src/modules/vessels3d.js';
import { createPuzzle3DContext } from '../src/modules/puzzle3d-bench.js';
import { createHologramSystem, HOLO_COLOR } from '../src/modules/hologram.js';

// 无 DOM 环境最小 canvas 桩（与 puzzle3d-bench.test.js 同款）
function recordEvents() {
  const fired = {};
  const canvas = {
    addEventListener(t, fn) { (fired[t] ??= []).push(fn); },
    removeEventListener(t, fn) {
      const arr = fired[t]; if (!arr) return;
      const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1);
    },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; },
    setPointerCapture() {}, releasePointerCapture() {},
  };
  return { canvas, fired, trigger(type, event) { for (const fn of fired[type] ?? []) fn(event); } };
}

const makeScene = () => {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 50);
  camera.position.set(0, 0, 0.1);
  camera.lookAt(0, 0, 0);
  return { scene, camera };
};

const build = (vesselIndex = 0) => {
  const { scene, camera } = makeScene();
  const vessel = VESSELS[vesselIndex];
  const built = create3DFragments(vessel);
  return { scene, camera, vessel, ...built };
};

test('createHologramSystem 返回完整 API，壳体与碎片同一拼合位置口径', () => {
  const ctx = build();
  const holo = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, benchRadius: 3 });
  for (const k of ['group', 'shell', 'wireShell', 'setSelected', 'setDragging', 'markLocked', 'update', 'setVisible', 'degrade', 'dispose', 'onSettled', 'beams']) {
    assert.ok(k in holo, `holo 缺 ${k}`);
  }
  assert.ok(ctx.scene.children.includes(holo.group), '全息组应已挂入场景');
  // 壳体摆位 = 碎片 correctPosition（工作台中心、正确拼合位置）
  assert.equal(holo.shell.position.y, ctx.fragments[0].correctPosition.y);
  assert.ok(holo.group.visible, '默认可见');
  holo.dispose();
});

test('lift 抬升：壳体/线框跟随抬升后的 correctPosition，底部投影锥出现', () => {
  const ctx = build(1);
  const lift = ctx.maxY - ctx.minY; // ≈ 一个瓶高
  for (const f of ctx.fragments) f.correctPosition.y += lift; // 与 immersive 同口径
  const holo = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, benchRadius: 3, lift });
  assert.equal(holo.shell.position.y, ctx.fragments[0].correctPosition.y, '光面壳应抬升到悬浮器心');
  assert.equal(holo.wireShell.position.y, ctx.fragments[0].correctPosition.y, '线框壳应同口径抬升');
  assert.ok(holo.group.children.some(o => o.type === 'Mesh' && o.geometry?.type === 'CylinderGeometry'), '应有底部投影锥');
  holo.setSelected(ctx.fragments[0]);
  assert.deepEqual(holo.ghost.position.toArray(), ctx.fragments[0].correctPosition.toArray(), 'ghost 应悬浮在瓶身对应位置');
  holo.dispose();
});

test('投影锥收口：锥顶贴器底、由台面向上收拢，不形成横切器身的圆盘翻边', () => {
  // 回归背景：旧口径把锥顶半径取成"下半器身最宽半径×1.1"，比器底宽出近一倍，
  // 那一圈横向翻边正好横在器身下段，看上去像模型被横剖出一个圆盘截面。
  const ctx = build(1);
  const lift = ctx.maxY - ctx.minY;
  for (const f of ctx.fragments) f.correctPosition.y += lift;
  const holo = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, benchRadius: 4, lift, baseGap: .8 });
  const cone = holo.group.children.find(o => o.geometry?.type === 'CylinderGeometry');
  const baseR = Math.abs(vesselProfile(ctx.vessel.outline)[0].x);
  const p = cone.geometry.parameters;
  assert.ok(p.radiusTop <= baseR * 1.05, `锥顶半径 ${p.radiusTop.toFixed(2)} 不应宽于器底 ${baseR.toFixed(2)}`);
  assert.ok(p.radiusBottom > p.radiusTop, '锥体应由台面向瓶底收拢（底宽顶窄）');
  // 锥顶 y = 器底世界高度；锥底 y = 台面（器底 - 净空 - 抬升）
  const wBottom = ctx.fragments[0].correctPosition.y + ctx.minY;
  assert.ok(Math.abs(cone.position.y + p.height / 2 - wBottom) < 1e-6, '锥顶应正好接住器底');
  assert.ok(Math.abs(cone.position.y - p.height / 2 - (wBottom - lift - .8)) < 1e-6, '锥底应落到台面（含净空）');
  holo.dispose();
});

test('active=false 时全息组不可见（openVessel 发生在非拼合屏）', () => {
  const ctx = build();
  const holo = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, visible: false });
  assert.equal(holo.group.visible, false);
  holo.dispose();
});

test('setSelected：ghost 共享碎片 geometry 且姿态锁死在 correctPosition/correctQuaternion', () => {
  const ctx = build(1);
  const holo = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, benchRadius: 3 });
  const f = ctx.fragments.find(x => !x.locked);
  holo.setSelected(f);
  assert.ok(holo.ghost, '选中后应出现 ghost mesh');
  assert.equal(holo.ghost.geometry, f.mesh.geometry, 'ghost 应共享碎片 geometry（不复制显存）');
  assert.deepEqual(holo.ghost.position.toArray(), f.correctPosition.toArray());
  assert.equal(holo.ghost.quaternion.x, f.correctQuaternion.x);
  holo.setSelected(null);
  assert.equal(holo.ghost, null, '取消选中后 ghost 应移除');
  holo.dispose();
});

test('牵引光束：未锁定碎片常驻光束指向 correctPosition，选中拖拽增亮，锁定后淡出移除', () => {
  const ctx = build(2);
  const holo = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, benchRadius: 3 });
  const f = ctx.fragments[0], other = ctx.fragments[1];
  holo.update(1 / 60);
  assert.ok(holo.beams.get(f.index), '未锁定碎片应常驻牵引光束');
  assert.equal(holo.beams.get(f.index).line.visible, true);
  // 选中 + 拖拽 → 该碎片光束增亮，其余压暗
  holo.setSelected(f);
  holo.setDragging(true);
  holo.update(1 / 60);
  const selBeam = holo.beams.get(f.index), otherBeam = holo.beams.get(other.index);
  assert.ok(selBeam.mat.opacity >= .55, `选中光束应增亮（实际 ${selBeam.mat.opacity}）`);
  assert.ok(otherBeam.mat.opacity < .2, '非选中光束应压暗');
  holo.setDragging(false);
  holo.setSelected(null);
  holo.update(1 / 60);
  assert.ok(holo.beams.get(f.index).mat.opacity < .55, '停拖后光束回落');
  // 锁定 → 0.3s 淡出后移除
  f.locked = true;
  holo.markLocked(f, { silent: true });
  assert.ok(holo.beams.get(f.index), '锁定瞬间光束仍在淡出');
  for (let i = 0; i < 40; i++) holo.update(1 / 60);
  assert.equal(holo.beams.get(f.index), undefined, '淡出完成后光束应移除');
  holo.dispose();
});

test('markLocked：对应区域 aCover 置 1、触发定向爆发粒子；ghost 同片时清掉', () => {
  const ctx = build(2);
  const holo = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, benchRadius: 3 });
  const f = ctx.fragments[0];
  holo.setSelected(f);
  holo.update(1 / 60); // 生成光束
  const meshesBefore = holo.group.children.filter(o => o.isMesh).length;
  holo.markLocked(f, { silent: false });
  const cover = holo.shell.geometry.attributes.aCover;
  const covered = cover.array.filter(v => v === 1).length;
  assert.ok(covered > 0, `锁定后应有顶点被覆盖（实际 ${covered}）`);
  assert.equal(holo.group.children.filter(o => o.isMesh).length, meshesBefore - 1, '同片 ghost 应被清掉');
  // 爆发粒子以 size 区分于微尘（微尘 .015，爆发 .045）
  const burstPts = holo.group.children.filter(o => o.isPoints && o.material.size > .02);
  assert.equal(burstPts.length, 1, '应生成一簇爆发粒子');
  holo.dispose();
});

test('update(dt)：呼吸 opacity 在 .18~.5，微尘位置/颜色逐帧更新，不抛异常', () => {
  const ctx = build(3);
  const holo = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, benchRadius: 3 });
  const f = ctx.fragments[0];
  holo.setSelected(f);
  holo.update(1 / 60);
  assert.ok(holo.ghost, 'update 后 ghost 仍在');
  const dust = holo.group.children.find(o => o.isPoints && o.material.size <= .02);
  assert.ok(dust, '应存在环境微尘（size ≈ .015）');
  const p0 = dust.geometry.attributes.position.array[0];
  for (let i = 0; i < 10; i++) holo.update(1 / 60);
  assert.notEqual(dust.geometry.attributes.position.array[0], p0, '微尘应持续漂移');
  // 拖拽趋近：碎片贴近落点 → ghost 变亮（≤ .5）
  f.mesh.position.copy(f.correctPosition);
  holo.setDragging(true);
  holo.update(1 / 60);
  assert.ok(holo.ghost.material.opacity <= .5 + 1e-6 && holo.ghost.material.opacity >= .18 - 1e-6, '呼吸区间 [.18, .5]');
  holo.setDragging(false);
  holo.update(1 / 60);
  holo.dispose();
});

test('全部锁定 → 金缮终章：壳体淡出、金线生长、成品落回台面且 correctPosition 回落', () => {
  const ctx = build(4);
  const lift = 2.5;
  for (const f of ctx.fragments) f.correctPosition.y += lift;
  const holo = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, benchRadius: 3, lift });
  const centerY0 = ctx.fragments[0].correctPosition.y;
  for (const f of ctx.fragments) { f.locked = true; f.mesh.position.copy(f.correctPosition); }
  holo.markLocked(ctx.fragments[0], { silent: true });
  for (let i = 0; i < 120; i++) holo.update(1 / 60); // 2s：壳体淡出完成、金缮进行中
  assert.ok(holo.fadedOut, '壳体淡出应完成');
  assert.equal(holo.shell.material.uniforms.uOpacity.value, 0, '壳体透明度应到 0');
  assert.equal(holo.settled, false, '2s 时金缮未完（应在蔓延/落回阶段）');
  for (let i = 0; i < 260; i++) holo.update(1 / 60); // 推进到 settle（约 6.3s 总时长）
  assert.ok(holo.settled, '金缮终章应完成');
  assert.equal(ctx.fragments[0].correctPosition.y, centerY0 - lift, 'correctPosition 应回落台面口径');
  assert.equal(ctx.fragments[0].mesh.position.y, ctx.fragments[0].correctPosition.y, '成品应落回台面');
  // settle 后注册回调应立即执行
  let called = 0;
  holo.onSettled(() => called++);
  assert.equal(called, 1, 'settle 后 onSettled 应立即触发');
  holo.dispose();
});

test('GLB 接管（A1/A2）：线框全息换壳互斥、终章碎片淡出、金线随成品常留、degrade 回退程序化壳', () => {
  const ctx = build(4);
  const lift = 2.5;
  for (const f of ctx.fragments) f.correctPosition.y += lift;
  const holo = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, benchRadius: 3, lift });
  // A1：假 GLB root（组内两网格，geometry 与断言共享）
  const geoA = new THREE.CylinderGeometry(.5, .6, 1, 12);
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geoA));
  root.add(new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 8)));
  root.updateMatrixWorld(true);
  holo.setModel(root);
  assert.ok(holo.modelActive, 'setModel 后 GLB 全息应激活');
  assert.equal(holo.shell.visible, false, 'GLB 线框版应与程序化 Lathe 壳互斥');
  const kitHolo = holo.group.children.find(o => o.name === 'holo-glb');
  assert.ok(kitHolo, 'GLB 线框全息组应挂入全息组');
  assert.ok(kitHolo.children.some(o => o.type === 'LineSegments'), '应有 EdgesGeometry 经线');
  assert.ok(kitHolo.children.some(o => o.isMesh && o.material.type === 'MeshBasicMaterial'), '应有半透明叠层壳');
  // A2：全部锁定 → 终章 → 程序化碎片 0.6s 淡出，纹理成品接管
  const centerY0 = ctx.fragments[0].correctPosition.y;
  for (const f of ctx.fragments) { f.locked = true; f.mesh.position.copy(f.correctPosition); }
  holo.markLocked(ctx.fragments[0], { silent: true });
  for (let i = 0; i < 50; i++) holo.update(1 / 60); // 0.83s：淡出应已完成
  assert.equal(ctx.fragments[0].mesh.material.opacity, 0, 'GLB 接管时程序化碎片应淡出');
  assert.equal(ctx.fragments[0].mesh.visible, false, '淡出完成后碎片应隐藏');
  for (let i = 0; i < 340; i++) holo.update(1 / 60); // 推进到 settle
  assert.ok(holo.settled, '金缮终章应完成');
  assert.equal(ctx.fragments[0].correctPosition.y, centerY0 - lift, 'correctPosition 回落口径不变');
  const kGroup = root.parent;
  assert.ok(kGroup?.isGroup, '纹理成品 GLB 应挂入金缮组随落回');
  assert.equal(kGroup.visible, true, 'GLB 接管时金线随成品常留（kGroup 不再隐藏）');
  // degrade：退出 GLB 全息回程序化壳兜底，碎片可显状态恢复
  holo.degrade();
  assert.equal(holo.modelActive, false, 'degrade 应清除 GLB 全息');
  assert.equal(holo.shell.visible, true, 'degrade 后恢复程序化壳');
  assert.equal(ctx.fragments[0].mesh.material.opacity, 1, '碎片材质应恢复不透明');
  assert.ok(geoA.attributes.position, 'GLB 共享 geometry 不被全息释放');
  holo.dispose();
});

test('echo 分发：onSettled(cb,{mode}) 非金线方式 → 金线全程不亮、静默退场后回落、不生成金粒环', () => {
  const ctx = build(4);
  const lift = 2.5;
  for (const f of ctx.fragments) f.correctPosition.y += lift;
  const holo = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, benchRadius: 3, lift });
  const centerY0 = ctx.fragments[0].correctPosition.y;
  let called = 0;
  holo.onSettled(() => called++, { mode: 'traditional' }); // 终章未启动 → 记录分发方式
  for (const f of ctx.fragments) { f.locked = true; f.mesh.position.copy(f.correctPosition); }
  holo.markLocked(ctx.fragments[0], { silent: true });
  const kGroup = holo.group.children.find(o => o.isGroup);
  assert.ok(kGroup, '终章组应已建立');
  assert.ok(kGroup.children.every(c => c.visible === false), 'echo 方式金线全程不亮（互不复用）');
  for (let i = 0; i < 120; i++) holo.update(1 / 60); // 2s：静默退场应已结束，回落中
  assert.equal(kGroup.children[0].material.opacity, 0, 'echo 方式无裂缝透金');
  assert.ok(!holo.settled, 'echo 路径约 3.1s，2s 时未 settle');
  assert.equal(kGroup.children.some(c => c.isPoints), false, 'echo 方式不生成瓶口金粒环');
  for (let i = 0; i < 160; i++) holo.update(1 / 60);
  assert.ok(holo.settled, 'echo 方式终章应完成');
  assert.equal(called, 1, 'settle 后回调应触发');
  assert.equal(ctx.fragments[0].correctPosition.y, centerY0 - lift, 'correctPosition 回落口径不变');
  holo.setMode('kintsugi'); // 终章已启动 → setMode 应被忽略且不抛异常
  holo.dispose();
});

test('金线呼吸 + 瓶口金粒环（kintsugi · 高画质）：蔓延完成后 26 粒 0.8s 聚拢消散，回落初期 opacity ∈ [.6,.9]', () => {
  const ctx = build(3);
  const holo = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, benchRadius: 3 });
  for (const f of ctx.fragments) { f.locked = true; f.mesh.position.copy(f.correctPosition); }
  holo.markLocked(ctx.fragments[0], { silent: true });
  const kGroup = holo.group.children.find(o => o.isGroup);
  for (let i = 0; i < 90; i++) holo.update(1 / 60); // 透金 1.5s
  for (let i = 0; i < 48; i++) holo.update(1 / 60); // +0.8s：蔓延中
  assert.equal(kGroup.children.some(c => c.isPoints), false, '蔓延未完成时不应有金粒环');
  for (let i = 0; i < 48; i++) holo.update(1 / 60); // +0.8s：越过 1→2 相变（蔓延 1.6s 完成）
  for (let i = 0; i < 6; i++) holo.update(1 / 60); // 相变帧后推进 0.1s，呼吸曲线已生效
  const kMat = kGroup.children[0].material;
  const ringPts = kGroup.children.find(c => c.isPoints);
  assert.ok(ringPts, '金纹生长完成后应生成瓶口金粒环');
  assert.equal(ringPts.geometry.attributes.position.count, 26, '20~30 粒取 26');
  const op = kMat.opacity;
  assert.ok(op >= .6 - 1e-6 && op <= .9 + 1e-6, `回落初期金线应呼吸于 [.6,.9]（实际 ${op.toFixed(3)}）`);
  for (let i = 0; i < 60; i++) holo.update(1 / 60); // 1s > 0.8s
  assert.equal(kGroup.children.some(c => c.isPoints), false, '金粒环 0.8s 聚拢后应消散');
  for (let i = 0; i < 260; i++) holo.update(1 / 60);
  assert.ok(holo.settled, '金缮终章应完成');
  holo.dispose();
});

test('setMode：终章未启动时记录分发方式（echo 生效），启动后忽略', () => {
  const ctx = build(2);
  const holo = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, benchRadius: 3 });
  holo.setMode('juci');
  for (const f of ctx.fragments) { f.locked = true; f.mesh.position.copy(f.correctPosition); }
  holo.markLocked(ctx.fragments[0], { silent: true });
  const kGroup = holo.group.children.find(o => o.isGroup);
  assert.ok(kGroup.children.every(c => c.visible === false), 'setMode(juci) 后走 echo：金线不亮');
  for (let i = 0; i < 200; i++) holo.update(1 / 60);
  assert.equal(kGroup.children[0].material.opacity, 0, 'juci 方式无透金');
  holo.dispose();
});

test('低画质降级：MeshBasicMaterial、微尘 40 颗、爆发关闭', () => {
  const ctx = build(5);
  const holo = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, low: true, benchRadius: 3 });
  assert.equal(holo.shell.material.type, 'MeshBasicMaterial', '低画质应为纯色半透明基础材质');
  assert.ok(holo.shell.material.transparent && holo.shell.material.blending === THREE.AdditiveBlending);
  const dust = holo.group.children.find(o => o.isPoints);
  assert.equal(dust.geometry.attributes.position.count, 40, '低画质微尘应降到 40');
  holo.markLocked(ctx.fragments[0]); // 不应抛异常，也不产生爆发
  assert.ok(holo.group.children.filter(o => o.isPoints && o.material.size > .02).length === 0, '低画质关闭爆发');
  // degrade：shader → basic
  const holo2 = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, benchRadius: 3 });
  assert.equal(holo2.shell.material.type, 'ShaderMaterial');
  holo2.degrade();
  assert.equal(holo2.shell.material.type, 'MeshBasicMaterial', 'degrade 后应退成基础材质');
  holo.dispose();
  holo2.dispose();
});

test('dispose：全息组移出场景、碎片共享 geometry 不被释放、重复调用安全', () => {
  const ctx = build();
  const holo = createHologramSystem(ctx.scene, { vessel: ctx.vessel, fragments: ctx.fragments, benchRadius: 3 });
  holo.setSelected(ctx.fragments[0]);
  const fragGeo = ctx.fragments[0].mesh.geometry;
  holo.dispose();
  assert.equal(ctx.scene.children.includes(holo.group), false, 'dispose 后组应移出场景');
  holo.setSelected(null); // dispose 后调用不应抛异常
  let threw = false;
  try { holo.dispose(); } catch { threw = true; }
  assert.equal(threw, false, '重复 dispose 不应抛异常');
  assert.ok(fragGeo.attributes.position, '碎片 geometry 应完好（全息不释放共享几何）');
});

test('bench 集成：createPuzzle3DContext 挂全息系统，select/confirm 联动', () => {
  const ctx = build(0);
  const r = recordEvents();
  let confirmed = 0;
  const state = createPuzzle3DContext(ctx.scene, ctx.camera, { domElement: r.canvas }, ctx.fragments, {
    vessel: ctx.vessel,
    onConfirm: f => { f.locked = true; confirmed++; },
  });
  assert.ok(state.hologram, '传入 vessel 时应创建全息系统');
  assert.ok(ctx.scene.children.includes(state.hologram.group));
  // 选中联动 ghost
  state.select(ctx.fragments[0]);
  assert.ok(state.hologram.ghost, 'select 后应显示落点预览');
  // 归位 → confirm 成功 → markLocked 覆盖对应区域
  const f = ctx.fragments[0];
  f.mesh.position.copy(f.correctPosition);
  f.mesh.quaternion.copy(f.correctQuaternion);
  assert.equal(state.confirm(f), true);
  assert.equal(confirmed, 1);
  const cover = state.hologram.shell.geometry.attributes.aCover;
  assert.ok(cover.array.some(v => v === 1), 'confirm 成功后全息对应区域应被填补');
  // 每帧更新不抛异常
  state.update(1 / 60);
  state.dispose();
  assert.equal(ctx.scene.children.includes(state.hologram.group), false, 'bench dispose 应连带清理全息系统');
});

test('bench：全部已归位的重访不建全息（holoLift=0 口径下 hologram 为 null）', () => {
  const ctx = build(0);
  const r = recordEvents();
  for (const f of ctx.fragments) f.locked = true;
  const state = createPuzzle3DContext(ctx.scene, ctx.camera, { domElement: r.canvas }, ctx.fragments, {
    vessel: ctx.vessel,
  });
  assert.equal(state.hologram, null, '全部已归位时不应创建全息系统');
  state.update(1 / 60);
  state.dispose();
});

test('bench 不传 vessel 时 hologram 为 null，update/select 仍安全', () => {
  const ctx = build();
  const r = recordEvents();
  const state = createPuzzle3DContext(ctx.scene, ctx.camera, { domElement: r.canvas }, ctx.fragments, {});
  assert.equal(state.hologram, null);
  state.select(ctx.fragments[0]);
  state.update(1 / 60);
  assert.equal(state.confirm(ctx.fragments[0]), false);
  state.dispose();
});

test('无 vessel / 无轮廓时 createHologramSystem 安全返回 null', () => {
  const { scene } = makeScene();
  assert.equal(createHologramSystem(scene, {}), null);
  assert.equal(createHologramSystem(null, { vessel: VESSELS[0] }), null);
});

test('模块可被 Node 环境 import 且常量口径正确', async () => {
  const mod = await import('../src/modules/hologram.js');
  assert.equal(typeof mod.createHologramSystem, 'function');
  assert.equal(mod.HOLO_COLOR, HOLO_COLOR);
});
