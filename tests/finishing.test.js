import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VESSELS } from '../src/data/vessels.js';
import { vesselProfile } from '../src/modules/vessels3d.js';
import { createFinishing } from '../src/modules/finishing.js';

// 四种修复方式的差异化完成收尾（immersive 证书屏分发）。
// Node 环境下 gsap 只建补间不推进，动画态断言取初始帧；时序行为由 low 静态分支与结构断言覆盖。

const makeTarget = vessel => {
  const profile = vesselProfile(vessel.outline);
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), new THREE.MeshPhysicalMaterial({ color: 0xf5f2ea }));
  mesh.userData.baseY = 0;
  return mesh;
};

const setup = ({ low = false, vesselIndex = 0 } = {}) => {
  const scene = new THREE.Scene();
  const vessel = VESSELS[vesselIndex];
  const target = makeTarget(vessel);
  scene.add(target);
  const finishing = createFinishing(scene, { low, reduce: true });
  return { scene, vessel, target, finishing };
};

test('API 完整：run/hide/show/clear 与 active/mode 状态', () => {
  const { finishing } = setup();
  for (const k of ['run', 'hide', 'show', 'clear']) assert.equal(typeof finishing[k], 'function', `缺 ${k}`);
  assert.equal(finishing.active, false);
  finishing.clear(); // 幂等
});

test('kintsugi 不在此模块叠加（金线走全息金缮终章），run 返回 false', () => {
  const { scene, finishing } = setup();
  const before = scene.children.length;
  assert.equal(finishing.run('kintsugi', { target: makeTarget(VESSELS[0]) }), false);
  assert.equal(scene.children.length, before, '场景不应新增任何动画组');
  assert.equal(finishing.active, false);
});

test('traditional：白瓷补釉缝组锚定展示器身（7 条缝），初始不可见由补间驱动；hide/show 同口径', () => {
  const { scene, vessel, target, finishing } = setup();
  assert.equal(finishing.run('traditional', { target, vessel }), true);
  const anchor = finishing.anchor;
  assert.ok(anchor, '应有白缝动画组');
  assert.equal(anchor.children.length, 7 + vessel.index, `应有 ${7 + vessel.index} 条白缝`);
  assert.equal(anchor.children[0].material.opacity, 0, '高画质初始 opacity=0（1.2s 内亮至 .85）');
  assert.ok(anchor.children[0].material.transparent, '应启用透明');
  assert.ok(anchor.parent === target, '动画组应 attach 到展示器身（跟随器身旋转）');
  finishing.hide();
  assert.equal(anchor.visible, false, 'hide：证书小像/导出渲染前隐藏动画组');
  finishing.show();
  assert.equal(anchor.visible, true, 'show：渲染后恢复');
  finishing.clear();
  assert.equal(finishing.anchor, null, 'clear 后动画组释放');
  assert.equal(scene.children.some(o => o.isGroup && o !== target), false);
});

test('traditional 低画质：静态定格（缝变白常驻 .18），无补间时序', () => {
  const { vessel, target, finishing } = setup({ low: true });
  assert.equal(finishing.run('traditional', { target, vessel }), true);
  const mat = finishing.anchor.children[0].material;
  assert.equal(mat.opacity, .18, '低画质应直接定格为发丝级白缝');
  assert.equal(finishing.dust, null);
  finishing.clear();
});

test('traditional 釉面温润高光：emissive 脉冲在 clear 后还原材质快照', () => {
  const { vessel, target, finishing } = setup();
  const glaze = target.material;
  const baseEmissive = glaze.emissive.getHex(), baseIntensity = glaze.emissiveIntensity;
  finishing.run('traditional', { target, vessel });
  assert.equal(glaze.emissive.getHex(), 0xfff2dd, '脉冲期 emissive 应置暖白');
  assert.equal(glaze.emissiveIntensity, 0, '脉冲从 0 升至峰值 .18');
  finishing.clear();
  assert.equal(glaze.emissive.getHex(), baseEmissive, 'clear 后 emissive 应还原');
  assert.equal(glaze.emissiveIntensity, baseIntensity, 'clear 后 emissiveIntensity 应还原');
});

test('juci：深墨缝常驻 + 每件 5~8 颗工字形铜锔钉（钉身 + 两端小耳）', () => {
  const { scene, vessel, target, finishing } = setup({ vesselIndex: 2 });
  let ticked = 0;
  assert.equal(finishing.run('juci', { target, vessel, audio: { tick: () => ticked++ } }), true);
  const anchor = finishing.anchor;
  const staples = anchor.children.filter(o => o.isGroup);
  assert.ok(staples.length >= 5 && staples.length <= 8, `锔钉数应在 5~8（实际 ${staples.length}）`);
  for (const s of staples) {
    assert.equal(s.children.length, 3, '每颗钉 = 扁圆柱钉身 + 两端小耳');
    const disc = s.children[0];
    assert.equal(disc.geometry.type, 'CylinderGeometry', '钉身应为扁圆柱');
    assert.ok(Math.abs(disc.geometry.parameters.radiusTop - .09) < 1e-6, '钉身半径 .09');
    assert.equal(s.scale.x, 0, '高画质逐颗浮现：初始 scale=0');
  }
  const inkMat = anchor.children.find(o => o.isMesh)?.material;
  assert.equal(inkMat.color.getHex(), 0x3a3226, '裂缝应转深墨常驻');
  assert.equal(ticked, 0, 'node 环境补间不推进，tick 尚未触发');
  assert.equal(stapleMat(anchor), 'MeshStandardMaterial');
  finishing.clear();
  assert.equal(finishing.anchor, null);
});

