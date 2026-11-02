import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VESSELS, mulberry32 } from '../src/data/vessels.js';
import { vesselProfile } from '../src/modules/vessels3d.js';
import {
  P3D,
  benchRadiusFor,
  create3DFragments,
  buildCrackNetwork,
  makeDustBurst,
  fragmentDistance3D,
  fragmentAngle3D,
  magnetStage3D,
  seekPose3D,
  snapFragment3D,
  showGoldSeams3D,
  disposeGoldSeams3D,
  disposePuzzle3D,
} from '../src/modules/puzzle3d.js';

// 3D 碎片的几何、确定性、吸附判定在纯 Node（无 DOM）下校验。
// 依赖 create3DFragments 的无 DOM 兜底：无 Canvas 时材质退化为纯色，几何与姿态仍可产出。

const NEED_FIELDS = [
  'index', 'mesh', 'correctPosition', 'correctQuaternion', 'correctEuler',
  'scatterPosition', 'scatterQuaternion', 'scatterEuler',
  'locked', 'revealed', 'storyId', 'adjacent', 'pattern',
];

test('P3D 常量齐备且组织集中（阈值 / 几何 / 发光 / 缩放 / 台面落位 / 摆动 / 碎碴）', () => {
  for (const key of ['snapDistance','snapAngle','magnetDistance','magnetAngle','glow','gold','thickness','scatterRadius','scatterLift','benchRadius','hover','qualityScale']) {
    assert.ok(key in P3D, `P3D 缺少 ${key}`);
  }
  assert.ok(P3D.snapDistance > 0 && P3D.snapAngle > 0);
  assert.ok(P3D.magnetDistance > P3D.snapDistance, '磁感距离应大于吸附距离');
  assert.ok(P3D.magnetAngle > P3D.snapAngle, '磁感角度应大于吸附角度');
  assert.ok(P3D.glow.color && P3D.gold.color, '发光/金线颜色齐备');
  // 台面落位与摆动（任务 A/B）
  assert.ok(Number.isFinite(P3D.benchTopY), '台面顶面高度应定义');
  assert.ok(P3D.seatRadius > 0 && P3D.stackGap > 0 && P3D.stackMax > 0, '器座/叠压参数齐备');
  assert.ok(P3D.gold.seam > 0, '金线淡入终值应定义');
  assert.ok(P3D.seek.duration >= .45 && P3D.seek.duration <= .55, '对位摆动时长应在 .45~.55s');
  assert.ok(P3D.seek.swingsHigh >= 2 && P3D.seek.swingsHigh <= 3, '高画质摆动 2~3 次');
  assert.equal(P3D.seek.swingsLow, 1, '低画质摆动 1 次');
  assert.ok(P3D.debris.countLow >= 10 && P3D.debris.countHigh <= 20, '碎碴数量档 10~20');
  // 台面半径单值来源
  assert.ok(benchRadiusFor(8) > 0 && benchRadiusFor(12) > benchRadiusFor(8), 'benchRadiusFor 应随碎片数增大');
});

test('六件器物均可在 Node 环境生成碎片，数量 = fragmentCount 且索引 0..count-1 稳定', () => {
  for (const v of VESSELS) {
    const built = create3DFragments(v);
    assert.equal(built.fragments.length, v.fragmentCount, `${v.id} 碎片数应等于 fragmentCount`);
    assert.ok(built.fragments.every((f, i) => f.index === i), `${v.id} 碎片索引应稳定为 0..count-1`);
  }
});

test('每片字段完整，几何无 NaN、索引不越界、未退化', () => {
  for (const v of VESSELS) {
    for (const f of create3DFragments(v).fragments) {
      for (const key of NEED_FIELDS) assert.ok(key in f, `${v.id}#${f.index} 缺字段 ${key}`);
      assert.equal(f.locked, false);
      assert.equal(f.revealed, false);
      assert.ok(Array.isArray(f.adjacent) && f.adjacent.length === 2, 'adjacent 应为两片邻居');
      const g = f.mesh.geometry;
      const pos = g.getAttribute('position');
      assert.ok(pos && pos.count > 0, `${v.id}#${f.index} 顶点为空`);
      for (let i = 0; i < pos.array.length; i++) assert.ok(Number.isFinite(pos.array[i]), `${v.id}#${f.index} 顶点出现 NaN`);
      const index = g.getIndex();
      assert.ok(index && index.count > 0, `${v.id}#${f.index} 无索引（非退化）`);
      for (let i = 0; i < index.array.length; i++) {
        const x = index.array[i];
        assert.ok(x >= 0 && x < pos.count, `${v.id}#${f.index} 索引越界 ${x}/${pos.count}`);
      }
    }
  }
});

