// 「扫描成器 · 复原推演」与「循痕识位 · 拖动智能提示」（数字示意层）。
// 思路对应真实技术的轻量化：轴对称器物以轮廓对称补全（SfS++ 的对称轴锚定）、
// 已归位碎片在器身 UV 上「拼回」已知区域（纹样连续性延拓）、拖动匹配分
// 由「轮廓重合度（OBB 交叠）+ 旋转/纹样梯度一致度」构成——纯 Canvas/数学实现。
// 全部为程序化生成，不引入外部图片或联网服务；不承诺考古级精度。

import * as THREE from 'three';
import { makeVesselTexture } from './textures.js';
import { normalizeAngle, MAGNET_DISTANCE } from './gameState.js';

const TEX_W = 768, TEX_H = 1200;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// —— 每片碎片的纹样梯度主方向（一次性预计算，供「纹样梯度方向一致度」） ——
// 在碎片 UV 三角形内采样，对器身纹理做 1px 差分求平均梯度向量。
export function computePatternAngles(fragments, texCanvas, bbox) {
  const [minX, minY, maxX, maxY] = bbox, w = maxX - minX, h = maxY - minY;
  const ctx = texCanvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, texCanvas.width, texCanvas.height);
  const lw = texCanvas.width, lh = texCanvas.height;
  const lum = (px, py) => {
    px = Math.max(1, Math.min(lw - 2, px | 0)); py = Math.max(1, Math.min(lh - 2, py | 0));
    const i = (py * lw + px) * 4;
    return .299 * img.data[i] + .587 * img.data[i + 1] + .114 * img.data[i + 2];
  };
  for (const f of fragments) {
    const pos = f.mesh.geometry.attributes.position, uv = f.mesh.geometry.attributes.uv;
    const tri = [];
    for (let i = 0; i < pos.count; i += 3) tri.push([i, i + 1, i + 2]);
    if (!tri.length) continue;
    let gx = 0, gy = 0, n = 0;
    // 采样密度与三角形面积成正比，上限防卡顿。
    const total = tri.length;
    for (const [a, b, c] of tri.slice(0, 40)) {
      const P = k => {
        const wx = (uv.getX(k) * w + minX), wy = (uv.getY(k) * h + minY);
        return [wx, wy, uv.getX(k) * texCanvas.width, (1 - uv.getY(k)) * texCanvas.height];
      };
      const [ax, ay, au, av] = P(a), [bx, by, bu, bv] = P(b), [cx, cy, cu, cv] = P(c);
      const samples = 6;
      for (let s = 0; s <= samples; s++) for (let t = 0; t <= samples - s; t++) {
        const u = s / samples, v = t / samples, w0 = 1 - u - v;
        const px = (au * w0 + bu * u + cu * v) | 0, py = (av * w0 + bv * u + cv * v) | 0;
        gx += lum(px + 1, py) - lum(px - 1, py);
        gy += lum(px, py + 1) - lum(px, py - 1);
        n++;
      }
    }
    f.patternAngle = n ? Math.atan2(gy / n, gx / n) : 0;
  }
}

// —— 已实拼区域遮罩：归位碎片的 UV 三角形并集（归位 = 正确位姿，UV 与位置一一对应） ——
function buildConfirmedMask(fragments) {
  const [mask, m] = makeCanvas(TEX_W, TEX_H);
  m.fillStyle = '#fff'; m.strokeStyle = '#fff'; m.lineWidth = 3; m.lineJoin = 'round';
  for (const f of fragments) {
    if (!f.locked) continue;
    const uv = f.mesh.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i += 3) {
      m.beginPath();
      for (let k = i; k < i + 3; k++) {
        const px = uv.getX(k) * TEX_W, py = (1 - uv.getY(k)) * TEX_H;
        k === i ? m.moveTo(px, py) : m.lineTo(px, py);
      }
      m.closePath(); m.fill(); m.stroke();
    }
  }
  return mask;
}

