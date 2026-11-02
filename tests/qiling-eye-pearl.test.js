// 器灵眼部珠光：结构回归。
// 3D 渲染本身需要 WebGL，不适合放进 Node 单测；这里锁定“位置/颜色/节奏/降级”这些
// 会被后续调参改坏、又不容易在截图里一眼看出的契约。
import test from 'node:test';
import assert from 'node:assert/strict';
import { EYE_PEARL_LAYOUT, createEyePearl } from '../src/modules/qiling-eye-pearl.js';

const inRange = (v, a, b) => Number.isFinite(v) && v >= a && v <= b;

test('双眼珠光位置落在器灵归一后的模型包围盒内', () => {
  // fitToHeight(root, 2.05) 后模型约 x∈[-0.9,0.9]、y∈[-1.03,1.03]、z∈[-0.55,0.55]。
  assert.equal(EYE_PEARL_LAYOUT.eyes.length, 2);
  for (const eye of EYE_PEARL_LAYOUT.eyes) {
    const [x, y, z] = eye.position;
    assert.ok(inRange(x, -0.9, 0.9), `${eye.id} x 越界: ${x}`);
    assert.ok(inRange(y, -1.03, 1.03), `${eye.id} y 越界: ${y}`);
    assert.ok(inRange(z, -0.55, 0.55), `${eye.id} z 越界: ${z}`);
    assert.ok(z > 0, `${eye.id} 应位于面部前方（z>0）`);
  }
  assert.ok(EYE_PEARL_LAYOUT.eyes[0].position[0] < EYE_PEARL_LAYOUT.eyes[1].position[0], '左眼应在右眼左侧');
  assert.ok(EYE_PEARL_LAYOUT.eyes[0].position[1] > 0.5, '眼部应位于头部上半区');
  assert.ok(EYE_PEARL_LAYOUT.eyes[1].position[1] > 0.5, '眼部应位于头部上半区');
});

test('每只眼睛带表面法线，珠光沿法线抬出而不是沿 +z 抬出', () => {
  // 眼球是凸面，只按 +z 前移会让精灵贴到眉骨背面、被脸挡住（历史 bug）。
  for (const eye of EYE_PEARL_LAYOUT.eyes) {
    assert.equal(eye.normal?.length, 3, `${eye.id} 缺少法线`);
    const [nx, ny, nz] = eye.normal;
    assert.ok(inRange(nx, -0.6, 0.6), `${eye.id} 法线 x 异常`);
    assert.ok(inRange(ny, -0.6, 0.6), `${eye.id} 法线 y 异常`);
    assert.ok(nz > 0.85, `${eye.id} 法线应主要朝向面部前方`);
    const len = Math.hypot(nx, ny, nz);
    assert.ok(Math.abs(len - 1) < 0.05, `${eye.id} 法线应接近单位长度，当前 ${len.toFixed(3)}`);
  }
});

test('珠光前移量足以避开眼面 z-fighting，又不会浮出脸部', () => {
  assert.ok(EYE_PEARL_LAYOUT.forward >= 0.01);
  assert.ok(EYE_PEARL_LAYOUT.forward <= 0.03);
});

test('五层珠光尺寸、透明度与颜色都在可读范围内', () => {
  for (const key of ['sheen', 'pearl', 'flow', 'glint', 'warm']) {
    const layer = EYE_PEARL_LAYOUT[key];
    assert.ok(layer, `缺少 ${key} 层`);
    assert.ok(layer.worldSize > 0 && layer.worldSize < 0.3, `${key} 尺寸异常`);
    assert.ok(layer.opacity > 0.1 && layer.opacity < 0.9, `${key} 透明度异常`);
  }
  assert.ok(EYE_PEARL_LAYOUT.sheen.worldSize > EYE_PEARL_LAYOUT.pearl.worldSize, '珠光底应大于主高光');
  assert.ok(EYE_PEARL_LAYOUT.glint.worldSize < EYE_PEARL_LAYOUT.pearl.worldSize, '闪烁点应小于主高光');
  assert.ok(EYE_PEARL_LAYOUT.warm.worldSize < EYE_PEARL_LAYOUT.glint.worldSize, '暖金卫星应最小');
  for (const key of ['blue', 'white', 'gold', 'warm']) {
    assert.ok(Number.isInteger(EYE_PEARL_LAYOUT.colors[key]), `${key} 颜色必须是 0xRRGGBB 整数`);
    assert.ok(EYE_PEARL_LAYOUT.colors[key] >= 0 && EYE_PEARL_LAYOUT.colors[key] <= 0xffffff);
  }
});

test('眼型偏横长：珠光底与流光带按 aspect 横向铺开，主珠光接近正圆', () => {
  // 器灵眼睛约 0.30 × 0.22（世界单位）。铺得太圆会露出眼白外的方角。
  assert.ok(EYE_PEARL_LAYOUT.sheen.aspect > 1.2, '珠光底应横向铺开');
  assert.ok(EYE_PEARL_LAYOUT.pearl.aspect > 1 && EYE_PEARL_LAYOUT.pearl.aspect < 1.35, '主珠光应接近圆');
  assert.ok(EYE_PEARL_LAYOUT.flow.aspect > 3, '流光带应是细长条');
  // 珠光底宽度不得超过眼球宽度（0.30）太多，避免糊出眼眶。
  const sheenWidth = EYE_PEARL_LAYOUT.sheen.worldSize * EYE_PEARL_LAYOUT.sheen.aspect;
  assert.ok(sheenWidth < 0.30, `珠光底过宽: ${sheenWidth.toFixed(3)}`);
});

test('动效节奏为慢速：旋转与漂移都有明确上限', () => {
  assert.ok(EYE_PEARL_LAYOUT.sheen.speed > 0.05 && EYE_PEARL_LAYOUT.sheen.speed < 0.4, '珠光底旋转应为慢速');
  assert.ok(EYE_PEARL_LAYOUT.pearl.driftX > 0 && EYE_PEARL_LAYOUT.pearl.driftX < 0.02, '主珠光漂移应极小');
  assert.ok(EYE_PEARL_LAYOUT.pearl.driftY > 0 && EYE_PEARL_LAYOUT.pearl.driftY < 0.02, '主珠光漂移应极小');
  assert.ok(EYE_PEARL_LAYOUT.flow.sweep > 0 && EYE_PEARL_LAYOUT.flow.sweep < 0.12, '流光横扫范围不应跨出眼球');
  assert.ok(EYE_PEARL_LAYOUT.eyes[0].phase !== EYE_PEARL_LAYOUT.eyes[1].phase, '左右眼应有相位差，避免同步死板');
});

test('无模型根节点时安全返回 null（不抛错、不依赖 DOM）', () => {
  assert.equal(createEyePearl(null), null);
  assert.equal(createEyePearl(undefined), null);
});