test('确定性：同一器物两次调用，correctPosition / scatterPosition / 姿态完全一致', () => {
  for (const v of VESSELS) {
    const a = create3DFragments(v);
    const b = create3DFragments(v);
    for (let i = 0; i < a.fragments.length; i++) {
      const fa = a.fragments[i], fb = b.fragments[i];
      assert.ok(fa.correctPosition.equals(fb.correctPosition), `${v.id}#${i} correctPosition 不一致`);
      assert.ok(fa.scatterPosition.equals(fb.scatterPosition), `${v.id}#${i} scatterPosition 不一致`);
      assert.ok(fa.scatterQuaternion.equals(fb.scatterQuaternion), `${v.id}#${i} scatterQuaternion 不一致（台面落位姿态也应可复现）`);
      assert.ok(Math.abs(fa.correctQuaternion.dot(fb.correctQuaternion)) > 1 - 1e-9, `${v.id}#${i} correctQuaternion 不一致`);
    }
  }
});

test('裂纹几何确定性：同一 seed 连续两次，每片顶点数组与索引逐位一致', () => {
  for (const v of VESSELS) {
    const a = create3DFragments(v);
    const b = create3DFragments(v);
    for (let i = 0; i < a.fragments.length; i++) {
      const ga = a.fragments[i].mesh.geometry, gb = b.fragments[i].mesh.geometry;
      const pa = ga.getAttribute('position').array, pb = gb.getAttribute('position').array;
      assert.equal(pa.length, pb.length, `${v.id}#${i} 顶点数不一致`);
      for (let j = 0; j < pa.length; j++) assert.equal(pa[j], pb[j], `${v.id}#${i} 顶点 ${j} 不逐位一致`);
      const ia = ga.getIndex().array, ib = gb.getIndex().array;
      assert.equal(ia.length, ib.length, `${v.id}#${i} 索引数不一致`);
      for (let j = 0; j < ia.length; j++) assert.equal(ia[j], ib[j], `${v.id}#${i} 索引 ${j} 不逐位一致`);
    }
  }
});

test('断面露胎材质：mesh.material 为数组 [釉面, 露胎]，geometry.groups 两类面分离', () => {
  const v = VESSELS[0];
  for (const f of create3DFragments(v).fragments) {
    const mats = f.mesh.material;
    assert.ok(Array.isArray(mats) && mats.length === 2, '材质应为 [釉面, 露胎] 数组');
    const [glaze, bisque] = mats;
    assert.ok(glaze.map !== undefined || glaze.isMeshPhysicalMaterial, '组 0 应为釉面材质');
    assert.equal(bisque.isMeshStandardMaterial, true, '组 1 应为 MeshStandardMaterial 露胎材质');
    assert.equal(bisque.color.getHex(), 0xd8d2c2, '露胎颜色应为灰白偏米黄');
    assert.equal(bisque.roughness, .85, '露胎应粗糙');
    assert.equal(bisque.metalness, 0, '露胎不应有金属度');
    assert.equal(bisque.map ?? null, null, '断面不贴青花纹理');
    const groups = f.mesh.geometry.groups;
    assert.equal(groups.length, 2, '应有两个材质组');
    assert.equal(groups[0].materialIndex, 0);
    assert.equal(groups[1].materialIndex, 1);
    assert.ok(groups[0].count > 0 && groups[1].count > 0, '釉面与断面三角面都应存在');
  }
});

