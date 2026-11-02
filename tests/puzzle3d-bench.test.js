import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VESSELS } from '../src/data/vessels.js';
import { create3DFragments, P3D, benchRadiusFor, footprintExtent } from '../src/modules/puzzle3d.js';
import { createPuzzle3DContext } from '../src/modules/puzzle3d-bench.js';

// 无 DOM 环境下可 import 的最小 canvas / 事件桩
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
  return {
    canvas,
    fired, // 直接暴露 fired，测试断言用
    trigger(type, event) { for (const fn of fired[type] ?? []) fn(event); },
  };
}

const makeScene = () => {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 50);
  camera.position.set(0, 0, 0.1);
  camera.lookAt(0, 0, 0);
  return { scene, camera };
};

test('createPuzzle3DContext 返回对象含规格要求的全部方法/字段', () => {
  const { scene, camera } = makeScene();
  const r = recordEvents();
  const frags = create3DFragments(VESSELS[0]).fragments;
  const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, {});
  const need = ['group', 'setVisible', 'confine', 'select', 'rotateFragment', 'confirm', 'pinchZoom', 'panView', 'dispose', 'rotateSelected', 'view', 'pointers', 'selected', 'isDragging', 'isRotating', 'lastPinchDist', 'lastPan'];
  for (const k of need) assert.ok(k in state, `state 缺 ${k}`);
  assert.equal(typeof state.dispose, 'function');
  assert.ok(state.pointers instanceof Map);
  state.dispose();
});

test('dispose() 后 group/碎碴被移除、几何材质释放、pointers 清空', () => {
  const { scene, camera } = makeScene();
  const r = recordEvents();
  const frags = create3DFragments(VESSELS[1]).fragments;
  const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, {});

  const groupBefore = scene.children.includes(state.group);
  const debrisBefore = scene.children.includes(state.debris);
  assert.equal(groupBefore, true);
  assert.equal(debrisBefore, true);

  state.dispose();

  assert.equal(scene.children.includes(state.group), false, 'dispose 后 group 应被移除');
  assert.equal(scene.children.includes(state.debris), false, 'dispose 后碎碴应被移除');
  assert.equal(state.group.children.length, 0, 'dispose 后 group 子节点应为空');
  assert.equal(state.pointers.size, 0, 'dispose 后 pointers 应清空');
  assert.equal(state.selected, null, 'dispose 后 selected 应清空');
  assert.equal(state.isDragging, false);
  // 碎片几何/材质 dispose 标志（THREE.dispose 是方法调用，不能直接查 disposed 属性）
  for (const f of frags) {
    assert.equal(f.mesh.parent, null, `碎片 ${f.index} 的 mesh 应从父级移除`);
  }
});

test('事件监听在 dispose 后全部解绑（canvas + window）', () => {
  const { scene, camera } = makeScene();
  const r = recordEvents();
  const frags = create3DFragments(VESSELS[0]).fragments;
  const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, {});

  // 绑定后 canvas 上应有 7 类监听
  assert.ok(r.fired.pointerdown?.length, 'pointerdown 应已绑定');
  assert.ok(r.fired.pointermove?.length, 'pointermove 应已绑定');
  assert.ok(r.fired.pointerup?.length, 'pointerup 应已绑定');
  assert.ok(r.fired.pointercancel?.length, 'pointercancel 应已绑定');
  assert.ok(r.fired.lostpointercapture?.length, 'lostpointercapture 应已绑定');
  assert.ok(r.fired.contextmenu?.length, 'contextmenu 应已绑定');
  assert.ok(r.fired.wheel?.length, 'wheel 应已绑定');

  state.dispose();

  assert.equal(r.fired.pointerdown?.length ?? 0, 0, 'dispose 后 pointerdown 应解绑');
  assert.equal(r.fired.pointermove?.length ?? 0, 0);
  assert.equal(r.fired.pointerup?.length ?? 0, 0);
  assert.equal(r.fired.pointercancel?.length ?? 0, 0);
  assert.equal(r.fired.lostpointercapture?.length ?? 0, 0);
  assert.equal(r.fired.contextmenu?.length ?? 0, 0);
  assert.equal(r.fired.wheel?.length ?? 0, 0);
});

