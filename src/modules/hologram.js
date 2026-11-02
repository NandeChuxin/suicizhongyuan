import * as THREE from 'three';
import { vesselProfile } from './vessels3d.js';
import { P3D } from './puzzle3d.js';

// 全息修复视觉系统（悬浮式 · 参照关键帧方案A / 15s 参考视频）：
// 空间关系：拼合操作面抬升 lift（≈一个瓶高），全息完整瓶悬浮在碎片散落平面上方；
//   实物碎片留在散落平面，每片未锁定碎片常驻一道细青牵引光束指向瓶身对应位置。
// A. 悬浮全息瓶身：wireframe 线框内壳（aCover 掩码）+ fresnel 光面外壳（扫描带/扫描纹/抖动）
//    + 口沿提亮环 + 底部投影锥（散落平面上的投影光圈 → 悬浮瓶底）。
// B. 牵引光束：碎片 → correctPosition 的常驻 THREE.Line；选中增亮成双线辉光；锁定 0.3s 淡出。
//    落点 ghost（共享碎片 geometry）悬浮在瓶身对应位置，呼吸闪烁、拖近增亮。
// C. 粒子氛围：微尘上半空间围绕全息瓶为主 + 散落平面薄层；锁定爆发沿"碎片→全息"方向上抛。
// D. 金缮终章：全部拼完 → 裂缝透金(1.5s) → 金纹沿缝生长蔓延(1.6s，壳体同步退场)
//    → 成品回落拼合面(2s，correctPosition 同步回落) → settled 回调。
// 约束：不引外部贴图、不联网；低画质降级为 MeshBasicMaterial，微尘 40 颗、关闭爆发。

export const HOLO_COLOR = 0x7fd4e8;
export const HOLO_GOLD = 0xd6a94a;
const SCAN_PERIOD = 3.2;   // 扫描光带周期（s）
const BAND_RATIO = .08;    // 光带宽度 ≈ 瓶高 8%
const BREATH_PERIOD = 1.2; // ghost 呼吸周期（s）
const JITTER = .002;       // 每帧垂直抖动幅度（±）
const BASE_OPACITY = .16;  // fresnel 光面壳基础不透明度
const WIRE_OPACITY = .22;  // 线框壳不透明度
const KINTSUGI_T = { crack: 1.5, spread: 1.6, descend: 2.0 }; // 金缮三阶段时长（s）

const holoBlend = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide };

function basicHoloMaterial(opacity, extra = {}) {
  return new THREE.MeshBasicMaterial({ color: HOLO_COLOR, opacity, ...holoBlend, ...extra });
}

// 顶点归属：把每片碎片的几何顶点投到 (θ, y) 占据网格，再为壳体每个顶点查出所属碎片。
// 返回 Map<fragmentIndex, 顶点号数组>，锁定时把对应顶点的 aCover 置 1（该区域被实体瓷片填补）。
function buildCoverIndex(shellGeo, fragments, minY, height) {
  const TH = 180, YB = 56, TWO_PI = Math.PI * 2;
  const grid = new Int16Array(TH * YB).fill(-1);
  const binOf = (x, y, z) => {
    let th = Math.atan2(x, z);
    if (th < 0) th += TWO_PI;
    const tb = Math.min(TH - 1, Math.floor(th / TWO_PI * TH));
    const yb = Math.min(YB - 1, Math.max(0, Math.floor((y - minY) / height * YB)));
    return yb * TH + tb;
  };
  for (const f of fragments) {
    const pos = f.mesh?.geometry?.attributes?.position;
    if (!pos) continue;
    for (let i = 0; i < pos.count; i++) grid[binOf(pos.getX(i), pos.getY(i), pos.getZ(i))] = f.index;
  }
  const map = new Map();
  const pos = shellGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const idx = grid[binOf(pos.getX(i), pos.getY(i), pos.getZ(i))];
    if (idx >= 0) {
      if (!map.has(idx)) map.set(idx, []);
      map.get(idx).push(i);
    }
  }
  return map;
}