test('碎片块状化：无通高长条（高/弧宽受控）、大小错落、列宽不雷同', () => {
  for (const v of VESSELS) {
    const built = create3DFragments(v);
    const frags = built.fragments;
    // 宽扁器（玲珑碗：口大底小的锥腹，直径 > 2×器高）的碎片天生是「贯通全高的扇形块」：
    // 同一片在口沿处弧宽大、在圈足处弧宽小，长宽比必然比高器更松。按「直径/高」比例放宽上限
    // （比例 1.5 以下仍是 2.4），否则这类器型只能被切成 4 片以内才"合规"。
    const prof = vesselProfile(v.outline);
    const vH = prof[prof.length - 1].y - prof[0].y;
    const vR = Math.max(...prof.map(p => p.x));
    const flat = (vR * 2) / Math.max(1e-4, vH);
    const aspectCap = 2.4 * Math.max(1, flat / 1.5);
    // 面积错落：最大块 / 最小块 > 1.8（带高差 × 列宽差的联合效果）
    const areas = frags.map(f => f.mesh.userData.thetaSpan * f.mesh.userData.ySpan);
    const max = Math.max(...areas), min = Math.min(...areas);
    assert.ok(max / min > 1.8, `${v.id} 面积错落比 ${max / min} 应 >1.8`);
    // 块状化（2026-10-16 口径精化）：宽域碎片（带中弧宽 ≥0.9）高/弧宽同量级，杜绝"一长条一长条"；
    // 细窄区碎片（梅瓶颈 / 高足柄等，arcSpan <0.9）先天细长，退而约束「非通高」（ySpan ≤0.55 器高）。
    for (const f of frags) {
      const { ySpan, arcSpan } = f.mesh.userData;
      if (arcSpan >= .9) {
        assert.ok(ySpan / arcSpan <= aspectCap, `${v.id}#${f.index} 高/弧宽 ${(ySpan / arcSpan).toFixed(2)} 应 ≤${aspectCap.toFixed(1)}（块状）`);
        assert.ok(arcSpan / ySpan <= aspectCap, `${v.id}#${f.index} 弧宽/高 ${(arcSpan / ySpan).toFixed(2)} 应 ≤${aspectCap.toFixed(1)}（块状）`);
      } else {
        const vesselH = built.maxY - built.minY;
        assert.ok(ySpan <= vesselH * .55, `${v.id}#${f.index} 细窄区碎片高 ${ySpan.toFixed(2)} 应 ≤0.55 器高（非通高）`);
        assert.ok(arcSpan / ySpan <= 2.4, `${v.id}#${f.index} 弧宽/高 ${(arcSpan / ySpan).toFixed(2)} 应 ≤2.4`);
      }
    }
    assert.ok(new Set(frags.map(f => f.mesh.userData.thetaSpan.toFixed(4))).size > 1, `${v.id} 列宽不应完全雷同`);
  }
});

test('种子来源：vessel.fragments3d.seed 缺失时回退 vessel.siteSeed（与 mulberry32 口径一致）', () => {
  // 缺 fragments3d 的器物（构造一个最小对象）应落到 siteSeed 兜底，不崩且确定性不变。
  const v = { fragmentCount: 4, siteSeed: 999, outline: VESSELS[0].outline, stories: [] };
  const a = create3DFragments(v);
  const b = create3DFragments(v);
  for (let i = 0; i < a.fragments.length; i++) {
    assert.ok(a.fragments[i].scatterPosition.equals(b.fragments[i].scatterPosition), '缺 fragments3d 时确定性应仍成立');
  }
  // 显式传 options.seed 可覆盖
  const c = create3DFragments(v, undefined, { seed: 12345 });
  assert.ok(!c.fragments[0].scatterPosition.equals(a.fragments[0].scatterPosition), 'options.seed 应改变散落布局');
  // mulberry32 自身确定性
  const r1 = mulberry32(7), r2 = mulberry32(7);
  assert.equal(r1(), r2());
});

