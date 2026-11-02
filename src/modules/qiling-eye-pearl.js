// 「器灵 · 阿圆」眼部动态珠光。
//
// 模型 public/models/qiling.glb 是一整块网格（约 12.9 万顶点、单一 MeshPhysicalMaterial），
// 眼睛画在贴图里，没有独立眼球/瞳孔节点。因此这里不改模型、不做贴图重绘，
// 而是在双眼表面各叠一组程序化 Sprite（Canvas 纹理，零外部素材）：
//
//   ① sheen 珠光底：锥形渐变（淡青 → 淡紫 → 暖珍珠 → 白），径向 alpha 收边；
//      缓慢旋转，让眼内像有一层流动的釉光，而不是一颗死白点。
//   ② pearl 主珠光：柔白偏青的径向高光，覆盖瞳孔上半，轻微漂移 + 呼吸缩放。
//   ③ flow 流光带：横向细长柔光，沿眼型长轴缓缓扫过瞳孔，制造“眼波流动”。
//   ④ glint 小高光：更小、更锐的暖白点，偶发闪烁，制造“活着的眼神”。
//   ⑤ warm 暖金卫星：极小的一粒暖金，压在下缘，和金缮/描金气质呼应。
//
// 位置来自「渲染图暗区质心 + 射线拾取」（参考画布 600×810、fitToHeight 2.05），
// 连同表面法线一起记录为模型局部坐标；Sprite 挂在 root 下，随器灵转头/悬浮一起动。
//
// 尺寸口径：worldSize 是“高度/短边”，aspect 是“宽 / 高”。器灵眼型偏横长，
// 因此 sheen 与 flow 都按 aspect > 1 铺开，既盖住眼白又不糊到眼睑。
//
// 节奏与强度（详见 docs/器灵眼部珠光效果说明.md）：
//   · 待机：sheen 旋转 0.30 rad/s（约 21s 一圈），flow 约 29s 一个来回，
//     pearl 漂移周期约 11s，glint 约 7s 一次轻闪。
//   · 说话：整体强度 +0.12~0.20，漂移/闪烁速度 ×1.25，0.35s 平滑过渡。
//   · 低画质：只保留 sheen + pearl，静态呈现（遵循模块“低性能不播动画”的约束）。
//   · 减少动态：保留各层，但不旋转/不漂移/不闪烁，只做静态珠光。
import * as THREE from 'three';