export function createHologramSystem(scene, { vessel, fragments = [], low = false, benchRadius = 3, visible = true, lift = 0, baseGap = 0 } = {}) {
  if (!scene || !vessel?.outline || typeof THREE.LatheGeometry !== 'function') return null;

  const profile = vesselProfile(vessel.outline);
  const minY = profile[0].y, maxY = profile[profile.length - 1].y;
  const height = Math.max(1e-4, maxY - minY);
  const centerY = (minY + maxY) / 2;                 // 器心（碎片几何口径，兜底用）
  // 拼合器心：单值真源是碎片的 correctPosition（含落位基准与全息抬升），
  // 无碎片时退回 centerY + lift 旧口径。
  const asmY = fragments[0]?.correctPosition?.y ?? (centerY + lift);
  const wBottom = asmY + minY, wTop = asmY + maxY;   // 悬浮瓶身世界 y 范围

  let lowMode = !!low;
  const group = new THREE.Group();
  group.name = 'hologram-group';
  group.visible = !!visible;
  scene.add(group);

  // —— A. 悬浮全息瓶身：线框内壳 + fresnel 光面外壳（同 profile，共享 aCover 掩码） ——
  const segs = lowMode ? 48 : 80;
  const shellGeo = new THREE.LatheGeometry(profile, segs);
  const wireGeo = new THREE.LatheGeometry(profile, segs);
  const coverAttr = new THREE.Float32BufferAttribute(new Float32Array(shellGeo.attributes.position.count), 1);
  shellGeo.setAttribute('aCover', coverAttr);
  wireGeo.setAttribute('aCover', coverAttr);
  const coverVerts = buildCoverIndex(shellGeo, fragments, minY, height);

  const shellUniforms = {
    uTime: { value: 0 },
    uJitter: { value: 0 },
    uColor: { value: new THREE.Color(HOLO_COLOR) },
    uOpacity: { value: BASE_OPACITY },
    uWTop: { value: wTop },
    uWBottom: { value: wBottom },
    uBandH: { value: height * BAND_RATIO },
  };
  const wireUniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(HOLO_COLOR) },
    uOpacity: { value: WIRE_OPACITY },
  };
  let shellMat = lowMode ? basicHoloMaterial(BASE_OPACITY) : new THREE.ShaderMaterial({
    uniforms: shellUniforms,
    ...holoBlend,
    vertexShader: /* glsl */`
      attribute float aCover;
      uniform float uJitter;
      varying vec3 vN;
      varying vec3 vW;
      varying float vCover;
      void main() {
        vCover = aCover;
        vec3 p = position;
        p.y += uJitter; // 每帧 ±0.002 垂直抖动（全息投影质感）
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uWTop;
      uniform float uWBottom;
      uniform float uBandH;
      varying vec3 vN;
      varying vec3 vW;
      varying float vCover;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float ndv = abs(dot(normalize(vN), V));       // DoubleSide：取绝对值
        float fres = pow(1.0 - ndv, 2.2);             // 边缘冷青光
        float t = fract(uTime / ${SCAN_PERIOD.toFixed(1)});
        float scanY = uWTop - (uWTop - uWBottom) * t; // 口沿匀速扫到底部再循环
        float band = 1.0 - smoothstep(0.0, uBandH, abs(vW.y - scanY));
        float sl = .06 * step(.5, fract(vW.y * 40.0)); // 极淡横向扫描纹
        float a = (uOpacity + fres * .55 + band * .25 + sl) * (1.0 - vCover);
        vec3 col = mix(uColor, vec3(1.0), band * .65); // 光带内偏白
        gl_FragColor = vec4(col, a);
      }`,
  });
  let wireMat = lowMode
    ? basicHoloMaterial(WIRE_OPACITY, { wireframe: true })
    : new THREE.ShaderMaterial({
      uniforms: wireUniforms,
      ...holoBlend,
      wireframe: true,
      vertexShader: /* glsl */`
        attribute float aCover;
        varying float vCover;
        void main() {
          vCover = aCover;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        varying float vCover;
        void main() {
          // 车削环纹 + 纵向经线的线框感，轻微闪烁
          float flicker = .88 + .12 * sin(uTime * 2.3);
          gl_FragColor = vec4(uColor, uOpacity * flicker * (1.0 - vCover));
        }`,
    });

  const shell = new THREE.Mesh(shellGeo, shellMat);       // fresnel 光面壳（保留 uOpacity 口径）
  shell.position.set(0, asmY, 0);
  shell.scale.setScalar(1.02);
  shell.renderOrder = 2;
  group.add(shell);
  const wireShell = new THREE.Mesh(wireGeo, wireMat);     // 线框内壳
  wireShell.position.set(0, asmY, 0);
  wireShell.renderOrder = 2;
  group.add(wireShell);

  // —— A3. 口沿提亮环（参考图里最亮的一圈） ——
  const rimR = Math.max(0, ...profile.slice(-8).map(p => Math.abs(p.x)));
  let rim = null;
  if (rimR > .05) {
    rim = new THREE.Mesh(
      new THREE.TorusGeometry(rimR, .018, 8, 64),
      basicHoloMaterial(.85, { color: 0x9fe8ff, side: THREE.FrontSide })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = wTop;
    rim.renderOrder = 3;
    group.add(rim);
  }

  // —— A4. 底部投影锥：散落平面上的投影光圈 → 悬浮瓶底（顶点亮、底部暗的渐变） ——
  // baseGap：成品底面与散落平面之间的净空（P3D.benchClearance）。投影锥要一路落到散落平面，
  // 否则锥体悬在半空、与平面之间露出一段空隙。lift 仍只表示"悬浮抬升量"（金缮回落口径），
  // 不参与这里的几何高度。
  // 收口口径（关键）：锥顶半径必须等于器底半径，锥体由散落平面向瓶底收拢。
  // 旧口径取"下半器身最宽半径×1.1"当锥顶，比器底宽出近一倍——那一圈横向翻边正好横在
  // 器身下段，看上去就像模型被横着剖开、切口是个圆盘截面，把下半截整个挡住。改动勿回退。
  let cone = null;
  const coneH = lift + Math.max(0, baseGap);
  if (lift > 0.01) {
    const topR = Math.max(.3, Math.abs(profile[0]?.x ?? .6) * 1.02);       // 锥顶 = 器底半径，紧贴瓶底不外扩
    const baseR = Math.min(3.4, Math.max(1.6, benchRadius * .62));        // 锥底 = 散落平面上的投影光圈
    const coneGeo = new THREE.CylinderGeometry(topR, baseR, coneH, 32, 1, true);
    const cpos = coneGeo.attributes.position;
    const ccol = new Float32Array(cpos.count * 3);
    for (let i = 0; i < cpos.count; i++) {
      const t = (cpos.getY(i) + coneH / 2) / coneH; // 0 底 → 1 顶
      const k = .22 + .78 * t;
      ccol[i * 3] = k; ccol[i * 3 + 1] = k; ccol[i * 3 + 2] = k;
    }
    coneGeo.setAttribute('color', new THREE.BufferAttribute(ccol, 3));
    cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
      color: HOLO_COLOR, vertexColors: true, transparent: true, opacity: .16,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    cone.position.y = wBottom - coneH / 2;
    cone.renderOrder = 1;
    group.add(cone);
  }

  // —— B. 牵引光束池：碎片 → 全息瓶身对应位置（常驻），选中增亮成双线 ——
  const beams = new Map(); // fragmentIndex -> { line, mat, line2, mat2, fade }
  function makeBeamLine() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: HOLO_COLOR, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(g, mat);
    line.visible = false;
    line.frustumCulled = false;
    line.renderOrder = 6;
    group.add(line);
    return { line, mat };
  }
  function ensureBeam(f) {
    let b = beams.get(f.index);
    if (!b) {
      b = { ...makeBeamLine(), line2: null, mat2: null, fade: -1 };
      beams.set(f.index, b);
    }
    return b;
  }
  function removeBeam(index) {
    const b = beams.get(index);
    if (!b) return;
    for (const l of [b.line, b.line2]) {
      if (!l) continue;
      group.remove(l);
      l.geometry.dispose();
      l.material.dispose();
    }
    beams.delete(index);
  }

  // —— B2. 落点预览 ghost（共享碎片 geometry，不复制显存） ——
  const ghostMat = basicHoloMaterial(.28);
  let ghostMesh = null, ghostFrag = null, breathT = Math.random() * BREATH_PERIOD;
  function setSelected(f) {
    if (ghostFrag === f) return;
    if (ghostMesh) { group.remove(ghostMesh); ghostMesh = null; }
    ghostFrag = f && !f.locked ? f : null;
    if (ghostFrag) {
      ghostMesh = new THREE.Mesh(ghostFrag.mesh.geometry, ghostMat);
      ghostMesh.position.copy(ghostFrag.correctPosition);       // 位置锁死（悬浮瓶身处）
      ghostMesh.quaternion.copy(ghostFrag.correctQuaternion);   // 姿态锁死
      ghostMesh.renderOrder = 5;
      group.add(ghostMesh);
    }
  }

  // —— E. 用户 GLB 接入（A1/A2）：修复对象的视觉呈现升级为真实模型 ——
  // A1 线框全息版：EdgesGeometry 经线 + 半透明叠层壳，与程序化 Lathe 壳互斥
  //     （GLB 就绪 → 换 GLB 线框版；未就绪/失败/低画质 → 沿用程序化壳）；
  // A2 拼合完成态：纹理版 GLB 挂入 kGroup，金缮启动时亮相，金线（kLines）随其展示与回落。
  // 红线：GLB 只做视觉，拾取/吸附/aCover 判定全部仍走程序化碎片坐标。
  let modelKit = null; // { holo, root, mats[], edges[], progressK }
  let fragFade = 0;    // 终章碎片淡出进度 0→1（仅 GLB 接管时启用）
  function applyKitFade(k) {
    if (!modelKit) return;
    for (const m of modelKit.mats) m.opacity = Math.max(0, m.userData.baseO * k);
  }
  function kitFadeK() {
    if (!modelKit) return;
    applyKitFade(modelKit.progressK * (fadeOut >= 0 ? Math.max(0, 1 - fadeOut) : 1));
  }
  function disposeModelKit() {
    if (!modelKit) return;
    group.remove(modelKit.holo);
    modelKit.root.parent?.remove(modelKit.root);
    for (const eg of modelKit.edges) eg.dispose();
    for (const m of modelKit.mats) m.dispose();
    modelKit = null;
    // 若终章已让程序化碎片淡出（GLB 成品接管后降档等边缘序），恢复碎片可显状态，
    // 可见性交回 show()（view==='puzzle'）统一口径。
    if (fragFade >= 1) {
      for (const f of fragments) {
        const m = f.mesh?.material;
        if (m) { m.opacity = 1; m.transparent = false; }
        if (f.mesh) f.mesh.visible = true;
      }
      fragFade = 0;
    }
  }
  function setModel(root) {
    if (!root || lowMode || modelKit?.root === root) return; // 低画质：GLB 全息壳直接隐藏，沿用程序化壳
    disposeModelKit();
    root.updateMatrixWorld(true);
    const kit = { holo: new THREE.Group(), root, mats: [], edges: [], progressK: 1 };
    kit.holo.name = 'holo-glb';
    kit.holo.position.y = asmY + centerY; // 与程序化壳同高同朝向（碎片同坐标系）
    root.traverse(node => {
      if (!node.isMesh || !node.geometry) return;
      const edges = new THREE.EdgesGeometry(node.geometry, 30);
      const lm = new THREE.LineBasicMaterial({
        color: HOLO_COLOR, transparent: true, opacity: WIRE_OPACITY * 1.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      lm.userData.baseO = WIRE_OPACITY * 1.5;
      const line = new THREE.LineSegments(edges, lm);
      node.getWorldQuaternion(line.quaternion);
      node.getWorldPosition(line.position);
      node.getWorldScale(line.scale);
      line.renderOrder = 2;
      kit.holo.add(line);
      kit.edges.push(edges); kit.mats.push(lm);
      const sm = new THREE.MeshBasicMaterial({
        color: HOLO_COLOR, transparent: true, opacity: BASE_OPACITY * .45,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      sm.userData.baseO = BASE_OPACITY * .45;
      const sh = new THREE.Mesh(node.geometry, sm); // 共享 GLB geometry，不复制显存
      sh.quaternion.copy(line.quaternion);
      sh.position.copy(line.position);
      sh.scale.copy(line.scale).multiplyScalar(1.01);
      sh.renderOrder = 2;
      kit.holo.add(sh);
      kit.mats.push(sm);
    });
    group.add(kit.holo);
    // 纹理版作为拼合完成态成品：挂入 kGroup，随金缮三阶段一同展示与回落拼合面。
    // 落位不能直接覆盖 root.position——immersive 的 fitToHeight 是靠改 root.position 把内容
    // 居中的（GLB 子节点自带偏移，内容在 root 局部坐标里未必以 0 为中心），绝对覆盖会抹掉
    // 居中偏移，成品被整体抬高半个器身（终章动画里与金线/碎片错位）。改为把「内容包围盒
    // 中心」钉到拼合器心（asmY+centerY），对已居中的内容等价于旧口径，对未居中的也正确。
    root.updateMatrixWorld(true);
    const kitBox = new THREE.Box3().setFromObject(root);
    if (!kitBox.isEmpty()) {
      const kc = kitBox.getCenter(new THREE.Vector3());
      root.position.x += 0 - kc.x;
      root.position.z += 0 - kc.z;
      root.position.y += (asmY + centerY) - kc.y;
    } else {
      root.position.set(0, asmY + centerY, 0);
    }
    root.visible = kPhase >= 0; // 终章已启动（GLB 晚到）→ 成品立即亮相
    kGroup.add(root);
    shell.visible = false;      // 与程序化壳互斥（对象保留，API/测试口径不变）
    wireShell.visible = false;
    modelKit = kit;
  }

  // —— C. 环境微尘：上半空间围绕全息瓶为主 + 散落平面薄层 ——
  const DUST_COUNT = lowMode ? 40 : 120;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST_COUNT * 3);
  const dustCol = new Float32Array(DUST_COUNT * 3);
  const dustMeta = [];
  const baseHolo = new THREE.Color(HOLO_COLOR);
  for (let i = 0; i < DUST_COUNT; i++) {
    const inHoloZone = i < DUST_COUNT * .7; // 70% 围绕悬浮瓶，30% 散落平面薄层
    const cr = Math.random() < .8 ? 1 : 1.15; // 少量偏白
    const yLo = inHoloZone ? wBottom - .3 : -.3;
    const yHi = inHoloZone ? wTop + .8 : 1.0;
    dustMeta.push({
      ang: Math.random() * Math.PI * 2,
      r: inHoloZone ? .45 + Math.random() * Math.max(.6, benchRadius * .85) : .8 + Math.random() * Math.max(.5, benchRadius * .6),
      y: yLo + Math.random() * (yHi - yLo),
      angV: .05 + Math.random() * .16,
      riseV: .02 + Math.random() * .07,
      phase: Math.random() * Math.PI * 2,
      bottom: yLo, top: yHi,
      cr: baseHolo.r * cr, cg: baseHolo.g * cr, cb: baseHolo.b * cr,
    });
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dustMat = new THREE.PointsMaterial({
    size: .015, vertexColors: true, transparent: true, opacity: .5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.renderOrder = 3;
  dust.frustumCulled = false;
  group.add(dust);

  // —— C2. 锁定爆发粒子：从碎片位置沿"碎片→全息"方向上抛，1s 淡出 ——
  const bursts = [];
  function burst(src, dst) {
    if (lowMode) return; // 低画质：关闭拼合爆发
    const n = 20 + Math.floor(Math.random() * 11); // 20~30
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = [];
    const gold = new THREE.Color(HOLO_GOLD);
    const dir = dst ? new THREE.Vector3().subVectors(dst, src) : new THREE.Vector3(0, 1, 0);
    if (dir.lengthSq() > 1e-6) dir.normalize(); else dir.set(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = .3 + Math.random() * .5;
      vel.push(new THREE.Vector3(
        dir.x * sp + (Math.random() - .5) * .5,
        dir.y * sp + (Math.random() - .3) * .5 + .15,
        dir.z * sp + (Math.random() - .5) * .5
      ));
      pos.set([src.x, src.y, src.z], i * 3);
      const c = Math.random() < .55 ? baseHolo : gold;
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: .045, vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(g, m);
    pts.renderOrder = 7;
    pts.frustumCulled = false;
    group.add(pts);
    bursts.push({ pts, vel, life: 1 });
  }

  // —— D. 金缮终章：裂缝透金 → 金纹蔓延 → 成品回落拼合面 ——
  const kGroup = new THREE.Group();
  kGroup.visible = false;
  const kMat = new THREE.LineBasicMaterial({ color: HOLO_GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  group.add(kGroup);
  let kLines = [], kPhase = -1, kT = 0, kAfterT = 0;
  let kMode = 'kintsugi'; // 完成收尾分发：kintsugi 走金缮全流程；其余方式跳过透金（静默退场→成品回落），专属动画由 immersive 接管
  let ring = null; // 金缮增强：瓶口金粒聚拢成环（仅高画质 kintsugi）
  const settledCbs = [];
  function startKintsugi() {
    if (kPhase >= 0) return;
    const echo = kMode && kMode !== 'kintsugi'; // 非金线方式：不播透金/蔓延，直接静默退场
    // 金色裂缝线只画"真正的缝"：取自碎片几何断口折线（f.seams，与拼合网同一份数据），
    // 不再用 EdgesGeometry 整片描边——那会把碎片内部所有棱都点亮，成品远看像整只鎏金。
    kLines = [];
    for (const f of fragments) {
      if (!Array.isArray(f.seams)) continue;
      for (const s of f.seams) {
        if (s.other < f.index) continue;              // 同一条缝两侧都注册过，只画一次
        if (!Array.isArray(s.pts) || s.pts.length < 6) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(s.pts, 3));
        const line = new THREE.Line(g, kMat);
        line.position.copy(f.correctPosition);
        if (f.correctQuaternion) line.quaternion.copy(f.correctQuaternion);
        line.renderOrder = 8;
        line.frustumCulled = false;
        line.visible = !echo; // 四方式互不复用：非金线方式金线全程不亮
        kGroup.add(line);
        kLines.push({ line, total: s.pts.length / 3, own: true });
      }
    }
    // 兜底（旧数据/2D 片没有 seams）：只沿每片轮廓画一圈，不做整面描边
    if (!kLines.length) {
      for (const f of fragments) {
        if (!f.mesh?.geometry) continue;
        const eg = new THREE.EdgesGeometry(f.mesh.geometry, 60);
        const line = new THREE.LineSegments(eg, kMat);
        line.position.copy(f.correctPosition);
        if (f.correctQuaternion) line.quaternion.copy(f.correctQuaternion);
        line.renderOrder = 8;
        line.frustumCulled = false;
        line.visible = !echo;
        kGroup.add(line);
        kLines.push({ line, total: eg.attributes.position.count, own: true });
      }
    }
    kGroup.visible = true;
    kMat.opacity = 0;
    kPhase = echo ? 10 : 0; kT = 0;
    // 终章启动 = 成品亮相：setModel 早到时 root 一直藏着（等这一刻），这里统一点亮，
    // 碎片淡出才有"被成品替换"的对象，否则会淡成一只透明空壳。
    if (modelKit?.root) modelKit.root.visible = true;
    fadeOut = 0; // 壳体同步退场
  }

  // —— 金缮增强（仅金线方式 · 高画质）：金纹生长完成后，20~30 粒金色微粒沿瓶身最高一圈环向聚拢成环后消散 ——
  function spawnRing() {
    if (lowMode || ring) return;
    const topR = Math.max(.05, profile[profile.length - 1]?.x ?? rimR);
    const n = 26;
    const geo = new THREE.BufferGeometry();
    const start = new Float32Array(n * 3), target = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const ang = i / n * Math.PI * 2;
      const r0 = topR * (1.6 + (i % 5) * .22), y0 = wTop + .3 + (i % 7) * .18;
      start[i * 3] = Math.cos(ang * 3.1) * r0;
      start[i * 3 + 1] = y0;
      start[i * 3 + 2] = Math.sin(ang * 3.1) * r0;
      target[i * 3] = Math.cos(ang) * (topR + .02);
      target[i * 3 + 1] = wTop;
      target[i * 3 + 2] = Math.sin(ang) * (topR + .02);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(start.slice(), 3));
    const mat = new THREE.PointsMaterial({
      color: HOLO_GOLD, size: .055, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = 9;
    pts.frustumCulled = false;
    kGroup.add(pts);
    ring = { pts, geo, mat, start, target, n, t: 0 };
  }
  function clearRing() {
    if (!ring) return;
    kGroup.remove(ring.pts);
    ring.geo.dispose();
    ring.mat.dispose();
    ring = null;
  }

  // —— 锁定：对应区域被实体填补（aCover 置 1）+ 定向爆发 + 完成判定 ——
  let fadeOut = -1; // <0 未触发；>=0 淡出进度 0→1
  function markLocked(f, { silent = false } = {}) {
    if (!f) return;
    if (lowMode) {
      // 低画质无逐顶点掩码：按拼合进度整体压低
      const done = fragments.filter(x => x.locked).length;
      shellMat.opacity = BASE_OPACITY * (1 - done / Math.max(1, fragments.length));
      wireMat.opacity = WIRE_OPACITY * (1 - done / Math.max(1, fragments.length));
    } else {
      const verts = coverVerts.get(f.index);
      if (verts) {
        for (const vi of verts) coverAttr.array[vi] = 1;
        coverAttr.needsUpdate = true;
      }
      if (modelKit) {
        // GLB 全息壳：按拼合进度整体压低（对应区域被实体碎片逐步填补）
        modelKit.progressK = 1 - fragments.filter(x => x.locked).length / Math.max(1, fragments.length);
        kitFadeK();
      }
    }
    if (ghostFrag === f) setSelected(null);
    if (!silent) burst(f.mesh.position, f.correctPosition);
    if (fragments.length && fragments.every(x => x.locked) && kPhase < 0) startKintsugi();
  }

  // —— 每帧更新（dt 秒） ——
  let time = 0;
  function update(dt) {
    if (!group.visible || dt <= 0) return;
    time += dt;
    if (!lowMode) {
      shellUniforms.uTime.value = time;
      shellUniforms.uJitter.value = (Math.random() * 2 - 1) * JITTER;
      wireUniforms.uTime.value = time;
    }
    // 壳体整体淡出（金缮启动时触发）
    if (fadeOut >= 0) {
      fadeOut = Math.min(1, fadeOut + dt / 1.1);
      const k = 1 - fadeOut;
      if (lowMode) {
        shellMat.opacity = BASE_OPACITY * k;
        wireMat.opacity = WIRE_OPACITY * k;
      } else {
        shellUniforms.uOpacity.value = BASE_OPACITY * k;
        wireUniforms.uOpacity.value = WIRE_OPACITY * k;
      }
      if (rim) rim.material.opacity = .85 * k;
      if (cone) cone.material.opacity = .16 * k;
      dustMat.opacity = .5 * Math.min(1, k * 2.5);
      kitFadeK(); // GLB 全息壳随壳体同步退场
    }
    // ghost 呼吸 + 拖拽趋近增亮
    if (ghostMesh && ghostFrag && !ghostFrag.locked) {
      breathT += dt;
      const base = .18 + .22 * (.5 + .5 * Math.sin(Math.PI * 2 * breathT / BREATH_PERIOD));
      const dist = ghostFrag.mesh.position.distanceTo(ghostFrag.correctPosition);
      const prox = THREE.MathUtils.clamp(1 - dist / P3D.magnetDistance, 0, 1);
      ghostMat.opacity = base + (.5 - base) * prox * prox; // 越近越亮，最高 .5
    }
    // 牵引光束：常驻跟随；选中增亮双线；锁定 0.3s 淡出移除
    for (const f of fragments) {
      const b = beams.get(f.index);
      if (f.locked) {
        if (!b) continue;
        b.fade = b.fade < 0 ? 0 : b.fade + dt / .3;
        const k = Math.max(0, 1 - b.fade);
        b.mat.opacity = (b.baseO ?? .25) * k;   // 0.3s 淡出
        if (b.mat2) b.mat2.opacity = (b.baseO2 ?? .32) * k;
        if (b.fade >= 1) removeBeam(f.index);
        continue;
      }
      const beam = ensureBeam(f);
      const src = f.mesh.position, dst = f.correctPosition;
      const arr = beam.line.geometry.attributes.position.array;
      arr[0] = src.x; arr[1] = src.y; arr[2] = src.z;
      arr[3] = dst.x; arr[4] = dst.y + Math.sin(time * 2.1 + f.index) * .02; arr[5] = dst.z;
      beam.line.geometry.attributes.position.needsUpdate = true;
      beam.line.visible = true;
      const isSel = f === ghostFrag;
      const baseO = isSel ? (draggingFlag ? .6 : .4) : (ghostFrag ? .1 : .22 + .06 * Math.sin(time * 2 + f.index));
      beam.baseO = baseO;
      beam.mat.opacity = baseO;
      if (isSel && draggingFlag) {
        if (!beam.line2) {
          const l2 = makeBeamLine();
          beam.line2 = l2.line; beam.mat2 = l2.mat;
        }
        const a2 = beam.line2.geometry.attributes.position.array;
        a2[0] = src.x + .015; a2[1] = src.y; a2[2] = src.z;
        a2[3] = dst.x + .015; a2[4] = dst.y; a2[5] = dst.z;
        beam.line2.geometry.attributes.position.needsUpdate = true;
        beam.line2.visible = true;
        beam.baseO2 = .32;
        beam.mat2.opacity = .32;
      } else if (beam.line2) {
        beam.line2.visible = false;
      }
    }
    // 环境微尘：上升 + 绕瓶漂移 + 扫描光带联动提亮
    const scanT = ((time / SCAN_PERIOD) % 1 + 1) % 1;
    const scanY = wTop - (wTop - wBottom) * scanT;
    const band = height * BAND_RATIO;
    const pa = dustGeo.attributes.position.array, ca = dustGeo.attributes.color.array;
    for (let i = 0; i < DUST_COUNT; i++) {
      const m = dustMeta[i];
      m.ang += m.angV * dt;
      m.y += m.riseV * dt;
      if (m.y > m.top) m.y = m.bottom;
      const r = m.r * (1 + Math.sin(time * .5 + m.phase) * .06);
      pa[i * 3] = Math.cos(m.ang) * r;
      pa[i * 3 + 1] = m.y;
      pa[i * 3 + 2] = Math.sin(m.ang) * r;
      const near = Math.abs(m.y - scanY) < band * 1.4 ? 1.9 : 1; // 扫过处短暂提亮
      ca[i * 3] = m.cr * near; ca[i * 3 + 1] = m.cg * near; ca[i * 3 + 2] = m.cb * near;
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustGeo.attributes.color.needsUpdate = true;
    // 爆发粒子
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life -= dt;
      const a = b.pts.geometry.attributes.position;
      for (let j = 0; j < b.vel.length; j++) {
        const v = b.vel[j];
        v.y += .9 * dt; // 向上飘散
        v.multiplyScalar(Math.max(0, 1 - 1.4 * dt)); // 向外分量衰减
        a.array[j * 3] += v.x * dt; a.array[j * 3 + 1] += v.y * dt; a.array[j * 3 + 2] += v.z * dt;
      }
      a.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, b.life);
      if (b.life <= 0) {
        group.remove(b.pts);
        b.pts.geometry.dispose();
        b.pts.material.dispose();
        bursts.splice(i, 1);
      }
    }
    // A2 金缮终章：GLB 成品接管时程序化碎片 0.6s 淡出隐藏（金线随 GLB 展示；
    // 红线不变：碎片几何/吸附判定仍是程序化，仅呈现层切换）
    // 只在该 GLB 成品「真的在画面里」时才让程序化碎片退场：
    // 拼合屏里 immersive 会把共享的 GLB 模型隐藏（applyModelVisibility 对 puzzle 关掉模型），
    // 旧写法只看 modelKit 是否存在 → 碎片被淡出、成品又被隐藏，于是"修好的瓷器"变成一只透明空壳
    // （背景的波纹能从瓶身透过来，只有断面的露胎块还实心）。
    const glbShown = !!(modelKit?.root?.parent && modelKit.root.visible);
    // 只在「终章进行中（0~2）」让碎片退场：settle（3）之后必须回到实心釉面。
    // 拼合屏里共享的 GLB 会被 applyModelVisibility 隐藏，若终章后仍停在半透明，
    // 修好的瓷器就是一只透明空壳（背景波纹从瓶身透出、只剩断面露胎块是实心的）。
    const fadingNow = glbShown && kPhase >= 0 && kPhase < 3 && group.visible;
    if (fadingNow && fragFade < 1) {
      fragFade = Math.min(1, fragFade + dt / .6);
      const o = 1 - fragFade;
      for (const f of fragments) {
        const m = f.mesh?.material;
        if (m) { m.transparent = true; m.opacity = o; }
        if (fragFade >= 1 && f.mesh) f.mesh.visible = false;
      }
    } else if (!fadingNow && fragFade > 0) {
      // 反悔剂：GLB 不可见 / 已 settle / 整组离屏 → 碎片回到实心釉面，不停在半透明中间态。
      restoreFragments();
    }
    // 金缮增强：瓶口金粒 0.8s 环向聚拢后消散
    if (ring) {
      ring.t += dt / .8;
      const p = Math.min(1, ring.t), e = 1 - Math.pow(1 - p, 2);
      const arr = ring.geo.attributes.position.array;
      for (let i = 0; i < ring.n; i++) {
        arr[i * 3] = ring.start[i * 3] + (ring.target[i * 3] - ring.start[i * 3]) * e;
        arr[i * 3 + 1] = ring.start[i * 3 + 1] + (ring.target[i * 3 + 1] - ring.start[i * 3 + 1]) * e;
        arr[i * 3 + 2] = ring.start[i * 3 + 2] + (ring.target[i * 3 + 2] - ring.start[i * 3 + 2]) * e;
      }
      ring.geo.attributes.position.needsUpdate = true;
      ring.mat.opacity = Math.sin(Math.PI * p) * .95;
      if (p >= 1) { clearRing(); }
    }
    // 金缮三阶段
    if (kPhase === 0) { // 裂缝透金
      kT += dt / KINTSUGI_T.crack;
      kMat.opacity = Math.min(1, kT);
      if (kT >= 1) { kPhase = 1; kT = 0; }
    } else if (kPhase === 1) { // 金纹蔓延（setDrawRange 生长），壳体已同步淡出
      kT += dt / KINTSUGI_T.spread;
      const p = Math.min(1, kT);
      for (const k of kLines) k.line.geometry.setDrawRange(0, Math.floor(k.total * p / 2) * 2);
      if (p >= 1) { kPhase = 2; kT = 0; spawnRing(); } // 金纹生长完成 → 瓶口金粒聚拢成环（仅高画质）
    } else if (kPhase === 10) { // 非金线方式：静默等待全息壳退场（壳体淡出由 fadeOut 分支驱动），随后成品回落
      kT += dt / 1.1;
      if (kT >= 1) { kPhase = 2; kT = 0; }
    } else if (kPhase === 2) { // 成品缓缓回落拼合面（correctPosition 同步回落）
      kT += dt / KINTSUGI_T.descend;
      if (kMode === 'kintsugi' && !kLines.some(k => !k.line.visible)) {
        // 金线微光呼吸一次（.6→.9→.6，0.5s，回落拼合面前）；其它方式金线不可见不呼吸
        const abs = kT * KINTSUGI_T.descend;
        kMat.opacity = abs < .5 ? .6 + .3 * Math.sin(Math.PI * abs / .5) : 1;
      }
      const p = Math.min(1, kT);
      const e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      kGroup.position.y = -lift * e;
      for (const f of fragments) if (f.locked && f.mesh) f.mesh.position.y = f.correctPosition.y - lift * e;
      if (p >= 1) {
        kPhase = 3; kT = 0; kAfterT = 0;
        kGroup.position.y = -lift;
        for (const f of fragments) {
          if (f.locked && f.mesh) {
            f.correctPosition.y -= lift;
            f.mesh.position.y = f.correctPosition.y;
          }
        }
        const cbs = settledCbs.splice(0);
        for (const cb of cbs) { try { cb(); } catch { /* 回调异常不阻塞 */ } }
      }
    } else if (kPhase === 3) { // 金线余晖淡出
      kAfterT += dt / 1.2;
      if (!modelKit) {
        // 无 GLB 接管：金线照旧淡出（仅金线方式真的亮过；echo 方式金线全程不亮，opacity 保持 0）、kGroup 隐藏
        if (kMode === 'kintsugi') kMat.opacity = Math.max(0, 1 - kAfterT);
        if (kAfterT >= 1) kGroup.visible = false;
      }
      // GLB 成品接管：金线常留成品表面随展示，kGroup 不再隐藏
    }
  }

  let draggingFlag = false;
  function setDragging(v) { draggingFlag = !!v; }

  // 低画质降级：fresnel/线框 shader → MeshBasicMaterial；微尘降到 40 颗；关闭爆发。
  function currentShellOpacity() { return fadeOut >= 0 ? BASE_OPACITY * (1 - fadeOut) : BASE_OPACITY; }
  function degrade() {
    if (lowMode) return;
    lowMode = true;
    disposeModelKit();  // 退出 GLB 线框全息，回到程序化壳兜底
    shell.visible = true; wireShell.visible = true;
    shellGeo.dispose();
    shellMat.dispose();
    shellMat = basicHoloMaterial(currentShellOpacity());
    shell.geometry = new THREE.LatheGeometry(profile, 48); // 低模细分重建
    shell.material = shellMat;
    wireGeo.dispose();
    wireMat.dispose();
    wireMat = basicHoloMaterial(fadeOut >= 0 ? WIRE_OPACITY * (1 - fadeOut) : WIRE_OPACITY, { wireframe: true });
    wireShell.geometry = new THREE.LatheGeometry(profile, 48);
    wireShell.material = wireMat;
    dustGeo.setDrawRange(0, 40);
    clearRing(); // 金粒环属高画质增强，降级时移除
  }

  function setVisible(v) {
    group.visible = !!v;
    // 离开拼合屏（去长卷/抉择/证书）时把碎片恢复实心：这些屏里 GLB 才是主角，
    // 碎片若停在终章的半透明状态，回到拼合屏就会看到一只"玻璃壳"。
    if (!v) restoreFragments();
  }
  function restoreFragments() {
    if (!fragments?.length) return;
    fragFade = 0;
    for (const f of fragments) {
      const ms = Array.isArray(f.mesh?.material) ? f.mesh.material : [f.mesh?.material];
      for (const m of ms) if (m) { m.transparent = false; m.opacity = 1; m.depthWrite = true; m.needsUpdate = true; }
      // 碎片是多材质（釉面 + 露胎断面）时 mesh.material 是数组：顺带把数组自身的 opacity 字段归位，
      // 保证"整体不透明度"这一读法（含测试口径）也回到 1。
      if (Array.isArray(f.mesh?.material)) f.mesh.material.opacity = 1;
      // 注意：这里只恢复"材质"，不改 f.mesh.visible——
      // 碎片可见性归 immersive 的视图口径管（go/applyModelVisibility：仅拼合屏可见）。
      // 若在此强制 true，非拼合屏（委托/证书等）会在进场动画结束时浮出 8 片碎瓷（历史 bug）。
    }
  }

  function onSettled(cb, { mode = 'kintsugi' } = {}) {
    if (typeof cb !== 'function') return;
    if (kPhase < 0) kMode = mode; // 终章未启动 → 记录完成分发方式（启动后不可更改，保证互不复用）
    if (kPhase >= 3) { try { cb(); } catch { /* 忽略 */ } return; }
    settledCbs.push(cb);
  }

  // 完成收尾分发方式需在终章启动前设定（拼台初始化/选择方式时调用）；终章已启动则忽略
  function setMode(m) { if (kPhase < 0 && (m === 'kintsugi' || m === 'traditional' || m === 'juci' || m === 'preserve')) kMode = m; }

  function dispose() {
    scene.remove(group);
    disposeModelKit();
    clearRing();
    if (ghostMesh) { group.remove(ghostMesh); ghostMesh = null; }
    ghostFrag = null;
    for (const idx of [...beams.keys()]) removeBeam(idx);
    for (const b of bursts) { b.pts.geometry.dispose(); b.pts.material.dispose(); }
    bursts.length = 0;
    for (const k of kLines) { k.line.geometry.dispose(); }
    kLines = [];
    shellGeo.dispose();
    shellMat.dispose();
    wireGeo.dispose();
    wireMat.dispose();
    if (rim) { rim.geometry.dispose(); rim.material.dispose(); }
    if (cone) { cone.geometry.dispose(); cone.material.dispose(); }
    kMat.dispose();
    ghostMat.dispose();
    dustGeo.dispose();
    dustMat.dispose();
    group.clear?.();
  }

  return {
    group, shell, wireShell,
    setSelected, setDragging, markLocked, update, setVisible, degrade, dispose, onSettled, setMode,
    beams, setModel,
    get ghost() { return ghostMesh; },
    get fadedOut() { return fadeOut >= 1; },
    get settled() { return kPhase >= 3; },
    get modelActive() { return !!modelKit; },
  };
}