function stapleMat(anchor) {
  const s = anchor.children.find(o => o.isGroup);
  return s.children[0].material.type;
}

test('juci 低画质：锔钉一次性铺好（scale=1、无浮现时序、无音效）', () => {
  const { vessel, target, finishing } = setup({ low: true, vesselIndex: 1 });
  let ticked = 0;
  finishing.run('juci', { target, vessel, audio: { tick: () => ticked++ } });
  const staples = finishing.anchor.children.filter(o => o.isGroup);
  assert.ok(staples.length >= 5 && staples.length <= 8);
  for (const s of staples) assert.equal(s.scale.x, 1, '低画质锔钉应一次性铺好');
  finishing.clear();
});

test('preserve：暖黄微尘自器身四周沉降（高画质 14 粒 / 低画质 4 粒静态），clear 后移除', () => {
  const { scene, vessel, target, finishing } = setup();
  assert.equal(finishing.run('preserve', { target, vessel, stage: null }), true);
  assert.ok(finishing.dust, '应存在微尘 Points');
  assert.equal(finishing.dust.geometry.attributes.position.count, 14, '高画质 12~16 粒取 14');
  assert.equal(finishing.dust.material.color.getHex(), 0xc9a961, '微尘应为暖黄');
  assert.equal(finishing.dust.material.size, .05, '微尘 size .05');
  assert.equal(finishing.dust.material.opacity, 0, '初始不可见，1.5s 内随沉降渐显渐隐');
  assert.ok(scene.children.includes(finishing.dust), '微尘应挂入场景（器身四周，世界坐标）');
  finishing.clear();
  assert.equal(finishing.dust, null, 'clear 后微尘移除');
  // 低画质：4 粒静态
  const low = setup({ low: true });
  low.finishing.run('preserve', { target: low.target, vessel: low.vessel, stage: null });
  assert.equal(low.finishing.dust.geometry.attributes.position.count, 4, '低画质仅 4 粒');
  assert.equal(low.finishing.dust.material.opacity, .5, '低画质静态浮现');
  low.finishing.clear();
});

test('重复 run：先 clear 再建（幂等），四方式互不复用、互不叠加', () => {
  const { scene, vessel, target, finishing } = setup();
  finishing.run('traditional', { target, vessel });
  const first = finishing.anchor;
  finishing.run('juci', { target, vessel });
  assert.notEqual(finishing.anchor, first, '重跑应重建动画组');
  assert.equal(finishing.mode, 'juci');
  const anchors = target.children.filter(o => o.isGroup);
  assert.equal(anchors.length, 1, '器身上只应存在当前方式的一组动画');
  finishing.run('preserve', { target, vessel, stage: null });
  assert.equal(finishing.mode, 'preserve');
  assert.equal(finishing.anchor, null, 'preserve 无 anchor 组');
  finishing.run('kintsugi', { target, vessel });
  assert.equal(finishing.mode, null, 'kintsugi 跳过后回到无收尾状态');
  finishing.clear();
  finishing.clear(); // 重复 clear 安全
});

test('surfacePoint 表面对齐：缝点应贴在器身射线命中面上（非悬空 profile 半径）', () => {
  const { vessel, target, finishing } = setup({ vesselIndex: 0 });
  finishing.run('traditional', { target, vessel });
  // 取白缝折线的首点：到器身轴线的水平距离应等于器身表面半径（LatheGeometry 采样密，容差内）
  const curve = finishing.anchor.children[0].geometry.attributes.position;
  const p = new THREE.Vector3(curve.getX(0), curve.getY(0), curve.getZ(0));
  const r = Math.hypot(p.x, p.z);
  const profile = vesselProfile(vessel.outline);
  const yMin = profile[0].y, yMax = profile[profile.length - 1].y;
  const radiusAt = y => {
    for (let i = 0; i < profile.length - 1; i++) {
      const [a, ay] = [profile[i].x, profile[i].y], [b, by] = [profile[i + 1].x, profile[i + 1].y];
      if (y >= ay && y <= by) return a + (b - a) * (y - ay) / (by - ay);
    }
    return profile[0].x;
  };
  const expected = radiusAt(p.y);
  assert.ok(Math.abs(r - expected) < .04, `缝点半径 ${r.toFixed(3)} 应贴表面 ${expected.toFixed(3)}（±.04）`);
  finishing.clear();
});