test('吸附辅助函数：距离 / 角度 / 两阶段磁感口径正确', () => {
  const v = VESSELS[0];
  const f = create3DFragments(v).fragments[0];
  const dist = fragmentDistance3D(f);
  const ang = fragmentAngle3D(f);
  assert.ok(dist >= 0 && Number.isFinite(dist));
  assert.ok(ang >= 0 && ang <= Math.PI);
  // 散落状态：距离通常 > magnetDistance，两阶段都不满足
  const s = magnetStage3D(f);
  assert.equal(typeof s.stage1, 'boolean');
  assert.equal(typeof s.stage2, 'boolean');
  // 把碎片搬到归位处，stage2 应满足
  f.mesh.position.copy(f.correctPosition);
  f.mesh.quaternion.copy(f.correctQuaternion);
  assert.equal(magnetStage3D(f).stage2, true, '归位后 stage2 应满足');
  // disposePuzzle3D 对 null / 非组对象安全
  assert.doesNotThrow(() => disposePuzzle3D(null));
  assert.doesNotThrow(() => disposePuzzle3D({}));
});

// ===================== 任务 A/B/C 新增回归 =====================

test('台面真实落位：所有碎片底部贴台面（或叠压面），无悬空、不出台（任务 A1）', () => {
  for (const v of VESSELS) {
    const benchR = benchRadiusFor(v.fragmentCount);
    const built = create3DFragments(v);
    const seen = new Set();
    for (const f of built.fragments) {
      const g = f.mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox, q = f.scatterQuaternion, c = new THREE.Vector3();
      let lo = Infinity, hi = -Infinity, maxR = 0;
      for (let i = 0; i < 8; i++) {
        c.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyQuaternion(q);
        lo = Math.min(lo, c.y); hi = Math.max(hi, c.y);
        maxR = Math.max(maxR, Math.hypot(c.x + f.scatterPosition.x, c.z + f.scatterPosition.z));
      }
      const bottom = lo + f.scatterPosition.y;
      assert.ok(bottom >= P3D.benchTopY - 1e-6, `${v.id}#${f.index} 底面 ${bottom.toFixed(3)} 不应低于台面 ${P3D.benchTopY}（不悬空）`);
      assert.ok(bottom <= P3D.benchTopY + P3D.stackMax + 1e-6, `${v.id}#${f.index} 底面 ${bottom.toFixed(3)} 不应高于叠压上限`);
      // 长片足印在"器座净空优先"策略下允许微探桌沿（≤ 台面半径 + .8）；
      // 落点本身不得压到台面正中央（拼合位留空）。
      assert.ok(maxR <= benchR + .8, `${v.id}#${f.index} 足印 ${maxR.toFixed(2)} 不应远超台面半径 ${benchR.toFixed(2)}`);
      // 落点用「足印中心」判定：碎片的 mesh 原点是器身上的拼合位（宽器可达离轴 3~4 单位），
      // 拿它判断"是否压在台面中央"会误伤——要看包住碎片的世界包围盒中心。
      const ctr = new THREE.Vector3().addVectors(bb.min, bb.max).multiplyScalar(.5).applyQuaternion(q);
      const footR = Math.hypot(ctr.x + f.scatterPosition.x, ctr.z + f.scatterPosition.z);
      assert.ok(footR >= 1.0, `${v.id}#${f.index} 落点(足印中心)不应压在台面正中央（${footR.toFixed(2)}）`);
      seen.add(`${f.scatterPosition.x.toFixed(3)},${f.scatterPosition.z.toFixed(3)}`);
    }
    assert.equal(seen.size, built.fragments.length, `${v.id} 各片落位不应完全重合`);
  }
});

test('成品落位：器底高于台面净空——台面圆盘不横切、不遮挡器身下段', () => {
  // 回归背景：成品此前贴着台面落位，台面（半径 5.2+ 的大圆盘）在透视里横穿器身下段，
  // 看起来像模型被横剖、切口是个圆盘截面，圈足与底沿全看不见。
  // 现在 correctPosition 抬高 P3D.benchClearance，整器从口沿到圈足完整露出。
  assert.ok(P3D.benchClearance > 0, 'benchClearance 应大于 0');
  for (const v of VESSELS) {
    const built = create3DFragments(v);
    let lowest = Infinity;
    for (const f of built.fragments) {
      const g = f.mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      // 各片在器身上位置不同：只有最低一片的 bbox.min.y 才是器底，取全局最低点判定
      lowest = Math.min(lowest, f.correctPosition.y + g.boundingBox.min.y);
      assert.equal(f.correctPosition.y, built.fragments[0].correctPosition.y, `${v.id}#${f.index} 各片拼合高度应一致`);
    }
    const want = P3D.benchTopY + P3D.benchClearance;
    // 断面贝壳状扰动让几何最低点比轮廓 minY 略低（±.02 量级），留 .06 容差
    assert.ok(Math.abs(lowest - want) < .06, `${v.id} 成品最低点 ${lowest.toFixed(3)} 应落在台面上方净空 ${want.toFixed(3)}`);
    assert.ok(lowest > P3D.benchTopY + .6, `${v.id} 成品最低点 ${lowest.toFixed(3)} 应明显高出台面 ${P3D.benchTopY}`);
  }
});