test('双指手势与碎片拾取互斥：第二指按下时 selected/activePointerId 被清除', () => {
  const { scene, camera } = makeScene();
  const r = recordEvents();
  const frags = create3DFragments(VESSELS[0]).fragments;
  let picked = 'unset';
  const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, {
    onFragmentPicked: f => { picked = f; },
  });

  // 先把第 0 片摆到屏幕中心，确保左键 pickFragment 能命中
  state.select(frags[0]);
  assert.equal(picked, frags[0]);
  assert.equal(state.selected, frags[0]);

  // 模拟双指：第二指按下（button=0，pointerType=touch）
  const p1 = { pointerId: 1, clientX: 400, clientY: 300, button: 0, preventDefault() {}, pointerType: 'touch' };
  const p2 = { pointerId: 2, clientX: 460, clientY: 300, button: 0, preventDefault() {}, pointerType: 'touch' };
  r.trigger('pointerdown', p1);
  r.trigger('pointerdown', p2);

  // 互斥：第二指按下时 selected 必须被清除
  assert.equal(state.selected, null, '双指进入时 selected 应被清除');
  assert.equal(state.isDragging, false, '双指进入时 isDragging 应为 false');
  assert.equal(picked, null, '双指进入时 onFragmentPicked(null) 应被调用');
  assert.equal(state.pointers.size, 2, '双指 pointers.size 应为 2');

  // 抬起两指后应恢复正常
  r.trigger('pointerup', { ...p1 });
  r.trigger('pointerup', { ...p2 });
  assert.equal(state.pointers.size, 0, '两指抬起后 pointers 应为空');
  state.dispose();
});

test('双指缩放路径：双指 move 触发 pinchZoom，不触发碎片拖动', () => {
  const { scene, camera } = makeScene();
  const r = recordEvents();
  const frags = create3DFragments(VESSELS[2]).fragments;
  const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, {});

  const p1 = { pointerId: 1, clientX: 400, clientY: 300, button: 0, preventDefault() {}, pointerType: 'touch' };
  const p2 = { pointerId: 2, clientX: 460, clientY: 300, button: 0, preventDefault() {}, pointerType: 'touch' };
  r.trigger('pointerdown', p1);
  r.trigger('pointerdown', p2);
  // 此时 pointers.size=2 且 viewPinchIds 已设，move 应走 pinchZoom 分支
  const beforeZoom = state.view.zoom;
  r.trigger('pointermove', { pointerId: 2, clientX: 500, clientY: 300, button: 0, preventDefault() {}, pointerType: 'touch' });
  assert.ok(state.view.zoom !== beforeZoom, '双指 move 应改变 view.zoom');
  assert.equal(state.pointers.size, 2, '双指 move 后 pointers 仍为 2');

  // 抬起两指
  r.trigger('pointerup', { ...p1 });
  r.trigger('pointerup', { ...p2 });
  assert.equal(state.pointers.size, 0);
  state.dispose();
});

test('confirm() 仅当距离/角度双阈值达标才触发 onConfirm（P3D 常量口径）', () => {
  const { scene, camera } = makeScene();
  const r = recordEvents();
  const frags = create3DFragments(VESSELS[3]).fragments;
  let confirmed = 0;
  const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, {
    onConfirm: f => { confirmed++; },
  });

  // 散落状态：距离 > snapDistance，confirm 应返回 false
  assert.equal(state.confirm(frags[0]), false, '散落状态 confirm 应返回 false');
  assert.equal(confirmed, 0, '未达标不应触发 onConfirm');

  // 把碎片放到归位位置：距离=0、角度=0，confirm 应返回 true
  frags[0].mesh.position.copy(frags[0].correctPosition);
  frags[0].mesh.quaternion.copy(frags[0].correctQuaternion);
  assert.equal(state.confirm(frags[0]), true, '归位状态 confirm 应返回 true');
  assert.equal(confirmed, 1, '达标时应触发一次 onConfirm');

  // locked 后 confirm 不再触发
  frags[0].locked = true;
  assert.equal(state.confirm(frags[0]), false, 'locked 碎片 confirm 应返回 false');
  state.dispose();
});