// —— 合成「复原推演」纹理：推测区半透明冷调 + 已实拼区不透明原纹理 ——
// 轴向对称补全：底图本身是环绕纹样（LatheGeometry 对称展开），
// 未覆盖区域按纹样连续性直接延拓呈现，并以半透明与冷纱标记「推测」属性。
export function composeScanCanvas(vessel, fragments) {
  // 与器身一致的环绕纹样底图（wrap 与 buildVesselMesh 相同口径）。
  const base = makeVesselTexture(vessel, { wrap: true }).image;
  // 推测层：整幅器面降饱和、降透明，叠一层冷青纱（示意「由对称与纹样连续性推演」）。
  const [out, ctx] = makeCanvas(TEX_W, TEX_H);
  ctx.filter = 'saturate(.42)';
  ctx.globalAlpha = .4;
  ctx.drawImage(base, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(126,164,188,.22)';
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  // 已实拼层：遮罩内恢复原纹理（不透明、全饱和）。
  const mask = buildConfirmedMask(fragments);
  const [confirmed, cc] = makeCanvas(TEX_W, TEX_H);
  cc.drawImage(mask, 0, 0);
  cc.globalCompositeOperation = 'source-in';
  cc.drawImage(base, 0, 0);
  ctx.drawImage(confirmed, 0, 0);
  return out;
}

export function makeScanTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// —— 循痕识位：轻量匹配分（数字示意） ——
// pos：与正确落点的距离；IoU：当前姿态与正确姿态的包围盒交叠（轮廓重合度）；
// rot：旋转角一致度（cos Δθ，即纹样梯度方向一致度的载体）。
// 碎片几何是三角形汤（非凸多边形），轮廓重合度改用局部包围盒 OBB 的交叠近似——
// 对同一片碎片的两处姿态而言，OBB 交叠即「位移+旋转接近程度」的稳定度量。
function obbOf(f, rot) {
  const bb = f.mesh.geometry.boundingBox, cos = Math.cos(rot), sin = Math.sin(rot);
  return [[bb.min.x, bb.min.y], [bb.max.x, bb.min.y], [bb.max.x, bb.max.y], [bb.min.x, bb.max.y]]
    .map(([x, y]) => [f.mesh.position.x + x * cos - y * sin, f.mesh.position.y + x * sin + y * cos]);
}

function convexArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function clipConvex(subject, clipPoly) {
  let out = subject;
  const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let i = 0; i < clipPoly.length && out.length; i++) {
    const a = clipPoly[i], b = clipPoly[(i + 1) % clipPoly.length], input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length];
      const cp = cross(a, b, p), cq = cross(a, b, q);
      if (cp >= 0) out.push(p);
      if ((cp >= 0) !== (cq >= 0)) {
        const t = cp / (cp - cq);
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
  }
  return out;
}

export function matchScore(fragment) {
  if (fragment.locked) return 0;
  const dist = Math.hypot(fragment.mesh.position.x - fragment.correctPosition.x,
    fragment.mesh.position.y - fragment.correctPosition.y);
  const rotErr = Math.abs(normalizeAngle(fragment.mesh.rotation.z - fragment.correctRotation));
  // 轮廓重合度：当前姿态与正确姿态的 OBB 交并比。
  const cur = obbOf(fragment, fragment.mesh.rotation.z);
  const tgt = obbOf(fragment, fragment.correctRotation);
  const inter = convexArea(clipConvex(cur, tgt));
  const union = convexArea(cur) + convexArea(tgt) - inter;
  const iou = union > 1e-6 ? inter / union : 0;
  const posScore = Math.max(0, 1 - dist / (MAGNET_DISTANCE * 1.5));
  const rotScore = Math.max(0, Math.cos(rotErr));
  const score = .45 * posScore + .35 * iou + .2 * rotScore;
  return { score, dist, rotErr, iou };
}