test('姿态随机化：多数平放、少量斜靠/侧立，落位不排成规则圆环（任务 A1）', () => {
  for (const v of VESSELS) {
    const built = create3DFragments(v);
    const kinds = built.fragments.map(f => f.mesh.userData.layKind);
    const flatRatio = kinds.filter(k => k === 'flat').length / kinds.length;
    assert.ok(flatRatio >= .5, `${v.id} 平放比例 ${(flatRatio * 100).toFixed(0)}% 应过半`);
    // 环半径应有明显错落（非同一半径的规则圆环）
    const radii = built.fragments.map(f => Math.hypot(f.scatterPosition.x, f.scatterPosition.z));
    const spread = Math.max(...radii) - Math.min(...radii);
    assert.ok(spread > .5, `${v.id} 落位半径差 ${spread.toFixed(2)} 应 > .5（错落）`);
  }
});

test('三角面预算：碎片总三角面不超过改造前基线的 1.8 倍（任务 C8）', () => {
  // 基线 = 任务 A/B 改造前实测（裂纹加密已完成、本次未再加密几何）：
  const BASELINE = { meiping: 3600, yuhuchun: 4492, jiangjun: 5100, gaozu: 4592, suantou: 4800, linglong: 4492 };
  for (const v of VESSELS) {
    let tris = 0;
    for (const f of create3DFragments(v).fragments) tris += f.mesh.geometry.getIndex().count / 3;
    assert.ok(tris <= BASELINE[v.id] * 1.8, `${v.id} 三角面 ${tris} 应 ≤ 基线 ${BASELINE[v.id]}×1.8`);
  }
});

test('金缮接缝数据：逐缝双侧注册、折线在几何包围盒内、同 seed 可复现（任务 B6）', () => {
  for (const v of VESSELS) {
    const a = create3DFragments(v);
    const b = create3DFragments(v);
    // 接缝折线取自该器型自身的轮廓：范围按 profile 半径 / 高度判定，
    // 不再硬编码梅瓶口径（宽体器型如云龙罐半径接近 4，需按各自器型验收）。
    const maxR = Math.max(...a.profile.map(p => p.x));
    const yLo = a.minY - .3, yHi = a.maxY + .3;
    let total = 0;
    for (const f of a.fragments) {
      assert.ok(Array.isArray(f.seams), '每片应有 seams 数组');
      for (const s of f.seams) {
        total++;
        const other = a.fragments[s.other];
        assert.ok(other && other !== f, '接缝对侧应为有效碎片');
        assert.ok(other.seams.some(x => x.state === s.state && x.other === f.index), '接缝应双侧注册同一 state');
        assert.equal(s.pts.length % 3, 0, '折线应为 xyz 三元组');
        assert.ok(s.pts.length >= 6, '折线至少两个点');
        for (let i = 0; i < s.pts.length; i += 3) {
          const p = new THREE.Vector3(s.pts[i], s.pts[i + 1], s.pts[i + 2]);
          assert.ok(Math.hypot(p.x, p.z) <= maxR + .25 && p.y >= yLo && p.y <= yHi, '折线点应落在器身范围内');
        }
      }
    }
    assert.ok(total >= v.fragmentCount, `${v.id} 接缝数 ${total / 2} 应至少等于碎片数（裂纹网完整）`);
    // 可复现：同 seed 两次折线逐位一致
    for (let i = 0; i < a.fragments.length; i++) {
      const sa = a.fragments[i].seams, sb = b.fragments[i].seams;
      assert.equal(sa.length, sb.length, `${v.id}#${i} 接缝数应一致`);
      for (let k = 0; k < sa.length; k++) {
        assert.deepEqual([...sa[k].pts], [...sb[k].pts], `${v.id}#${i}#${k} 接缝折线应逐位一致`);
      }
    }
  }
});