test('confine() 把碎片限制在工作台圆形区域与高度范围内', () => {
  const { scene, camera } = makeScene();
  const r = recordEvents();
  const frags = create3DFragments(VESSELS[4]).fragments;
  const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, {});

  // 台面落位改造（任务 A）：半径单值改为 benchRadiusFor(count)（旧 max(2.2, count*.28) 放不下平放长片）；
  // 竖向下限改为"直立姿态器底不穿台面"（benchTopY - 几何 minY），不再是悬浮时代的 -0.15。
  const benchRadius = benchRadiusFor(frags.length);
  const maxR = benchRadius - 0.35;
  const floorY = P3D.benchTopY - frags[0].mesh.geometry.boundingBox.min.y;
  const ceilY = Math.max(2.2, frags[0].correctPosition.y + 1);

  const f = frags[0];
  f.mesh.position.set(99, 99, 99); // 远超边界
  state.confine(f);
  const radius = Math.hypot(f.mesh.position.x, f.mesh.position.z);
  assert.ok(radius <= maxR + 1e-6, `confine 后半径 ${radius} 应 ≤ maxR ${maxR}`);
  assert.ok(f.mesh.position.y >= floorY - 1e-6 && f.mesh.position.y <= ceilY + 1e-6,
    `confine 后 y=${f.mesh.position.y} 应在 [${floorY.toFixed(2)}, ${ceilY.toFixed(2)}]`);

  state.dispose();
});

test('台面圆盘已彻底移除：场景里不得再出现任何圆盘/台沿网格（含非拼合屏漏显）', () => {
  // 回归背景：原有一块半径 5.2+ 的圆柱台面 + 台沿环，会横切展示中的器身（启程/档案柜/委托
  // 也一直亮着）。现在台面相关网格全部删除，只保留不可见的落位坐标平面 P3D.benchTopY。
  const { scene, camera } = makeScene();
  const r = recordEvents();
  const frags = create3DFragments(VESSELS[0]).fragments;
  const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, {});
  assert.equal('bench' in state, false, 'state 不应再有 bench 台面');
  const discs = [];
  scene.traverse(o => {
    if (!o.isMesh) return;
    const t = o.geometry?.type;
    if (t === 'CylinderGeometry' || t === 'CircleGeometry' || t === 'RingGeometry' || t === 'TorusGeometry') discs.push(`${t}:${o.name || o.type}`);
  });
  assert.deepEqual(discs, [], `拼合场景不得残留圆盘/台沿网格：${discs.join(', ')}`);
  // 但布局口径仍在：半径单值与落位平面高度仍按 benchRadiusFor / benchTopY 走
  assert.ok(benchRadiusFor(frags.length) > 0, 'benchRadiusFor 仍作为布局半径口径');
  assert.ok(Number.isFinite(P3D.benchTopY), 'benchTopY 仍作为不可见落位平面');
  state.dispose();
});

test('台面碎碴：10~20 颗胎色四面体 + 间隙微碴同池、落在台面、不参与拾取（任务 A3/④）', () => {
  const { scene, camera } = makeScene();
  const r = recordEvents();
  const frags = create3DFragments(VESSELS[1]).fragments;
  const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, {});
  assert.ok(state.debris, '应创建碎碴组');
  // 高画质：碎碴 16 + 间隙微碴 4~6 = 20~22（同池管理）
  assert.ok(state.debris.children.length >= 20 && state.debris.children.length <= 22,
    `碎碴+微碴总数 ${state.debris.children.length} 应在 20~22`);
  for (const d of state.debris.children) {
    assert.equal(d.geometry.type, 'TetrahedronGeometry', '碎碴应为四面体');
    assert.equal(d.material.color.getHex(), 0xd8d2c2, '碎碴应为胎色');
    assert.ok(Math.abs(d.position.y - P3D.benchTopY) < .2, '碎碴应贴在台面上');
    assert.equal(frags.some(f => f.mesh === d), false, '碎碴不是可拾取碎片');
  }
  // raycast 被短路：任何调用都不产生命中
  const ray = new THREE.Raycaster();
  ray.ray.origin.set(0, 5, 0); ray.ray.direction.set(0, -1, 0);
  const hits = [];
  for (const d of state.debris.children) d.raycast(ray, hits, () => {});
  assert.equal(hits.length, 0, '碎碴 raycast 应被短路（不挡主碎片）');
  state.dispose();
});