// 眼部局部坐标：由 qiling.glb 在 fitToHeight(root, 2.05) 后用射线拾取得到。
// 左眼 = 观众视角左侧；右眼 = 观众视角右侧。z 为面部朝前方向。
export const EYE_PEARL_LAYOUT = {
  // 眼球中心由「渲染图暗区质心 + 射线拾取」得到（600×810、fitToHeight 2.05），
  // 并把拾取到的表面法线一起记下来，珠光沿法线抬出而不是沿 +z 抬出，
  // 否则会贴到眉骨背面被脸挡住。
  eyes: [
    { id: 'left', position: [-0.1793, 0.5672, 0.1754], normal: [-0.313, 0.114, 0.943], phase: 0, tilt: 0.10 },
    { id: 'right', position: [0.0897, 0.5798, 0.1805], normal: [0.196, 0.150, 0.969], phase: 1.73, tilt: -0.10 }
  ],
  forward: 0.018,          // 沿眼球表面法线抬出，避开眼面 z-fighting
  sheen: { worldSize: 0.190, aspect: 1.46, opacity: 0.54, speed: 0.30 },
  pearl: { worldSize: 0.182, aspect: 1.16, opacity: 0.64, driftX: 0.009, driftY: 0.007 },
  flow: { worldSize: 0.082, aspect: 3.40, opacity: 0.30, sweep: 0.086, speed: 0.22 },
  glint: { worldSize: 0.058, opacity: 0.66, offset: [0.034, 0.004] },
  warm: { worldSize: 0.028, opacity: 0.26, offset: [-0.016, -0.032] },
  colors: {
    blue: 0xdcefff,
    white: 0xfff8e8,
    gold: 0xf2d6a2,
    warm: 0xffd9a0
  }
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function makeTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

function radialTexture(size, stops) {
  return makeTexture(size, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    for (const [p, color] of stops) g.addColorStop(p, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

function sheenTexture(size) {
  return makeTexture(size, (ctx, s) => {
    // 锥形虹彩：淡青 → 淡紫 → 暖珍珠 → 白 → 回到淡青。
    // 用径向 alpha 收边，保证不会糊到眼白/金边上。
    const conic = typeof ctx.createConicGradient === 'function';
    let g;
    if (conic) {
      g = ctx.createConicGradient(-Math.PI / 3, s / 2, s / 2);
    } else {
      g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    }
    const stops = [
      [0.00, 'rgba(150,198,255,.70)'],
      [0.20, 'rgba(205,185,255,.54)'],
      [0.40, 'rgba(255,226,176,.42)'],
      [0.60, 'rgba(150,205,255,.62)'],
      [0.80, 'rgba(224,238,255,.40)'],
      [1.00, 'rgba(150,198,255,.70)']
    ];
    for (const [p, color] of stops) g.addColorStop(p, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);

    // 径向 alpha 蒙版
    ctx.globalCompositeOperation = 'destination-in';
    const mask = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    mask.addColorStop(0, 'rgba(255,255,255,.80)');
    mask.addColorStop(0.52, 'rgba(255,255,255,.58)');
    mask.addColorStop(0.80, 'rgba(255,255,255,.16)');
    mask.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'source-over';
  });
}

// 横向流光带：纵向柔和收边，横向两端渐隐，叠在瞳孔上像一层掠过的水光。
function flowTexture(size) {
  return makeTexture(size, (ctx, s) => {
    const band = ctx.createLinearGradient(0, s * 0.22, 0, s * 0.78);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.38, 'rgba(226,242,255,.42)');
    band.addColorStop(0.5, 'rgba(255,255,255,.92)');
    band.addColorStop(0.62, 'rgba(226,242,255,.42)');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, s, s);

    ctx.globalCompositeOperation = 'destination-in';
    const ends = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    ends.addColorStop(0, 'rgba(255,255,255,.95)');
    ends.addColorStop(0.62, 'rgba(255,255,255,.55)');
    ends.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = ends;
    ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'source-over';
  });
}

function tint(target, t, phase, colors) {
  // 蓝 → 白 → 金 的慢循环，幅度压得很低，避免“彩灯”感。
  const k = (Math.sin(t * 0.22 + phase) + 1) / 2;
  if (k < 0.5) target.lerpColors(colors.blue, colors.white, k * 2);
  else target.lerpColors(colors.white, colors.gold, (k - 0.5) * 2);
  return target;
}

export function createEyePearl(root, { low = false, reduced = false } = {}) {
  if (!root || typeof document === 'undefined') return null;
  if (!root.scale || !Number.isFinite(root.scale.x) || root.scale.x <= 0) return null;

  const invScale = 1 / root.scale.x;
  const group = new THREE.Group();
  group.name = 'qiling-eye-pearl';
  group.renderOrder = 12;
  root.add(group);

  const size = low ? 64 : 128;
  const textures = {
    sheen: sheenTexture(size),
    pearl: radialTexture(size, [
      [0.00, 'rgba(255,255,255,.92)'],
      [0.20, 'rgba(240,249,255,.86)'],
      [0.44, 'rgba(188,226,255,.56)'],
      [0.70, 'rgba(130,180,235,.20)'],
      [1.00, 'rgba(90,150,225,0)']
    ]),
    flow: flowTexture(size),
    glint: radialTexture(Math.max(32, size / 2), [
      [0.00, 'rgba(255,255,255,1)'],
      [0.18, 'rgba(255,251,238,.98)'],
      [0.40, 'rgba(255,232,180,.55)'],
      [1.00, 'rgba(255,215,150,0)']
    ]),
    warm: radialTexture(Math.max(32, size / 2), [
      [0.00, 'rgba(255,240,210,.90)'],
      [0.50, 'rgba(255,220,160,.35)'],
      [1.00, 'rgba(255,200,120,0)']
    ])
  };

  const colors = {
    blue: new THREE.Color(EYE_PEARL_LAYOUT.colors.blue),
    white: new THREE.Color(EYE_PEARL_LAYOUT.colors.white),
    gold: new THREE.Color(EYE_PEARL_LAYOUT.colors.gold)
  };
  const scratch = new THREE.Color();
  const eyes = [];

  function sprite(tex, worldSize, aspect, color, opacity, x, y, z) {
    const material = new THREE.SpriteMaterial({
      map: tex,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      // 眼球是凸面，平面 Sprite 只要做深度测试，边缘就会被自己的眼面吃掉，
      // 转头时高光会一块块消失。整层收在瞳孔轮廓内、alpha 到边归零，关闭深度测试更稳定。
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    const s = new THREE.Sprite(material);
    s.scale.set(worldSize * aspect * invScale, worldSize * invScale, 1);
    s.position.set(x, y, z);
    s.renderOrder = 13;
    group.add(s);
    return s;
  }

  for (const eye of EYE_PEARL_LAYOUT.eyes) {
    const [x, y, z] = eye.position;
    const n = eye.normal || [0, 0, 1];
    // 沿表面法线抬出：眼球是凸面，单纯 +z 会在侧转时钻回眉骨/眼窝。
    const fx = x + n[0] * EYE_PEARL_LAYOUT.forward;
    const fy = y + n[1] * EYE_PEARL_LAYOUT.forward;
    const fz = z + n[2] * EYE_PEARL_LAYOUT.forward;

    const sheen = sprite(
      textures.sheen, EYE_PEARL_LAYOUT.sheen.worldSize, EYE_PEARL_LAYOUT.sheen.aspect,
      0xffffff, EYE_PEARL_LAYOUT.sheen.opacity, fx, fy + 0.012, fz
    );

    const pearl = sprite(
      textures.pearl, EYE_PEARL_LAYOUT.pearl.worldSize, EYE_PEARL_LAYOUT.pearl.aspect,
      colors.white.clone(), EYE_PEARL_LAYOUT.pearl.opacity, fx + 0.004, fy + 0.032, fz + 0.002
    );

    const flow = low ? null : sprite(
      textures.flow, EYE_PEARL_LAYOUT.flow.worldSize, EYE_PEARL_LAYOUT.flow.aspect,
      colors.white.clone(), EYE_PEARL_LAYOUT.flow.opacity, fx, fy + 0.012, fz + 0.006
    );
    if (flow) flow.material.rotation = eye.tilt;

    const glint = low ? null : sprite(
      textures.glint, EYE_PEARL_LAYOUT.glint.worldSize, 1,
      colors.white.clone(), EYE_PEARL_LAYOUT.glint.opacity,
      fx + EYE_PEARL_LAYOUT.glint.offset[0], fy + EYE_PEARL_LAYOUT.glint.offset[1], fz + 0.004
    );
    const warm = low ? null : sprite(
      textures.warm, EYE_PEARL_LAYOUT.warm.worldSize, 1,
      new THREE.Color(EYE_PEARL_LAYOUT.colors.warm), EYE_PEARL_LAYOUT.warm.opacity,
      fx + EYE_PEARL_LAYOUT.warm.offset[0], fy + EYE_PEARL_LAYOUT.warm.offset[1], fz + 0.003
    );

    eyes.push({
      eye, sheen, pearl, flow, glint, warm,
      base: { x: fx, y: fy, z: fz },
      baseSheen: sheen.scale.x,
      basePearl: pearl.scale.x,
      baseFlow: flow ? flow.scale.x : 0,
      baseGlint: glint ? glint.scale.x : 0
    });
  }

  let speaking = false;
  let speakMix = 0;
  let lastT = null;

  function applyStatic() {
    // 低画质/减少动态：只呈现一组静态珠光，不跑时间驱动的动效。
    const boost = speaking ? 0.12 : 0;
    for (const item of eyes) {
      item.sheen.material.opacity = EYE_PEARL_LAYOUT.sheen.opacity + boost * 0.6;
      item.pearl.material.opacity = EYE_PEARL_LAYOUT.pearl.opacity + boost;
      if (item.flow) item.flow.material.opacity = EYE_PEARL_LAYOUT.flow.opacity * 0.85;
      if (item.glint) item.glint.material.opacity = EYE_PEARL_LAYOUT.glint.opacity;
      if (item.warm) item.warm.material.opacity = EYE_PEARL_LAYOUT.warm.opacity;
    }
  }
  applyStatic();

  function update(t) {
    if (low || reduced) return;
    const dt = lastT == null ? 0 : clamp(t - lastT, 0, 0.05);
    lastT = t;
    speakMix += ((speaking ? 1 : 0) - speakMix) * Math.min(1, dt / 0.35);
    const speed = 1 + speakMix * 0.25;

    for (const item of eyes) {
      const phase = item.eye.phase;
      const { sheen, pearl, flow, glint, warm, base } = item;

      // ① 珠光底：极慢旋转，像眼内有一层流动的釉光。
      sheen.material.rotation = t * EYE_PEARL_LAYOUT.sheen.speed * speed + phase;
      const sheenBreath = 1 + Math.sin(t * 0.9 + phase) * 0.035;
      sheen.scale.set(
        item.baseSheen * sheenBreath,
        item.baseSheen / EYE_PEARL_LAYOUT.sheen.aspect * sheenBreath,
        1
      );
      sheen.material.opacity = (EYE_PEARL_LAYOUT.sheen.opacity + speakMix * 0.16)
        * (0.93 + Math.sin(t * 0.7 + phase) * 0.07);
      sheen.material.color.copy(tint(scratch, t, phase, colors));

      // ② 主珠光：轻微漂移 + 呼吸；幅度仍小，但比之前更容易被看见。
      pearl.position.x = base.x + Math.sin(t * 0.55 * speed + phase) * EYE_PEARL_LAYOUT.pearl.driftX;
      pearl.position.y = base.y + 0.032 + Math.cos(t * 0.43 * speed + phase) * EYE_PEARL_LAYOUT.pearl.driftY;
      pearl.material.opacity = EYE_PEARL_LAYOUT.pearl.opacity * 0.94
        + speakMix * 0.14 + Math.sin(t * 1.6 + phase) * 0.06;
      const pearlScale = 1 + Math.sin(t * 0.82 + phase) * 0.07;
      pearl.scale.set(item.basePearl * pearlScale, item.basePearl * pearlScale, 1);
      pearl.material.color.copy(tint(scratch, t + 1.7, phase + 0.9, colors));

      // ③ 流光带：沿眼型长轴缓慢横扫，透明度做一次“掠过”的起落。
      if (flow) {
        const sweep = Math.sin(t * EYE_PEARL_LAYOUT.flow.speed * speed + phase * 1.6);
        flow.position.x = base.x + sweep * EYE_PEARL_LAYOUT.flow.sweep;
        flow.position.y = base.y + 0.014 + Math.sin(t * 0.47 + phase) * 0.010;
        flow.material.rotation = item.eye.tilt + sweep * 0.08;
        const fade = 0.45 + (1 - Math.abs(sweep)) * 0.75;
        flow.material.opacity = (EYE_PEARL_LAYOUT.flow.opacity + speakMix * 0.12) * fade;
        const fs = 0.94 + Math.sin(t * 0.62 + phase) * 0.08;
        flow.scale.set(item.baseFlow * fs, item.baseFlow / EYE_PEARL_LAYOUT.flow.aspect * fs, 1);
        flow.material.color.copy(tint(scratch, t + 0.9, phase + 1.4, colors));
      }

      // ④ 小高光：约 7s 一次的窄脉冲，说话时更密；只闪一下，不常亮。
      if (glint) {
        const tw = Math.pow(Math.max(0, Math.sin(t * 0.85 * speed + phase * 2.1)), 10);
        glint.material.opacity = 0.56 + speakMix * 0.20 + tw * 0.40;
        const gs = 1 + tw * 0.34;
        glint.scale.set(item.baseGlint * gs, item.baseGlint * gs, 1);
        glint.material.color.copy(tint(scratch, t + 0.6, phase + 2.2, colors));
      }

      // ⑤ 暖金卫星：与主珠光反相的慢呼吸，提供第二色温。
      if (warm) {
        warm.material.opacity = EYE_PEARL_LAYOUT.warm.opacity * 0.85 + speakMix * 0.12
          + Math.sin(t * 0.6 + phase + 1.3) * 0.04;
        warm.position.x = base.x + EYE_PEARL_LAYOUT.warm.offset[0]
          + Math.cos(t * 0.38 + phase) * 0.003;
        warm.position.y = base.y + EYE_PEARL_LAYOUT.warm.offset[1]
          + Math.sin(t * 0.34 + phase) * 0.002;
      }
    }
  }

  return {
    update,
    setSpeaking(value) {
      speaking = Boolean(value);
      if (low || reduced) applyStatic();
    },
    dispose() {
      for (const item of eyes) {
        for (const s of [item.sheen, item.pearl, item.flow, item.glint, item.warm]) {
          if (!s) continue;
          s.material?.dispose?.();
          group.remove(s);
        }
      }
      for (const tex of Object.values(textures)) tex.dispose?.();
      root.remove(group);
      eyes.length = 0;
    },
    get spriteCount() {
      return eyes.reduce((n, it) => n + (it.flow ? 5 : 2), 0);
    },
    get layout() { return EYE_PEARL_LAYOUT; }
  };
}