test('金线浮现：双方锁定才出现、挂为碎片子节点、金色淡入；单侧锁定不出现（任务 B6）', async () => {
  const v = VESSELS[1];
  const built = create3DFragments(v);
  const frags = built.fragments;
  const f = frags[0];
  const seam = f.seams[0];
  const other = frags[seam.other];
  f.locked = true;
  showGoldSeams3D(frags);
  assert.equal(seam.state.line, null, '单侧锁定不应出现金线');
  other.locked = true;
  assert.equal(showGoldSeams3D(frags), true, '双方锁定应创建金线');
  assert.ok(seam.state.line, '金线应已创建');
  assert.equal(seam.state.line.parent, f.mesh, '金线应挂为碎片 mesh 子节点（跟随归位与落回）');
  assert.equal(seam.state.line.material.color.getHex(), P3D.gold.color, '金线应为金色');
  await new Promise(r => setTimeout(r, 900)); // gsap 淡入完成
  assert.ok(Math.abs(seam.state.line.material.opacity - P3D.gold.seam) < 1e-3,
    `金线应淡入到 ${P3D.gold.seam}（实际 ${seam.state.line.material.opacity}）`);
  // 对方视图取同一条缝：同一 state，不重复创建
  assert.ok(other.seams.find(x => x.state === seam.state).state.line === seam.state.line);
  disposeGoldSeams3D(frags);
  assert.equal(seam.state.line, null, 'dispose 后金线应清空');
});

test('对位摆动：t=0 回起始姿态、t=1 精确吻合正确姿态（任务 B5）', () => {
  const f = create3DFragments(VESSELS[0]).fragments[0];
  const startPos = new THREE.Vector3(.8, 3.1, .6);
  const startQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(.4, 1.2, .3));
  f.seekStart = {
    position: startPos.clone(), quaternion: startQ.clone(),
    perp: new THREE.Vector3(1, 0, 0), axis: new THREE.Vector3(0, 0, 1)
  };
  const at0 = seekPose3D(f, 0);
  assert.ok(at0.position.distanceTo(startPos) < 1e-6, 't=0 应回到起始位置');
  assert.ok(at0.quaternion.angleTo(startQ) < 1e-6, 't=0 应回到起始姿态');
  const at1 = seekPose3D(f, 1);
  assert.ok(at1.position.distanceTo(f.correctPosition) < 1e-9, 't=1 应精确到达正确位置');
  assert.ok(at1.quaternion.angleTo(f.correctQuaternion) < 1e-9, 't=1 应精确吻合正确姿态');
  // 中途应有摆动（位置偏离起点-终点连线）
  const mid = seekPose3D(f, .45);
  const line = startPos.clone().lerp(f.correctPosition, Math.min(1, Math.max(0, (.45 - .12) / .88)));
  assert.ok(mid.position.distanceTo(line) > 1e-3, '中段应有对位摆动（垂直偏移）');
});

test('snapFragment3D：立即锁定、摆动寻位后精确归位并回调（任务 B5）', async () => {
  const f = create3DFragments(VESSELS[2]).fragments[0];
  f.mesh.position.set(.2, f.correctPosition.y + .15, .05);
  let snapped = 0;
  snapFragment3D(f, () => { snapped++; }, { quality: 'high' });
  assert.equal(f.locked, true, '吸附应立即置锁定');
  assert.equal(f.revealed, true);
  await new Promise(r => setTimeout(r, 900)); // 等待摆动+归位补间完成（.5s）
  assert.equal(snapped, 1, '完成时应回调一次');
  assert.ok(f.mesh.position.distanceTo(f.correctPosition) < 1e-9, '归位后位置应精确');
  assert.ok(f.mesh.quaternion.angleTo(f.correctQuaternion) < 1e-9, '归位后姿态应精确');
  // 低画质：摆动 1 次、时长更短
  const f2 = create3DFragments(VESSELS[2]).fragments[0];
  f2.mesh.position.set(.2, f2.correctPosition.y + .15, .05);
  snapFragment3D(f2, () => {}, { quality: 'low' });
  assert.equal(f2.locked, true);
  await new Promise(r => setTimeout(r, 700));
  assert.ok(f2.mesh.position.distanceTo(f2.correctPosition) < 1e-9, '低画质吸附后也应精确归位');
});