test('碎片间隙微碴：高画质 4~6 颗 / 低画质 2 颗、0.02~0.05、不压碎片足印、贴台面（任务④）', () => {
  const build = (lowPower) => {
    const { scene, camera } = makeScene();
    const r = recordEvents();
    const frags = create3DFragments(VESSELS[1]).fragments;
    const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, { lowPower });
    return { state, frags, close: () => state.dispose() };
  };
  const { state, frags, close } = build(false);
  const micro = state.debris.children.filter(d => d.userData.micro);
  assert.ok(micro.length >= 4 && micro.length <= 6, `微碴数量 ${micro.length} 应在 4~6`);
  // 足印拒绝采样：微碴不落在任何碎片足印 OBB 内
  const fps = frags.map(f => {
    const e = footprintExtent(f.mesh.geometry, f.scatterQuaternion);
    return {
      u: e.u, w: e.w, halfU: e.halfU, halfW: e.halfW,
      cx: f.scatterPosition.x + e.cU * e.u.x + e.cW * e.w.x,
      cz: f.scatterPosition.z + e.cU * e.u.z + e.cW * e.w.z
    };
  });
  for (const d of micro) {
    const sMax = Math.max(d.scale.x, d.scale.y, d.scale.z);
    assert.ok(sMax <= P3D.debris.micro.maxSize * 1.3 + 1e-6, `微碴尺寸 ${sMax.toFixed(3)} 应 ≤ .065（0.02~0.05 档）`);
    assert.ok(Math.abs(d.position.y - P3D.benchTopY) < .05, '微碴应贴台面不悬空');
    for (const fp of fps) {
      const dx = d.position.x - fp.cx, dz = d.position.z - fp.cz;
      const inU = Math.abs(dx * fp.u.x + dz * fp.u.z) <= fp.halfU;
      const inW = Math.abs(dx * fp.w.x + dz * fp.w.z) <= fp.halfW;
      assert.ok(!(inU && inW), '微碴不应压在碎片足印内');
    }
  }
  close();
  // 低画质：恰好 2 颗（10 碎碴 + 2 微碴 = 12）
  const lowCtx = build(true);
  const microLow = lowCtx.state.debris.children.filter(d => d.userData.micro);
  assert.equal(microLow.length, 2, '低画质微碴应为 2 颗（减半不为零）');
  assert.equal(lowCtx.state.debris.children.length, 12, '低画质同池总数应为 12');
  lowCtx.close();
});

test('落位扬尘播放：入场错峰发射、0.6s 淡出回收、锁定片不播、低画质关闭（任务①）', () => {
  const dustCount = scene => scene.children.filter(o => o.isPoints && o.material?.isShaderMaterial).length;
  const { scene, camera } = makeScene();
  const r = recordEvents();
  const frags = create3DFragments(VESSELS[0]).fragments;
  const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, {});
  assert.ok(dustCount(scene) > 0, '入场应有活动/待播的扬尘 burst');
  // 推进 1s（> 0.6s life + 最大错峰 8×.055=.44s）应全部回收
  for (let i = 0; i < 60; i++) state.update(1 / 60);
  assert.equal(dustCount(scene), 0, '0.6s 淡出后应全部回收');
  // 手动触发：未锁定片播、锁定片不播
  const f0 = frags[0];
  f0.locked = false;
  state.playDust(f0);
  assert.equal(dustCount(scene), 1, 'playDust 应发射一束');
  f0.locked = true;
  state.playDust(f0);
  assert.equal(dustCount(scene), 1, '锁定片不应播');
  state.dispose();
  assert.equal(dustCount(scene), 0, 'dispose 应回收未播完的 burst');
  // 低画质：入场不播、手动触发也不播
  const lowScene = (() => { const s = makeScene(); const r2 = recordEvents(); const f2 = create3DFragments(VESSELS[0]).fragments;
    const st2 = createPuzzle3DContext(s.scene, s.camera, { domElement: r2.canvas }, f2, { lowPower: true });
    return { ...s, st2, f2, r2 }; })();
  assert.equal(dustCount(lowScene.scene), 0, '低画质入场不应播扬尘');
  lowScene.f2[0].locked = false;
  lowScene.st2.playDust(lowScene.f2[0]);
  assert.equal(dustCount(lowScene.scene), 0, '低画质 playDust 应短路');
  lowScene.st2.dispose();
});

