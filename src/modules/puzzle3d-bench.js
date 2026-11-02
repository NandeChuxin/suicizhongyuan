import * as THREE from 'three';
import { P3D, benchRadiusFor, disposeFragmentMaterial, disposeGoldSeams3D, footprintExtent, setFragmentEmissive } from './puzzle3d.js';
import { createHologramSystem } from './hologram.js';
import { mulberry32 } from '../data/vessels.js';

// 3D 拼合台：在拼合屏启用时，把 3D 碎片与光照挂到当前场景；
// 桌面/触屏交互：**任意位置**按下拖动 = 360° 环绕视角（含碎片与全息瓶之上；位移超过 6px 才判定为拖动），
// 未拖动的短按（点击）= 碎片自动归位；双指/滚轮缩放、右键拖动环绕同用一套环绕相机。
// 相机绕拼合目标真轨道旋转（YXZ + zoom 绝对语义不变）：偏航不限（可绕满一圈以上）、俯仰受限，
// 不允许自由漫游。归位时由 flagSnap 打金环脉冲并（必要时）轻推视角，便于看清粘合位置。
//
// 【圆盘台面已彻底移除】原有一块半径 5.2+ 的深色圆柱台面 + 台沿环，它会在透视里横切
// 器身（启程/档案柜/委托等非拼合屏同样会亮着，正好横剖展示中的瓷瓶），按需求全部删除：
// 现在没有任何台面网格，P3D.benchTopY 只作为**不可见的落位坐标平面**（碎片散落/微碴/
// 落位扬尘的 floor 口径），benchRadiusFor 只作为**布局半径口径**（散落分布、confine 边界、
// 投影锥锥底），两者都不产生任何可见元素。改动时勿把圆柱/环重新加回来。
export function createPuzzle3DContext(scene, camera, renderer, fragments, { quality = 'high', lowPower = false, reduce = false, onFragmentPicked, onFragmentRotated, onConfirm, vessel = null, active = true, holoLift = 0, initialView = null } = {}) {
  // 布局半径单值（散落分布 / confine 边界 / 投影锥锥底共用）。不生成台面网格。
  const benchRadius = benchRadiusFor(fragments.length);

  // 飞散的碎碴（任务 A3）：10~20 颗 tiny 四面体胎色小碴，散落在落位平面附近。
  // 不参与拾取（pickFragment 只对碎片 mesh 射线），也不进 fragments 数组。
  const debrisSeed = (vessel?.fragments3d?.seed ?? 1) ^ 0x51ab;
  const debrisRng = mulberry32(debrisSeed);
  const debrisCount = lowPower ? P3D.debris.countLow : P3D.debris.countHigh;
  const debrisGeo = new THREE.TetrahedronGeometry(1);
  const debrisMat = new THREE.MeshStandardMaterial({
    color: P3D.debris.color, roughness: .92, metalness: 0,
    side: THREE.DoubleSide
  });
  const debris = new THREE.Group();
  debris.name = 'bench-debris';
  for (let i = 0; i < debrisCount; i++) {
    const m = new THREE.Mesh(debrisGeo, debrisMat);
    const s = P3D.debris.minSize + debrisRng() * (P3D.debris.maxSize - P3D.debris.minSize);
    m.scale.set(s * (.7 + debrisRng() * .6), s * (.5 + debrisRng() * .5), s * (.7 + debrisRng() * .6));
    const a = debrisRng() * Math.PI * 2, rr = Math.sqrt(debrisRng()) * benchRadius * .85;
    m.position.set(Math.sin(a) * rr, P3D.benchTopY + s * .55, Math.cos(a) * rr);
    m.rotation.set(debrisRng() * Math.PI, debrisRng() * Math.PI, debrisRng() * Math.PI);
    m.castShadow = !lowPower;
    m.raycast = () => {};   // 双保险：即使被误加进射线列表也不产生命中
    debris.add(m);
  }
  scene.add(debris);

  // 碎片间隙微碴（任务④）：4~6 颗（低画质 2）0.02~0.05 微型碴粒，与碎碴同池
  //（同组/同几何/同材质/raycast 短路）。落点拒绝采样：贴落位平面不悬空、不压任何碎片
  // 足印（含 margin）、不出台面、不进拼合中圈；独立确定流，重复加载逐位一致。
  const M = P3D.debris.micro;
  const microRng = mulberry32(((vessel?.fragments3d?.seed ?? vessel?.siteSeed ?? 1) ^ 0x2f9e) >>> 0);
  const microCount = lowPower ? M.low : M.highMin + Math.floor(microRng() * (M.highMax - M.highMin + 1));
  const footprints = fragments.map(f => {
    const ext = footprintExtent(f.mesh.geometry, f.scatterQuaternion ?? f.mesh.quaternion);
    return {
      u: ext.u, w: ext.w, halfU: ext.halfU, halfW: ext.halfW,
      cx: f.scatterPosition.x + ext.cU * ext.u.x + ext.cW * ext.w.x,
      cz: f.scatterPosition.z + ext.cU * ext.u.z + ext.cW * ext.w.z
    };
  });
  const onAnyFootprint = (px, pz) => footprints.some(fp => {
    const dx = px - fp.cx, dz = pz - fp.cz;
    return Math.abs(dx * fp.u.x + dz * fp.u.z) <= fp.halfU + M.margin &&
           Math.abs(dx * fp.w.x + dz * fp.w.z) <= fp.halfW + M.margin;
  });
  let microMade = 0;
  for (let guard = 0; guard < 400 && microMade < microCount; guard++) {
    const host = footprints[microRng() * footprints.length | 0];
    if (!host) break;
    const a = microRng() * Math.PI * 2;
    const d = Math.max(host.halfU, host.halfW) + .1 + microRng() * .45;
    const px = host.cx + Math.cos(a) * d, pz = host.cz + Math.sin(a) * d;
    const rr = Math.hypot(px, pz);
    if (rr > benchRadius * .92 || rr < 1.0 || onAnyFootprint(px, pz)) continue;
    const m = new THREE.Mesh(debrisGeo, debrisMat);
    const s = M.minSize + microRng() * (M.maxSize - M.minSize);
    m.scale.set(s * (.7 + microRng() * .6), s * (.5 + microRng() * .5), s * (.7 + microRng() * .6));
    m.position.set(px, P3D.benchTopY + s * .55, pz);
    m.rotation.set(microRng() * Math.PI, microRng() * Math.PI, microRng() * Math.PI);
    m.castShadow = !lowPower;
    m.raycast = () => {};   // 与碎碴同口径：不参与拾取
    m.userData.micro = true;
    debris.add(m);
    microMade++;
  }
  // 碎碴属拼合屏专属：非拼合屏（启程/档案柜/委托）一律不出现，初始可见性跟随 active
  debris.visible = !!active;

  // 碎片组：把可操作碎片与归位目标放在工作台上方（悬浮待操作）
  const group = new THREE.Group();
  group.name = 'puzzle3d-group';
  scene.add(group);
  for (const f of fragments) {
    group.add(f.mesh);
    f.mesh.position.copy(f.scatterPosition);
    if (f.scatterQuaternion) f.mesh.quaternion.copy(f.scatterQuaternion);
    else f.mesh.rotation.y = f.scatterRotation || 0;
    if (f.locked) {
      f.mesh.position.copy(f.correctPosition);
      if (f.correctQuaternion) f.mesh.quaternion.copy(f.correctQuaternion);
      else f.mesh.rotation.y = f.correctRotation || 0;
    }
  }

  // 全息投影视觉系统：悬浮全息瓶 + 牵引光束 + 粒子氛围（有器型轮廓时启用；
  // 全部已归位的重访不建全息，也不抬升——台面直接呈现成品）。
  const allLocked = fragments.length > 0 && fragments.every(f => f.locked);
  const hologram = vessel && !allLocked
    ? createHologramSystem(scene, { vessel, fragments, low: lowPower, benchRadius, visible: active, lift: holoLift, baseGap: P3D.benchClearance })
    : null;
  // 存档恢复的已归位碎片：直接置为"被实体填补"状态，不播爆发。
  if (hologram) for (const f of fragments) if (f.locked) hologram.markLocked(f, { silent: true });

  // 阴影分级（任务 A4/C7）：高画质碎片向台面投 PCFSoft 软阴影（renderer 侧在 immersive 开启），
  // 低画质/低电档关阴影。
  for (const f of fragments) f.mesh.castShadow = !lowPower;

  // 悬浮拼合面高度（所有碎片共用一个拼合器心）
  const assemblyY = fragments[0]?.correctPosition?.y ?? 0;

  // 台面边界：碎片仅能在工作台圆形区域内操作。
  // 竖向下限按碎片自身几何：直立姿态下器底不穿进台面（benchTopY - 几何 minY）。
  const floorYOf = (f) => {
    const bb = f.mesh.geometry.boundingBox;
    return P3D.benchTopY - (bb ? bb.min.y : -3);
  };
  const confine = (f) => {
    const p = f.mesh.position;
    const r = Math.hypot(p.x, p.z);
    const maxR = benchRadius - 0.35;
    if (r > maxR) {
      const k = maxR / Math.max(r, 1e-6);
      p.x *= k; p.z *= k;
    }
    // 高度：直立底沿不穿台面 ~ 悬浮拼合面上方 1
    p.y = THREE.MathUtils.clamp(p.y, floorYOf(f), Math.max(2.2, assemblyY + 1.0));
  };

  // 拾取升空补间：位置（升到悬浮拼合面、归到拼合中轴 z=0）与姿态（倾覆分量归零，
  // 保留水平朝向——拼合角度只剩 Q/E 可调的绕 Y 旋转）分开补间：
  // 姿态补间不被拖拽打断（否则半途倾角永远归不了正）；位移补间被拖拽接管。
  const liftTweens = new Map(); // fragment -> { fromP, toP, t, dur, ease }
  const poseTweens = new Map(); // fragment -> { fromQ, toQ, t, dur, ease }
  function liftTo(f, toY, dur = .5) {
    if (!f || f.locked) { liftTweens.delete(f); poseTweens.delete(f); return; }
    // 姿态：从当前姿态提取 yaw（YXZ），只保留绕 Y 的水平朝向
    const eul = new THREE.Euler().setFromQuaternion(f.mesh.quaternion, 'YXZ');
    const fromQ = f.mesh.quaternion.clone();
    const toQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, eul.y, 0, 'YXZ'));
    if (fromQ.angleTo(toQ) > 1e-3) poseTweens.set(f, { fromQ, toQ, t: 0, dur: .4 });
    else poseTweens.delete(f);
    // 位移：升到拼合面高度并归到中轴平面
    const fromP = f.mesh.position.clone();
    const toP = new THREE.Vector3(fromP.x, toY, 0);
    if (fromP.distanceTo(toP) < 1e-3) liftTweens.delete(f);
    else liftTweens.set(f, { fromP, toP, t: 0, dur });
  }
  function stepLiftTweens(dt) {
    for (const [f, tw] of liftTweens) {
      if (f.locked) { liftTweens.delete(f); continue; }
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      const e = tw.ease === 'in' ? k * k : 1 - Math.pow(1 - k, 3); // 'in'=重力感 / 默认 easeOutCubic
      f.mesh.position.lerpVectors(tw.fromP, tw.toP, e);
      if (k >= 1) { if (tw.dust) playDust(f); liftTweens.delete(f); }
    }
    for (const [f, tw] of poseTweens) {
      if (f.locked) { poseTweens.delete(f); continue; }
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      const e = tw.ease === 'in' ? k * k : 1 - Math.pow(1 - k, 3);
      f.mesh.quaternion.slerpQuaternions(tw.fromQ, tw.toQ, e);
      if (k >= 1) poseTweens.delete(f);
    }
  }

  // 松手落回（任务 A2）：未吸附的碎片受重力落回台面上的散落位（位移 easeIn、姿态同步回到躺放）。
  // 只有被 pointer 选中/拖拽的片会离台；落回后其余时间所有碎片一律贴台面。
  function settleBack(f) {
    if (!f || f.locked) return;
    const toP = (f.scatterPosition ?? f.mesh.position).clone();
    liftTweens.set(f, { fromP: f.mesh.position.clone(), toP, t: 0, dur: .42, ease: 'in', dust: true });
    const toQ = f.scatterQuaternion?.clone();
    if (toQ && f.mesh.quaternion.angleTo(toQ) > 1e-3) {
      poseTweens.set(f, { fromQ: f.mesh.quaternion.clone(), toQ, t: 0, dur: .42, ease: 'in' });
    }
  }

  // —— 落位扬尘（任务①）：确定性参数在 f.dust（puzzle3d.makeDustBurst，seed=siteSeed+fragmentIndex），
  // 此处只负责播放：4~8 粒极细胎色尘埃，初速向上 + 径向微散，重力回落，life(0.6s) 内 opacity 淡出。
  // 仅高画质且非 prefers-reduced-motion 播放（immersive 的 enable3D 已要求 !reduce，此处双保险）。
  const reduceMotion = !!reduce;
  const dustBursts = [];   // 活动扬尘 { pts, mat, geo, vel, t, floor }
  function playDust(f, delay = 0) {
    if (lowPower || reduceMotion || !f?.dust?.length || f.locked) return;
    const specs = f.dust;
    const g = f.mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    // 接触点 = 散落姿态下几何底面中心（落点贴台面处）
    const base = new THREE.Vector3(0, g.boundingBox.min.y + .02, 0)
      .applyQuaternion(f.mesh.quaternion).add(f.mesh.position);
    const n = specs.length;
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), sizes = new Float32Array(n);
    specs.forEach((d, i) => {
      pos[i * 3] = base.x; pos[i * 3 + 1] = base.y + d.delay * d.vy; pos[i * 3 + 2] = base.z;
      vel[i * 3] = d.vx; vel[i * 3 + 1] = d.vy; vel[i * 3 + 2] = d.vz;
      sizes[i] = d.size;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    // uPx：世界尺寸→像素（正交相机 zoom 感知）；无尺寸信息的测试桩回退 50
    const pxPerUnit = camera?.isOrthographicCamera && camera.top > camera.bottom
      ? ((renderer?.domElement?.clientHeight || 600) / (camera.top - camera.bottom)) * (camera.zoom || 1)
      : 50;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uPx: { value: pxPerUnit },
        uOpacity: { value: P3D.dust.opacity },
        uColor: { value: new THREE.Color(P3D.dust.color) }
      },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        attribute float aSize; uniform float uPx;
        void main(){ gl_PointSize = max(1.0, aSize * uPx); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uOpacity; uniform vec3 uColor;
        void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .18, d) * uOpacity; if (a < .01) discard; gl_FragColor = vec4(uColor, a); }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    pts.visible = false;      // delay 未到不显示
    scene.add(pts);
    dustBursts.push({ pts, mat, geo, vel, t: -delay, floor: P3D.benchTopY + .012 });
  }
  function stepDust(dt) {
    for (let i = dustBursts.length - 1; i >= 0; i--) {
      const b = dustBursts[i];
      b.t += dt;
      if (b.t < 0) continue;
      b.pts.visible = true;
      const pos = b.geo.attributes.position.array;
      const n = pos.length / 3, grav = P3D.dust.gravity;
      for (let k = 0; k < n; k++) {
        const o = k * 3;
        b.vel[o + 1] -= grav * dt;
        pos[o] += b.vel[o] * dt; pos[o + 1] += b.vel[o + 1] * dt; pos[o + 2] += b.vel[o + 2] * dt;
        // 落回台面即停（贴地滑移衰减），不穿台面
        if (pos[o + 1] < b.floor) {
          pos[o + 1] = b.floor; b.vel[o + 1] = 0; b.vel[o] *= .86; b.vel[o + 2] *= .86;
        }
      }
      b.geo.attributes.position.needsUpdate = true;
      b.mat.uniforms.uOpacity.value = P3D.dust.opacity * Math.max(0, 1 - b.t / P3D.dust.life);
      if (b.t >= P3D.dust.life) {
        scene.remove(b.pts); b.geo.dispose(); b.mat.dispose();
        dustBursts.splice(i, 1);
      }
    }
  }

  // 入场落定扬尘：进入拼合屏时各未锁定片按索引错峰播一次（确定性 delay → 重复访问逐位一致）；
  // 已锁定片在拼合位不在台面散落区，不播。
  fragments.forEach((f, i) => { if (!f.locked) playDust(f, i * P3D.dust.stagger); });

  // 正交相机：限制只在工作台内缩放/平移，不开放自由漫游。
  const view = {
    zoom: 1,
    panX: 0, panY: 0,
    target: new THREE.Vector3(0, 0.4, 0),
  };
  // 环绕视角（真轨道）：相机绕拼合目标 T=(panX, panY+0.4, 0) 旋转，
  // yaw 不限（可绕器身 360°+），pitch 受 ORBIT_LIMIT.pitch 限制。
  // 初始 yaw=0/pitch=0 时相机位于 (panX, panY+0.4, ORBIT_R)，与旧版取景完全一致。
  const ORBIT_R = 18; // 与主场景相机初始距离一致（setup3D z=18）
  const ORBIT_LIMIT = { yaw: Infinity, pitch: 0.8 }; // 偏航放开 360°+，俯仰 ±45.8°
  const orbit = { yaw: 0, pitch: 0 };

  const applyView = () => {
    if (!camera) return;
    // view.zoom 是唯一真值，绝对设置——旧写法 base=camera.zoom 每次调用都累乘，
    // 连续 panView（按下落空的单指平移）会把 zoom 指数级推到上限，取景错乱、拾取全失效。
    camera.zoom = THREE.MathUtils.clamp(view.zoom, 0.32, 2.35);
    // 轨道相机位姿：rotation.set(pitch, yaw, 0, 'YXZ') 语义保留，
    // 位置同步绕 T 公转（C = T - R·forward），保证任意 yaw 下器身都在画面内。
    const tx = view.panX, ty = view.panY + 0.4;
    const cp = Math.cos(orbit.pitch);
    camera.position.set(
      tx + Math.sin(orbit.yaw) * cp * ORBIT_R,
      ty - Math.sin(orbit.pitch) * ORBIT_R,
      Math.cos(orbit.yaw) * cp * ORBIT_R
    );
    camera.rotation.set(orbit.pitch, orbit.yaw, 0, 'YXZ');
    camera.updateProjectionMatrix();
  };

  // 初始取景：把台面散落区与悬浮全息瓶一起框进来（首次 update / reframe 时应用）。
  // 台面变大后竖向 fit 不够——横向（台面直径）同样要框进视野，取两方向更紧的那个。
  // 注意：竖向必须取「全部碎片」包围盒的最高点（含口沿片）——单片（如 fragments[0]）
  // 的 bbox 可能只覆盖中下带，取景因此偏矮，悬浮全息瓶的口沿会被裁出视野。
  let framed = !camera?.isOrthographicCamera;
  let keepOrbitOnFrame = false;   // reframe（视口尺寸变化/切屏返回）只重算取景，不动观众已转到的方位
  function frameView() {
    if (!camera?.isOrthographicCamera) return;
    // 取景按「真实占位」而不是台面半径估算：散落碎片的实际世界包围盒 + 悬浮全息瓶的瓶顶，
    // 两个方向都留 6% 余量。这样宽体器型（云龙罐台面半径 7.3）也不会把任何一片裁到画布外，
    // 侧边栏与底部进度条之间始终能看到完整的碎片圈与成品。
    const box = new THREE.Box3();
    for (const f of fragments) {
      if (!f.mesh) continue;
      f.mesh.updateMatrixWorld(true);
      box.expandByObject(f.mesh);
    }
    let geoTop = 2;
    for (const f of fragments) {
      const g = f.mesh?.geometry;
      if (!g) continue;
      if (g.boundingBox == null) g.computeBoundingBox?.();
      if (g.boundingBox?.max?.y > geoTop) geoTop = g.boundingBox.max.y;
    }
    const topY = assemblyY + geoTop + .8; // 余量：口沿提亮环 + 微尘
    const botY = Math.min(P3D.benchTopY - .25, box.min.y);
    if (box.isEmpty()) box.set(new THREE.Vector3(-3, botY, 0), new THREE.Vector3(3, topY, 0));
    box.max.y = Math.max(box.max.y, topY);
    box.min.y = Math.min(box.min.y, botY);
    const spanY = Math.max(2.4, box.max.y - box.min.y);
    const spanX = Math.max(2.4, box.max.x - box.min.x);
    view.panY = THREE.MathUtils.clamp((box.max.y + box.min.y) / 2 - 0.4, -0.4, 16);
    const zoomV = (camera.top - camera.bottom) / (spanY * 1.06);
    const zoomH = (camera.right - camera.left) / (spanX * 1.06);
    view.zoom = THREE.MathUtils.clamp(Math.min(zoomV, zoomH), 0.32, 1.15);
    state._panYMax = Math.max(1.6, view.panY * 1.3); // 放宽上移视野上限
    // 复位取景（重新散落/复位视角）同步复位环绕视角；reframe 只重算取景，
    // 保留观众已转到的方位——否则视口一变化，刚转过去看粘合处的角度就被拽回正面。
    if (!keepOrbitOnFrame) { orbit.yaw = 0; orbit.pitch = 0; }
    keepOrbitOnFrame = false;
    applyView();
  }

  // —— 归位标记（需求：碎片粘到哪儿必须看得清）——
  // ① 归位瞬间在该碎片表面打一圈金环脉冲（面向相机、向外扩散后淡出）；
  // ② 最近归位的一片保留一层极淡自发光，直到下一片归位——回看时能认出"刚粘上的是哪片"；
  // ③ 若该片落在背面（当前视角看不见），视角只做一次轻推偏航把它转到可见面，手动拖拽可立即打断。
  // 归位标记：只保留一圈"粘到哪儿"的中性冷白光环（瞬态脉冲），不再给瓷片挂金色自发光——
  // 修复后的瓷片必须回到最常规的釉面状态（金线只属于用户显式选择的修复方式）。
  const FLAG = { life: 2.6, from: .55, to: 1.5, opacity: .5, color: 0xe6edf2 };
  const snapFlags = [];                       // 活动金环 { mesh, mat, t, base }
  const ringGeo = new THREE.RingGeometry(.78, 1, 48, 1, 0, Math.PI * 2);
  let lastFlagged = null;

  // 碎片在器身上的世界位置与方位角：几何自带周向偏移（mesh.position 只在器轴上），
  // 因此取几何包围盒中心 + mesh.position 才是真正的"粘合点"，其方位角即该片朝外的方向。
  function fragmentSpot(f) {
    const g = f?.mesh?.geometry;
    if (!g) return null;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingSphere) g.computeBoundingSphere();
    const center = g.boundingBox.getCenter(new THREE.Vector3());
    return {
      center: center.add(f.mesh.position),
      radius: Math.max(.18, g.boundingSphere?.radius || .3),
      azimuth: Math.atan2(center.x, center.z)   // 器轴 = y 轴；相机 yaw 同口径（+Z 起算）
    };
  }

  const viewNudge = { active: false, from: 0, to: 0, t: 0, dur: .55 };
  function nudgeToAzimuth(az) {
    if (!camera) return;
    let d = az - orbit.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));   // 归一到 (-π, π]
    if (Math.abs(d) < 1.9) return;              // ~109° 以内已可见，不打扰玩家视角
    viewNudge.active = true;
    viewNudge.from = orbit.yaw;
    viewNudge.to = orbit.yaw + d - Math.sign(d) * 1.2;  // 转到侧前方而非正对，手感更自然
    viewNudge.t = 0;
  }
  function stepViewNudge(dt) {
    if (!viewNudge.active) return;
    viewNudge.t += dt;
    const k = Math.min(1, viewNudge.t / viewNudge.dur);
    const e = 1 - Math.pow(1 - k, 3);
    orbit.yaw = viewNudge.from + (viewNudge.to - viewNudge.from) * e;
    applyView();
    if (k >= 1) viewNudge.active = false;
  }
  function stepFlags(dt) {
    for (let i = snapFlags.length - 1; i >= 0; i--) {
      const s = snapFlags[i];
      s.t += dt;
      const k = Math.min(1, s.t / FLAG.life);
      const e = 1 - Math.pow(1 - k, 2);
      s.mesh.scale.setScalar(s.base * (FLAG.from + (FLAG.to - FLAG.from) * e));
      s.mat.opacity = FLAG.opacity * Math.pow(1 - k, 1.4);
      if (camera) s.mesh.lookAt(camera.position);
      if (k >= 1) {
        scene.remove(s.mesh); s.mat.dispose();
        snapFlags.splice(i, 1);
      }
    }
    stepViewNudge(dt);
  }
  // 归位反馈入口（immersive 在碎片归位完成时调用）：金环 + 常驻淡光 + 必要时轻推视角。
  function flagSnap(f) {
    const spot = fragmentSpot(f);
    if (!spot) return false;
    if (lastFlagged && lastFlagged !== f && lastFlagged.mesh?.material) {
      setFragmentEmissive(lastFlagged.mesh.material, P3D.gold.color, 0);
    }
    lastFlagged = f;
    // 不挂任何常驻自发光：瓷片归位即回到原始釉面（归一化掉可能残留的旧色调）
    setFragmentEmissive(f.mesh.material, P3D.gold.color, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: FLAG.color, transparent: true, opacity: FLAG.opacity,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.position.copy(spot.center);
    mesh.scale.setScalar(spot.radius * FLAG.from);
    mesh.renderOrder = 6;
    mesh.raycast = () => {};                     // 纯视觉：不参与拾取
    if (camera) mesh.lookAt(camera.position);
    scene.add(mesh);
    snapFlags.push({ mesh, mat, t: 0, base: spot.radius });
    if (!reduceMotion) nudgeToAzimuth(spot.azimuth);
    return true;
  }

  const state = {
    group, hologram, debris,   // 圆盘台面已移除：state 里不再有 bench
    view,
    orbit,               // 环绕视角真值（{yaw, pitch}）：供切屏往返时保存/恢复观众的观察角度
    confine,
    settleBack,
    playDust,   // 落位扬尘（任务①）：测试与外部触发入口（内部自带低画质/reduce 门控）
    flagSnap,   // 归位标记：金环脉冲 + 常驻淡光 + 远侧轻推视角（immersive 在归位完成时调用）
    snapFlags,  // 活动金环列表（可读可断言）
    selected: null,
    isDragging: false,
    isRotating: false,
    // 每帧更新（由渲染循环调用）：dt 秒。
    update(dt = 1 / 60) {
      stepLiftTweens(dt);
      stepDust(dt);
      stepFlags(dt);
      if (!framed) { framed = true; frameView(); }
      if (!hologram) return;
      hologram.setDragging(this.isDragging);
      hologram.update(dt);
    },
    // 视口尺寸变化后重新取景（immersive resize 会改 camera.top/bottom，需重算 zoom/panY）；
    // 保留环绕方位（只重算取景参数），避免切屏回来视角被复位。
    reframe() { framed = false; keepOrbitOnFrame = true; },
    // 整组可见性：拼合屏专有的碎片/碎碴/全息只在拼合屏出现。
    // （此前全息单独受控、碎碴一直亮着，于是启程/档案柜/委托也飘着一层碎碴——已收敛到这一个入口）
    setVisible(v) {
      const on = !!v;
      if (debris) debris.visible = on;
      hologram?.setVisible(on);
    },
    // 触屏：单指观察 / 双指缩放（与拾取手势互斥）
    pointers: new Map(),
    lastPinchDist: 0,
    lastPan: null,
    pinchZoom(factor = 1) {
      if (Math.abs(factor - 1) < 1e-4) return;
      view.zoom = THREE.MathUtils.clamp(view.zoom * factor, 0.55, 2.35);
      applyView();
    },
    panView(dx, dy, factor = 0.0035) {
      const panYMax = this._panYMax ?? 1.6;
      view.panX = THREE.MathUtils.clamp(view.panX - dx * factor, -benchRadius * 0.45, benchRadius * 0.45);
      view.panY = THREE.MathUtils.clamp(view.panY + dy * factor, -0.4, panYMax);
      applyView();
    },
    // 环绕视角：偏航不限（可绕满一圈以上），俯仰 ±ORBIT_LIMIT.pitch（键盘/按钮入口同用）
    rotateView(dyaw, dpitch = 0) {
      orbit.yaw = THREE.MathUtils.clamp(orbit.yaw + dyaw, -ORBIT_LIMIT.yaw, ORBIT_LIMIT.yaw);
      orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + dpitch, -ORBIT_LIMIT.pitch, ORBIT_LIMIT.pitch);
      applyView();
    },
    // 复位视角：回到初始取景（全器 + 台面 + 悬浮全息完整入画）
    resetView() {
      view.zoom = 1; view.panX = 0; view.panY = 0;
      framed = false;
      keepOrbitOnFrame = false;   // 复位视角：连同环绕方位一起回到正面
      frameView();
    },
    // 用户 GLB 接入（修复对象视觉呈现）：转发给全息系统，碎片判定仍走程序化 profile
    setModel(root) { hologram?.setModel?.(root); },
    rotateFragment(f, delta) {
      if (!f || f.locked) return;
      if (f.mesh.quaternion && f.correctQuaternion) {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), delta);
        f.mesh.quaternion.premultiply(q);
      } else {
        f.mesh.rotation.y += delta;
      }
      this.confine(f);
      onFragmentRotated?.(f, delta);
    },
    // 触屏 / 键盘按钮入口：旋转「当前选中」碎片（复用 interaction.js 的 ±π/12 手感）
    rotateSelected(delta = Math.PI / 12) {
      if (this.selected && !this.selected.locked) this.rotateFragment(this.selected, delta);
    },
    select(f, { lift = true } = {}) {
      this.selected = f;
      hologram?.setSelected(f && !f.locked ? f : null);
      // 拾取即升空：碎片被牵引到悬浮拼合面（参考视频：碎片离台上升）；
      // 点击即归位模式下跳过升空（snapFragment3D 会直接从当前位置补间归位）。
      if (f && !f.locked && lift) liftTo(f, assemblyY);
      onFragmentPicked?.(f);
    },
    confirm(f, opts = {}) {
      if (!f || f.locked) return false;
      const dist = f.mesh.position.distanceTo(f.correctPosition);
      const ang = f.mesh.quaternion ? f.mesh.quaternion.angleTo(f.correctQuaternion) : Math.abs(f.mesh.rotation.y - (f.correctRotation || 0));
      // opts.force：点击即归位——姿态/角度不再由玩家调整，直接放行吸附判定。
      const ok = opts.force ? true : (dist < P3D.snapDistance && ang < P3D.snapAngle);
      if (ok) {
        liftTweens.delete(f); // 让位给 snapFragment3D 的 gsap 归位补间
        poseTweens.delete(f); // 姿态补间同样让位，避免与吸附动画逐帧互写
        onConfirm?.(f, opts);
        // 吸附成立：全息对应区域压低 + 接缝爆发（onConfirm 内部已置 f.locked）
        if (f.locked) hologram?.markLocked(f);
      }
      return ok;
    },
    dispose() {
      // 幂等：重复调用不崩（_cleanup 已 delete、scene.remove / dispose 均可重复）。
      if (this._disposed) return;
      this._disposed = true;
      if (this._cleanup) {
        this._cleanup();
        delete this._cleanup;
      }
      hologram?.dispose();
      // 碎碴（任务 A3/C9）：几何共享一份，材质共享一份
      scene.remove(debris); debrisGeo.dispose(); debrisMat.dispose();
      // 金缮接缝金线（任务 B6/C9）：折线几何逐条释放、共享金线材质释放
      disposeGoldSeams3D(fragments);
      // 先逐个移除碎片 mesh（释放几何/材质，含子节点金线），再清空 group 并移除组本身
      for (const f of fragments) {
        group.remove(f.mesh);
        f.mesh.geometry?.dispose?.();
        disposeFragmentMaterial(f.mesh.material);
        f.mesh.traverse?.((o) => {
          if (o === f.mesh) return;
          o.geometry?.dispose?.();
          if (o.material && o.material !== fragments._goldMat) o.material?.dispose?.();
        });
      }
      group.clear?.();
      scene.remove(group);
      this.pointers.clear();
      liftTweens.clear();
      poseTweens.clear();
      // 落位扬尘（任务①）：未播完的 burst 一并回收
      for (const b of dustBursts) { scene.remove(b.pts); b.geo.dispose(); b.mat.dispose(); }
      dustBursts.length = 0;
      // 归位金环：活动环回收 + 共享环几何释放
      for (const s of snapFlags) { scene.remove(s.mesh); s.mat.dispose(); }
      snapFlags.length = 0;
      ringGeo.dispose();
      if (lastFlagged?.mesh?.material) setFragmentEmissive(lastFlagged.mesh.material, P3D.gold.color, 0);
      lastFlagged = null;
      viewNudge.active = false;
      this.selected = null;
      this.isDragging = false;
    }
  };

  // 切屏往返沿用观众视角（在 state 之后应用，避免引用未初始化）：传入 initialView 时不再自动取景，
  // 从记忆屏回来仍是刚才转到的角度，可继续端详刚粘上的那片。
  if (initialView) {
    view.zoom = THREE.MathUtils.clamp(initialView.zoom ?? view.zoom, 0.55, 2.35);
    view.panX = initialView.panX ?? 0;
    view.panY = initialView.panY ?? 0;
    state._panYMax = Math.max(1.6, view.panY * 1.3);
    orbit.yaw = initialView.yaw ?? 0;
    orbit.pitch = THREE.MathUtils.clamp(initialView.pitch ?? 0, -ORBIT_LIMIT.pitch, ORBIT_LIMIT.pitch);
    framed = true;
    applyView();
  }

  // 将 3D 碎片接入 pointer 事件（点击即归位 + 任意位置拖动环绕）与视角手势（缩放）。
  const canvas = renderer?.domElement;
  if (canvas) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let viewPinchIds = [];
  // 环绕视角拖拽：**任意位置**按下拖动都进入（含碎片之上与全息瓶之上），
  // 位移超过 DRAG_SLOP 即判定为 360° 环绕拖动；未超过则判定为"点击"→ 碎片归位。
  // 这样"转不动"的情况不再出现：碎片铺满台面时，从碎片上起拖同样是旋转视角。
  const DRAG_SLOP = 6;   // px
  let orbitDrag = null;
  let pendingPick = null;   // { pointerId, frag }：待定点击（抬手时未拖动才归位）
  const startOrbit = (event) => {
    orbitDrag = {
      pointerId: event.pointerId,
      x: event.clientX, y: event.clientY,
      x0: event.clientX, y0: event.clientY,
      active: false
    };
    viewNudge.active = false;   // 手动拖拽优先：立即打断自动轻推
    try { canvas.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
  };

    const pickFragment = (event) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      // 直接对碎片 mesh 拾取（与父级无关）：immersive 会把碎片 mesh 重新挂到 scene，
      // group.children 会被掏空，因此不能依赖 group 做拾取。
      const hits = raycaster.intersectObjects(fragments.filter(f => !f.locked).map(f => f.mesh), false);
      hits.sort((a, b) => a.distance - b.distance || b.object.renderOrder - a.object.renderOrder);
      if (!hits.length) return null;
      // 命中后回查 fragments 数组里对应的碎片对象（带 .mesh / .locked）
      const hitMesh = hits[0].object;
      const frag = fragments.find((f) => f.mesh === hitMesh) || null;
      return frag && !frag.locked ? frag : null;
    };

    const down = (event) => {
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      // 双指进入视角缩放；与碎片拾取/环绕手势互斥（清除 selected，取消环绕拖拽与待定点击）。
      // 放在 pickFragment 之前，避免双指场景误触发碎片拾取/归位。
      if (state.pointers.size === 2) {
        state.isDragging = false;
        orbitDrag = null; state.isRotating = false; // 双指捏合优先，终止单指环绕
        pendingPick = null;
        state.select(null);
        viewPinchIds = [...state.pointers.keys()];
        state.lastPinchDist = Math.hypot(
          state.pointers.get(viewPinchIds[0])?.x - state.pointers.get(viewPinchIds[1])?.x,
          state.pointers.get(viewPinchIds[0])?.y - state.pointers.get(viewPinchIds[1])?.y
        ) || 0;
        return;
      }

      // 右键（button=2）进入 360° 环绕观察：偏航不限 / 俯仰受限（不开放自由漫游）
      if (event.button === 2) {
        startOrbit(event);
        return;
      }

      // 其他非左键（button=1 中键等）不处理
      if (event.button && event.button !== 0) return;

      // 左键 / 单指：记下"可能的点击目标"，同时按拖动处理——
      // 抬手时若位移未超阈值 → 点击归位（保留原有点击即归位的手感）；
      // 若已拖动 → 只旋转视角，绝不误触发归位。
      pendingPick = { pointerId: event.pointerId, frag: pickFragment(event) };
      startOrbit(event);
    };
    const move = (event) => {
      if (state.pointers.has(event.pointerId)) state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      // 环绕拖拽（左键 / 单指 / 右键）：偏航不限（360° 自由旋转）+ 俯仰受限，相机绕拼合目标公转
      if (orbitDrag && event.pointerId === orbitDrag.pointerId) {
        if (!orbitDrag.active) {
          if (Math.hypot(event.clientX - orbitDrag.x0, event.clientY - orbitDrag.y0) < DRAG_SLOP) return;
          orbitDrag.active = true;
          state.isRotating = true;
          pendingPick = null;          // 已判定为拖动：取消待定点击，避免旋转之余误归位
        }
        const dx = event.clientX - orbitDrag.x;
        const dy = event.clientY - orbitDrag.y;
        orbitDrag.x = event.clientX; orbitDrag.y = event.clientY;
        orbit.yaw = THREE.MathUtils.clamp(orbit.yaw - dx * 0.006, -ORBIT_LIMIT.yaw, ORBIT_LIMIT.yaw);
        orbit.pitch = THREE.MathUtils.clamp(orbit.pitch - dy * 0.006, -ORBIT_LIMIT.pitch, ORBIT_LIMIT.pitch);
        applyView();
        return;
      }

      if (state.pointers.size === 2 && viewPinchIds.length === 2) {
        const [idA, idB] = viewPinchIds;
        const a = state.pointers.get(idA), b = state.pointers.get(idB);
        if (!a || !b) return;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (state.lastPinchDist > 0 && dist > 0) state.pinchZoom(dist / state.lastPinchDist);
        state.lastPinchDist = dist;
        return;
      }
    };

    const up = (event) => {
      state.pointers.delete(event.pointerId);
      if (state.pointers.size < 2) {
        viewPinchIds = [];
        state.lastPinchDist = 0;
      }
      if (orbitDrag && event.pointerId === orbitDrag.pointerId) {
        const rotated = orbitDrag.active;
        orbitDrag = null; state.isRotating = false;
        // 未拖动 → 视为点击：碎片归位（点击即归位原口径不变）
        const pick = pendingPick;
        if (!rotated && pick && pick.pointerId === event.pointerId && pick.frag && !pick.frag.locked) {
          state.select(pick.frag, { lift: false });
          state.confirm(pick.frag, { force: true });
          state.select(null); // 立刻收起选中态：牵引光束淡出、ghost 与 dragging 样式清除
        }
      }
      pendingPick = null;
      state.lastPan = null;
    };

    const cancel = (event) => {
      state.pointers.delete(event.pointerId);
      if (orbitDrag && event.pointerId === orbitDrag.pointerId) { orbitDrag = null; state.isRotating = false; }
      if (state.pointers.size < 2) {
        viewPinchIds = [];
        state.lastPinchDist = 0;
      }
      pendingPick = null;
      state.lastPan = null;
    };

    // 阻止右键默认菜单（右键用于 360° 环绕观察）
    const context = (event) => event.preventDefault();

    const wheel = (event) => {
      event.preventDefault();
      // 滚轮：缩放视角（碎片归位已改为点击即吸附，无旋转需求）。
      state.pinchZoom(event.deltaY < 0 ? 1.06 : 1 / 1.06);
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('lostpointercapture', cancel);
    canvas.addEventListener('contextmenu', context);
    canvas.addEventListener('wheel', wheel, { passive: false });

    state._cleanup = () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('lostpointercapture', cancel);
      canvas.removeEventListener('contextmenu', context);
      canvas.removeEventListener('wheel', wheel);
    };
  }

  return state;
}