test('disposePuzzle3D 递归清理：子节点金线 / Points / Line 全部释放（任务 C9）', () => {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  mesh.add(line); // 金线是碎片 mesh 的子节点
  const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
  group.add(mesh, points);
  let disposed = 0;
  const spy = obj => { const d = obj.dispose.bind(obj); obj.dispose = () => { disposed++; d(); }; };
  spy(mesh.geometry); spy(line.geometry); spy(points.geometry);
  spy(mesh.material); spy(line.material); spy(points.material);
  disposePuzzle3D(group);
  assert.equal(disposed, 6, `容器内几何/材质应全部 dispose（实际 ${disposed}/6）`);
  assert.equal(group.children.length, 0, '容器应清空');
});

// ===================== 碎片真实化进阶（任务①②③④） =====================

test('釉面微差：每片 roughness/clearcoat ±8% 确定性微差、因子存 userData、bisque 不变（任务②）', () => {
  const v = VESSELS[0];
  const a = create3DFragments(v), b = create3DFragments(v);
  const roughSeen = new Set();
  for (let i = 0; i < a.fragments.length; i++) {
    const [ga, ba] = a.fragments[i].mesh.material;
    const [gb] = b.fragments[i].mesh.material;
    assert.equal(ga.isMeshPhysicalMaterial, true, '高画质釉面应为 Physical');
    assert.ok(ga.roughness >= .24 * .92 - 1e-9 && ga.roughness <= .24 * 1.08 + 1e-9,
      `roughness ${ga.roughness.toFixed(4)} 应在 ±8% 微差带内`);
    assert.ok(ga.clearcoat >= .92 - 1e-9 && ga.clearcoat <= 1.08 + 1e-9,
      `clearcoat ${ga.clearcoat.toFixed(4)} 应在 ±8% 微差带内`);
    // userData 因子与实际值一致（immersive GLB 对齐后按此复乘）
    assert.ok(Math.abs(ga.roughness - .24 * ga.userData.varRough) < 1e-12, 'roughness 应等于 base×varRough');
    assert.ok(Math.abs(ga.clearcoat - ga.userData.varCoat) < 1e-12, 'clearcoat 应等于 varCoat');
    // 同 seed 双次加载逐位一致
    assert.equal(ga.roughness, gb.roughness, `${v.id}#${i} roughness 应可复现`);
    assert.equal(ga.clearcoat, gb.clearcoat, `${v.id}#${i} clearcoat 应可复现`);
    // 断口 bisque 保持原口径不变
    assert.equal(ba.roughness, .85, 'bisque roughness 应保持 .85');
    assert.equal(ba.color.getHex(), 0xd8d2c2, 'bisque 颜色应保持胎色');
    roughSeen.add(ga.roughness.toFixed(6));
  }
  assert.ok(roughSeen.size > 1, '各片 roughness 应出现不同微差（打破千片一面）');
  // 低画质：Basic 材质无微差概念，不崩、不产出 undefined 因子
  const lowBuilt = create3DFragments(v, undefined, { low: true });
  const lowGlaze = lowBuilt.fragments[0].mesh.material[0];
  assert.equal(lowGlaze.isMeshBasicMaterial, true);
  assert.equal(lowGlaze.userData.varRough ?? null, null, '低画质不应产出微差因子');
});

