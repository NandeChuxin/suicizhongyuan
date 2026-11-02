import * as THREE from 'three';
import { gsap } from 'gsap';
import { vesselProfile, radiusAt } from './vessels3d.js';

// —— 四种修复方式的差异化完成收尾（immersive 证书屏分发）——
// 职责分工：kintsugi 的金缮终章由全息系统（hologram.js）独自承担，这里不做任何金线叠加，
// 保证四方式互不复用、互不叠加；本模块只实现另外三种的专属收尾：
//   traditional 白瓷补釉（缝亮起→弥合为发丝细线→釉面温润高光）
//   juci        锔钉镶嵌（深墨缝 + 工字形铜锔钉逐颗落定 + 钉眼磨平微闪）
//   preserve    现状保存（不加修饰：暖黄微尘缓慢沉降 + 低不透明度暖色渐晕）
// 全部程序化生成，无外部素材；低画质降级为静态呈现（隐痕=白缝定格、锔瓷=锔钉一次铺齐、
// 现状保存=仅 4 粒静态微尘）。hide()/show() 供证书小像与 PNG 导出隐藏动画痕迹，
// 与 hologram.setVisible(false) 同一口径；动画组锚定当前展示器身（程序化 vase 或真实 GLB）。

const GOLD_DUST = 0xc9a961;