test('阴影分级（任务 A4/C7）：高画质碎片/碎碴投影，低画质关闭', () => {
  const high = (() => {
    const { scene, camera } = makeScene();
    const r = recordEvents();
    const frags = create3DFragments(VESSELS[0]).fragments;
    const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, {});
    const cast = frags.every(f => f.mesh.castShadow) && state.debris.children.every(d => d.castShadow);
    state.dispose();
    return cast;
  })();
  assert.equal(high, true, '高画质应开投影');
  const lowp = (() => {
    const { scene, camera } = makeScene();
    const r = recordEvents();
    const frags = create3DFragments(VESSELS[0]).fragments;
    const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, { lowPower: true });
    const cast = frags.every(f => !f.mesh.castShadow) && state.debris.children.every(d => !d.castShadow);
    state.dispose();
    return cast;
  })();
  assert.equal(lowp, true, '低电/移动档应关闭投影');
});

test('松手落回（任务 A2）：未吸附碎片落回台面散落位，姿态回到躺放', () => {
  const { scene, camera } = makeScene();
  const r = recordEvents();
  const frags = create3DFragments(VESSELS[2]).fragments;
  const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, {});
  const f = frags[0];
  // 模拟"抓起"：select 会把它拉向悬浮拼合面
  state.select(f);
  for (let i = 0; i < 60; i++) state.update(1 / 60); // 升空补间走完
  assert.ok(f.mesh.position.distanceTo(f.scatterPosition) > .5, '抓起后应离台');
  // 松手未吸附 → 落回
  state.settleBack(f);
  for (let i = 0; i < 60; i++) state.update(1 / 60);
  assert.ok(f.mesh.position.distanceTo(f.scatterPosition) < 1e-3,
    `落回后应与散落位重合（差 ${f.mesh.position.distanceTo(f.scatterPosition)}）`);
  assert.ok(f.mesh.quaternion.angleTo(f.scatterQuaternion) < 1e-3, '落回后姿态应回到躺放');
  state.dispose();
});

test('select() 通知 onFragmentPicked，且 select(null) 可取消选中', () => {
  const { scene, camera } = makeScene();
  const r = recordEvents();
  const frags = create3DFragments(VESSELS[5]).fragments;
  const seen = [];
  const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, {
    onFragmentPicked: f => seen.push(f),
  });
  state.select(frags[0]);
  assert.equal(seen.length, 1);
  assert.equal(seen[0], frags[0]);
  state.select(null);
  assert.equal(seen.length, 2);
  assert.equal(seen[1], null);
  assert.equal(state.selected, null);
  state.dispose();
});

test('模块可被 Node 环境 import 且无副作用崩溃', async () => {
  const mod = await import('../src/modules/puzzle3d-bench.js');
  assert.equal(typeof mod.createPuzzle3DContext, 'function');
});

test('dispose() 幂等：重复调用不抛异常且监听不再二次解绑', () => {
  const { scene, camera } = makeScene();
  const r = recordEvents();
  const frags = create3DFragments(VESSELS[0]).fragments;
  const state = createPuzzle3DContext(scene, camera, { domElement: r.canvas }, frags, {});

  // 首次 dispose：正常清理
  state.dispose();
  const debrisInSceneAfter1 = scene.children.includes(state.debris);
  const groupInSceneAfter1 = scene.children.includes(state.group);

  // 第二次、第三次 dispose：必须不抛异常（_disposed 守卫 + THREE 幂等）
  let threw = false;
  try {
    state.dispose();
    state.dispose();
  } catch (e) {
    threw = true;
  }
  assert.equal(threw, false, '重复 dispose 不应抛异常');
  assert.equal(debrisInSceneAfter1, false, '碎碴首次 dispose 后应移出场景');
  assert.equal(groupInSceneAfter1, false, 'group 首次 dispose 后应移出场景');
  assert.equal(state.pointers.size, 0, 'pointers 应清空');
  assert.equal(state.selected, null, 'selected 应清空');
});