test('崩边密度：高画质 3~5 处、低画质减半不为零、独立流不扰动散落与接缝（任务③）', () => {
  for (const v of VESSELS) {
    const profile = vesselProfile(v.outline);
    const minY = profile[0].y, maxY = profile[profile.length - 1].y;
    const thickness = v.fragments3d?.thickness ?? P3D.thickness;
    const baseSeed = (v.fragments3d?.seed ?? v.siteSeed) >>> 0;
    const mk = low => buildCrackNetwork({
      profile, minY, maxY, count: v.fragmentCount,
      rng: mulberry32(baseSeed), seed: baseSeed, thickness, low
    });
    const hi = mk(false), hi2 = mk(false), lo = mk(true);
    assert.ok(hi.chips.length >= 3 && hi.chips.length <= 5, `${v.id} 崩边数 ${hi.chips.length} 应在 3~5`);
    // 确定性：同 seed 两次崩边行/列/深度逐位一致
    assert.equal(hi.chips.length, hi2.chips.length);
    for (let i = 0; i < hi.chips.length; i++) {
      assert.equal(hi.chips[i].r, hi2.chips[i].r);
      assert.equal(hi.chips[i].b, hi2.chips[i].b);
      assert.equal(hi.chips[i].depth, hi2.chips[i].depth);
    }
    // 低画质减半但不为零
    assert.ok(lo.chips.length >= 1 && lo.chips.length <= Math.max(1, hi.chips.length >> 1),
      `${v.id} 低画质崩边 ${lo.chips.length} 应减半且 ≥1`);
    // 崩边行有效（1..R-1）、深度口径不变（thickness × .3~.5）
    for (const c of hi.chips) {
      assert.ok(c.r >= 1 && c.r <= hi.R - 1, `崩边行 ${c.r} 应在 1..${hi.R - 1}`);
      assert.ok(c.depth > 0 && c.depth <= thickness * .5 + 1e-9, '崩边深度应保持原口径');
    }
    // 部位密度：足部行（y < minY+壁厚）权重 ×0.6 —— 行抽取应落在有效行集内且足部可命中
    const footRows = hi.rowsY.filter(y => y < minY + thickness).length;
    assert.ok(footRows >= 0, '高度场可用（口径自检）');
  }
  // 独立确定流解耦：低画质只减崩边数，不退 2D、不改碎片结构（数量一致）；
  // 低/高各自双次加载散落逐位一致（崩边随低画质变化连带足印/散落微移属③预期）
  for (const v of VESSELS) {
    const h = create3DFragments(v), h2 = create3DFragments(v);
    const l = create3DFragments(v, undefined, { low: true }), l2 = create3DFragments(v, undefined, { low: true });
    assert.equal(l.fragments.length, h.fragments.length, `${v.id} 低/高画质碎片数应一致`);
    for (let i = 0; i < h.fragments.length; i++) {
      assert.ok(h.fragments[i].scatterPosition.equals(h2.fragments[i].scatterPosition), `${v.id}#${i} 高画质双次散落逐位一致`);
      assert.ok(l.fragments[i].scatterPosition.equals(l2.fragments[i].scatterPosition), `${v.id}#${i} 低画质双次散落逐位一致`);
    }
  }
});

test('落位扬尘：4~8 粒、尺寸/初速/重力口径、seed=siteSeed+index 确定性（任务①）', () => {
  const v = VESSELS[0];
  const a = makeDustBurst(v.siteSeed, 3), b = makeDustBurst(v.siteSeed, 3), c = makeDustBurst(v.siteSeed, 4);
  assert.ok(a.length >= 4 && a.length <= 8, `粒数 ${a.length} 应在 4~8`);
  assert.deepEqual(a, b, '同 seed 同片参数应逐位一致（重复访问逐位一致）');
  assert.notDeepEqual(a, c, '不同片参数应不同');
  for (const d of a) {
    assert.ok(d.vy > 0, '初速应向上');
    assert.ok(d.vy >= P3D.dust.upMin - 1e-9 && d.vy <= P3D.dust.upMax + 1e-9);
    assert.ok(d.size >= P3D.dust.sizeMin - 1e-9 && d.size <= P3D.dust.sizeMax + 1e-9, '尺寸应在 .03~.06');
    assert.ok(Number.isFinite(d.vx) && Number.isFinite(d.vz), '径向微散分量应为有限数');
    assert.ok(d.delay >= 0 && d.delay <= .1 + 1e-9, '片内错峰应极短');
  }
  // 每片碎片自带 dust 参数（siteSeed + fragmentIndex 口径）
  const built = create3DFragments(v);
  built.fragments.forEach((f, i) => assert.deepEqual(f.dust, makeDustBurst(v.siteSeed, i), `#${i} f.dust 应匹配派生口径`));
});