export function createFinishing(scene, { low = false, reduce = false } = {}) {
  let anchor = null;      // 当前收尾动画组（traditional 白缝 / juci 墨缝+锔钉）
  let dust = null;        // preserve 微尘
  let vignette = null;    // preserve DOM 渐晕
  let mode = null;        // 当前收尾方式
  let tweens = [], timers = [];
  const emissiveBase = new Map(); // 材质 → { emissive, emissiveIntensity } 快照（clear 时还原）

  const track = t => { tweens.push(t); return t; };
  const wait = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
  const killAll = () => {
    for (const t of tweens) t?.kill?.();
    tweens = [];
    for (const id of timers) clearTimeout(id);
    timers = [];
  };
  function disposeGroup(g) {
    g.traverse(o => {
      o.geometry?.dispose?.();
      const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of ms) m.dispose?.();
    });
  }
  function removeDust() {
    if (!dust) return;
    dust.parent?.remove(dust);
    dust.geometry.dispose();
    dust.material.dispose();
    dust = null;
  }
  // 釉面/金属微闪：对目标器身所有带 emissive 的材质做快照 → 设暖色 → 强度脉冲 → clear 还原
  function glowPulse(mats, hex, peak, upMs, downMs, delay) {
    for (const m of mats) {
      if (!m.emissive) continue;
      if (!emissiveBase.has(m)) emissiveBase.set(m, { emissive: m.emissive.clone(), emissiveIntensity: m.emissiveIntensity });
      m.emissive.set(hex);
      m.emissiveIntensity = 0;
      track(gsap.to(m, { emissiveIntensity: peak, duration: upMs / 1000, ease: 'power2.out', delay }));
      track(gsap.to(m, { emissiveIntensity: emissiveBase.get(m).emissiveIntensity, duration: downMs / 1000, ease: 'sine.in', delay: delay + upMs / 1000 + .05 }));
    }
  }
  function collectGlazeMats(target) {
    const mats = new Set();
    target.traverse(o => {
      if (!o.isMesh || !o.material) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m?.emissive) mats.add(m);
    });
    return [...mats];
  }

  // 沿器型折线取样表面点：从器身外侧向轴线投射，命中真实表面（程序化 vase 或 GLB 均适配），
  // 未命中退回 profile 半径。返回世界坐标点与表面法线。
  // 高度映射沿「模型自身中轴」量取（root 局部包围盒的上下端点），不用世界 AABB：
  // 模型带 -.35 的偏航/-.045 的俯仰时，世界 AABB 会比真实器高高 6%（AABB 被旋转撑大），
  // 于是缝线会从口沿与圈足两头穿出去——这是"缝线像笼子"的根因。
  const ray = new THREE.Raycaster();
  const localBoxCache = new WeakMap();
  function localBox(target) {
    if (localBoxCache.has(target)) return localBoxCache.get(target);
    const inv = new THREE.Matrix4().copy(target.matrixWorld).invert();
    const box = new THREE.Box3(), v = new THREE.Vector3(), m = new THREE.Matrix4();
    target.traverse(node => {
      const g = node.geometry;
      if (!g?.attributes?.position) return;
      m.multiplyMatrices(inv, node.matrixWorld);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); box.expandByPoint(v); }
    });
    localBoxCache.set(target, box);
    return box;
  }
  function buildSeamPolylines(target, vessel) {
    const profile = vesselProfile(vessel.outline);
    const count = 7 + vessel.index;
    const yMin = profile[0].y, yMax = profile[profile.length - 1].y;
    const maxR = Math.max(.2, ...profile.map(p => Math.abs(p.x)));
    target.updateWorldMatrix(true, false);
    const lb = localBox(target);
    const p0 = target.localToWorld(new THREE.Vector3(0, lb.min.y, 0));
    const p1 = target.localToWorld(new THREE.Vector3(0, lb.max.y, 0));
    const hT = Math.max(1e-4, p1.y - p0.y), hP = Math.max(1e-4, lb.max.y - lb.min.y);
    const toWorldY = y => p0.y + (y - yMin) / (yMax - yMin) * hT;
    let a = vessel.textureSeed >>> 0;
    const rng = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    const polylines = [];
    // 缝线两端各内收 2%：口沿与圈足是器型收束处，留在端点上会从轮廓外穿出去（"笼子"感）。
    const yLo = yMin + (yMax - yMin) * .02, yHi = yMax - (yMax - yMin) * .02;
    for (let k = 0; k < count; k++) {
      const theta = k * Math.PI * 2 / count + rng() * .6;
      const pts = [];
      for (let j = 0; j < 18; j++) {
        const y = yLo + (yHi - yLo) * (j / 17);
        const angle = theta + Math.sin(j * 1.6 + k) * .12;
        const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
        const from = dir.clone().multiplyScalar(maxR * 2.5 + 2);
        from.y = toWorldY(y);
        ray.set(from, dir.clone().negate());
        const hit = ray.intersectObject(target, true)[0];
        if (hit) {
          const n = hit.face
            ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
            : dir.clone().negate();
          pts.push({ point: hit.point.clone(), normal: n.normalize() });
        } else {
          const r = radiusAt(profile, y) * .97;   // 未命中时略收进轮廓内，保证缝线不浮在器身外
          pts.push({ point: dir.clone().multiplyScalar(r).setY(toWorldY(y)), normal: dir.clone() });
        }
      }
      polylines.push(pts);
    }
    return { polylines, count };
  }
  function curveMesh(pts, radius, mat, segments = 50) {
    return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => p.point)), segments, radius, 5, false), mat);
  }
  function mount(group, target) {
    scene.add(group);
    try { target.attach(group); } catch { /* attach 失败则留在场景根，仍可见 */ }
    anchor = group;
  }

  // —— 两种修复结果的"形态差异"（用户明确要求：不能只差颜色）——
  // 隐痕修复：补釉带内嵌（沿表面法线 -0.006），与釉面齐平，轮廓保持不变，是一道愈合的痕；
  // 金线表达：金线外凸（+0.014）并在缝上留 7 颗金铆点，轮廓上能看见凸起的脊——形态可辨。
  // 参数集中在此：改形态只改这张表，预览（抉择屏悬停）与证书收尾共用同一套几何。
  const SEAM_STYLE = {
    traditional: { radius: .012, offset: -.006, color: 0xe9e3d6, opacity: .82, beads: 0 },
    kintsugi: { radius: .0085, offset: .014, color: 0xd8b262, opacity: .96, beads: 7 }
  };
  function buildStyledSeams(target, vessel, mode) {
    const spec = SEAM_STYLE[mode];
    if (!spec || !target || !vessel) return null;
    const { polylines } = buildSeamPolylines(target, vessel);
    const group = new THREE.Group();
    group.name = `seams-${mode}`;
    const mat = new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: spec.opacity, depthWrite: false });
    const shifted = [];
    for (const line of polylines) {
      const pts = line.map(p => p.point.clone().addScaledVector(p.normal, spec.offset));
      shifted.push({ pts, normals: line.map(p => p.normal) });
      const curve = new THREE.CatmullRomCurve3(pts);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, spec.radius, 6, false), mat));
    }
    if (spec.beads && shifted.length) {
      const beadMat = new THREE.MeshStandardMaterial({ color: spec.color, metalness: .85, roughness: .3 });
      const step = shifted.length / spec.beads;
      for (let i = 0; i < spec.beads; i++) {
        const lane = shifted[Math.floor(i * step) % shifted.length];
        const t = .12 + (i * .37 % .76);                    // 0.12~0.88，逐颗错落
        const idx = Math.min(lane.pts.length - 1, Math.round(t * (lane.pts.length - 1)));
        const bead = new THREE.Mesh(new THREE.SphereGeometry(spec.radius * 3.1, 12, 10), beadMat);
        bead.position.copy(lane.pts[idx]).addScaledVector(lane.normals[idx], spec.radius * .6);
        group.add(bead);
      }
    }
    group.userData.material = mat;
    return group;
  }
  // 抉择屏悬停预览：即时呈现该修复方式的缝形态（无动画），与证书收尾同一套几何。
  let staticGroup = null;
  function style(nextMode, opts = {}) {
    if (staticGroup) { staticGroup.parent?.remove(staticGroup); disposeGroup(staticGroup); staticGroup = null; }
    if (!scene || !opts.target || !SEAM_STYLE[nextMode]) return false;
    const group = buildStyledSeams(opts.target, opts.vessel, nextMode);
    if (!group) return false;
    mount(group, opts.target);
    staticGroup = group;
    return true;
  }

  // ① 隐痕修复：补釉带先亮起柔和白瓷光（0→.85、色 → 0xf5f2ea，1.2s），
  //    随后弥合为常驻的半透明浅色细带（.36），釉面闪一次温润高光。
  //    缝带内嵌于釉面（SEAM_STYLE.offset 为负），轮廓与模型一致、没有凸起。
  function runTraditional({ target, vessel }) {
    const group = buildStyledSeams(target, vessel, 'traditional');
    if (!group) return;
    const mat = group.userData.material;
    mat.opacity = low ? .36 : 0;
    mount(group, target);
    if (low) return;
    track(gsap.to(mat, { opacity: .85, duration: 1.2, ease: 'power2.out' }));
    track(gsap.to(mat.color, { r: .96, g: .95, b: .92, duration: 1.2, ease: 'power2.out' })); // → 0xf5f2ea
    wait(() => track(gsap.to(mat, { opacity: .36, duration: .4, ease: 'power2.in' })), 1200);
    glowPulse(collectGlazeMats(target), 0xfff2dd, .18, 300, 800, .9); // 釉面温润高光（emissive 峰值 .18）
  }

  // ② 金线表达：外凸金线 + 金铆点，先由 hologram 的终章在拼合屏播完，
  //    证书屏没有全息系统，这里以静态形态呈现（与拼合屏同一几何口径），
  //    不改变器身本身颜色——修复后的瓷面始终是模型原貌。
  function runKintsugi({ target, vessel }) {
    const group = buildStyledSeams(target, vessel, 'kintsugi');
    if (!group) return false;
    mount(group, target);
    if (!low) glowPulse(collectGlazeMats(target), 0xfff2dd, .12, 260, 700, .2);
    return true;
  }

  // ③ 锔瓷体验：裂缝转深墨常驻，沿裂缝折线布 5~8 颗工字形铜锔钉，逐颗旋转落定回弹
  //    （0.35s/颗 + audio.tick），钉完补一次钉眼磨平微闪。
  function runJuci({ target, vessel, audio }) {
    const { polylines, count } = buildSeamPolylines(target, vessel);
    const group = new THREE.Group();
    const inkMat = new THREE.MeshBasicMaterial({ color: 0x3a3226, transparent: true, opacity: .9, depthWrite: false });
    const stapleMat = new THREE.MeshStandardMaterial({ color: 0xc89b5a, metalness: .9, roughness: .35 });
    for (const pts of polylines) group.add(curveMesh(pts, .008, inkMat)); // 深墨缝常驻
    // 每件 5~8 颗：均匀分配到各条裂缝，弧长位置按确定序列错开（避开两端断口）
    const n = Math.min(8, Math.max(5, count));
    const step = count / n;
    const UP = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const pts = polylines[Math.floor(i * step) % count];
      const wpts = pts.map(p => p.point);
      const segs = [];
      let total = 0;
      for (let j = 0; j < wpts.length - 1; j++) { const d = wpts[j].distanceTo(wpts[j + 1]); segs.push(d); total += d; }
      const frac = ((i * .61 + .3) % .84) + .08; // 0.08~0.92，逐颗错落
      const dist = total * frac;
      let acc = 0, pos = wpts[0].clone(), tan = wpts[1].clone().sub(wpts[0]).normalize();
      for (let j = 0; j < segs.length; j++) {
        if (acc + segs[j] >= dist) {
          const t = (dist - acc) / Math.max(1e-6, segs[j]);
          pos = wpts[j].clone().lerp(wpts[j + 1], t);
          tan = wpts[j + 1].clone().sub(wpts[j]).normalize();
          break;
        }
        acc += segs[j];
      }
      const normal = pts.reduce((best, p) => pos.distanceToSquared(p.point) < best.d ? { d: pos.distanceToSquared(p.point), n: p.normal } : best, { d: 1e9, n: pts[0].normal }).n.clone();
      const T = tan.clone().projectOnPlane(normal).normalize();
      const staple = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .05, 20), stapleMat); // 扁圆柱钉身
      disc.quaternion.setFromUnitVectors(UP, normal);
      staple.add(disc);
      for (const s of [-1, 1]) { // 两端小耳 → "工"字形
        const ear = new THREE.Mesh(new THREE.CylinderGeometry(.028, .028, .055, 10), stapleMat);
        ear.position.copy(T).multiplyScalar(.105 * s);
        ear.quaternion.copy(disc.quaternion);
        staple.add(ear);
      }
      staple.position.copy(pos).addScaledVector(normal, .012);
      staple.scale.setScalar(low ? 1 : 0);
      group.add(staple);
      if (!low) {
        wait(() => {
          audio?.tick?.(); // 短促金属声
          track(gsap.fromTo(staple.rotation, { y: .9 }, { y: 0, duration: .35, ease: 'power3.out' })); // 旋转落定
          track(gsap.to(staple.scale, { x: 1, y: 1, z: 1, duration: .35, ease: 'back.out(2.2)' }));   // 轻微回弹
        }, i * 350);
      }
    }
    mount(group, target);
    if (low) return; // 低画质：锔钉一次性铺好，无动画、无音效
    glowPulse([stapleMat], 0xffe9c0, .55, 250, 250, n * .35 + .3); // 钉眼磨平微闪
  }

  // ④ 现状保存：不做任何修饰——暖黄微尘自器身四周缓慢沉降 1.5s 淡出（低画质 4 粒静态），
  //    画面边缘叠一层低不透明度暖色渐晕（DOM，导出时隐藏）。
  function runPreserve({ target, stage }) {
    target.updateWorldMatrix(true, false);
    const bb = new THREE.Box3().setFromObject(target);
    const n = low ? 4 : 14;
    const geo = new THREE.BufferGeometry();
    const pos0 = new Float32Array(n * 3), fall = new Float32Array(n);
    const rx = Math.max(.5, (bb.max.x - bb.min.x) / 2), h = Math.max(1e-4, bb.max.y - bb.min.y);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, r = rx * (1.15 + Math.random() * .6);
      pos0[i * 3] = Math.cos(ang) * r;
      pos0[i * 3 + 1] = bb.min.y + h * (.3 + Math.random() * .75);
      pos0[i * 3 + 2] = Math.sin(ang) * r;
      fall[i] = h * (.14 + Math.random() * .12); // 缓慢沉降行程
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos0.slice(), 3));
    const mat = new THREE.PointsMaterial({
      color: GOLD_DUST, size: .05, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    dust = new THREE.Points(geo, mat);
    dust.renderOrder = 6;
    dust.frustumCulled = false;
    scene.add(dust);
    if (low) {
      mat.opacity = .5; // 低画质：仅 4 粒微尘静态浮现
    } else {
      const proxy = { t: 0 };
      track(gsap.to(proxy, {
        t: 1, duration: 1.5, ease: 'sine.inOut',
        onUpdate() {
          const arr = geo.attributes.position.array;
          for (let i = 0; i < n; i++) arr[i * 3 + 1] = pos0[i * 3 + 1] - fall[i] * proxy.t;
          geo.attributes.position.needsUpdate = true;
          mat.opacity = Math.sin(Math.PI * proxy.t) * .8;
        },
        onComplete() { removeDust(); },
      }));
    }
    if (stage && typeof document !== 'undefined' && !vignette) {
      vignette = document.createElement('div');
      vignette.className = 'fx-vignette';
      stage.append(vignette);
      gsap.fromTo(vignette, { opacity: 0 }, { opacity: 1, duration: reduce ? 0 : 1.2, ease: 'sine.out' });
    }
  }

  function run(nextMode, opts = {}) {
    clear();
    if (!scene || !opts.target) return false;
    mode = nextMode;
    if (nextMode === 'kintsugi') return runKintsugi(opts);
    if (nextMode === 'traditional') runTraditional(opts);
    else if (nextMode === 'juci') runJuci(opts);
    else if (nextMode === 'preserve') runPreserve(opts);
    else { mode = null; return false; }
    return true;
  }

  // 证书小像 / PNG 导出：只隐藏瞬态痕迹（微尘 / 渐晕），保留修复缝本身的形态——
  // 「隐痕」的内嵌补釉带与「金线」的外凸金线+金铆点是修复结果的一部分，
  // 若一并隐藏，两种方式的小像会长得一模一样，用户就看不出形态差异了。
  function hide() {
    if (dust) dust.visible = false;
    if (vignette) vignette.style.display = 'none';
  }
  function show() {
    if (dust) dust.visible = true;
    if (vignette) vignette.style.display = '';
  }

  // 幂等清理：结束 tween/timer、移除动画组、还原被微闪改动过的材质
  function clear() {
    killAll();
    if (staticGroup) { staticGroup.parent?.remove(staticGroup); disposeGroup(staticGroup); staticGroup = null; }
    if (anchor) { anchor.parent?.remove(anchor); disposeGroup(anchor); anchor = null; }
    removeDust();
    if (vignette) { vignette.remove(); vignette = null; }
    for (const [m, base] of emissiveBase) {
      if (m.emissive?.copy) m.emissive.copy(base.emissive);
      if ('emissiveIntensity' in m) m.emissiveIntensity = base.emissiveIntensity;
    }
    emissiveBase.clear();
    mode = null;
  }

  return {
    run, style, hide, show, clear,
    get active() { return !!mode; },
    get mode() { return mode; },
    get anchor() { return anchor; },
    get dust() { return dust; },
    get vignette() { return vignette; },
  };
}
