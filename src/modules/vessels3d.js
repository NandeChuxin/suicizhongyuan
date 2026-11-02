import * as THREE from 'three';

// 真 3D 瓷瓶展示：由拼合用的器型轮廓直接生成 LatheGeometry，
// 与拼图共用轮廓数据，博物馆展柜复用同一构建函数。

export function vesselProfile(outline) {
  const points = outline.filter(p => p[0] >= -.01)
    .map(([r, y]) => new THREE.Vector2(Math.max(r, .02), y))
    .sort((a, b) => a.y - b.y);
  const deduped = [];
  for (const p of points) if (!deduped.length || Math.abs(deduped[deduped.length - 1].y - p.y) > .01) deduped.push(p);
  return deduped;
}

export function radiusAt(profile, y) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [a, ay] = profile[i], [b, by] = profile[i + 1];
    if (y >= ay && y <= by) return a + (b - a) * (y - ay) / (by - ay);
  }
  return profile[0]?.x ?? .6;
}

// 四种修复方式的缝形态（抉择屏左右对比与程序化器身共用）：
// 隐痕＝平齐的浅色补釉带（内嵌 offset≈0、带宽大、无高光）；金线＝外凸细金线 + 金铆点。
// 两者在轮廓/体积上有可见差异，不只是颜色不同。
const SEAM_MODES = {
  traditional: { color: 0xe8e2d4, boost: 1, radius: .014, offset: .001, beads: 0 },
  kintsugi: { color: 0xd8b262, boost: 1.35, radius: .007, offset: .012, beads: 3 },
  juci: { color: 0x8f744b, boost: 1, radius: .006, offset: .015, beads: 0 },
  preserve: { color: 0x6e7884, boost: .3, radius: .006, offset: .015, beads: 0 }
};

export function buildSeams(profile, mode = 'kintsugi', seed = 7, count = 7) {
  const spec = SEAM_MODES[mode] ?? SEAM_MODES.kintsugi;
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.color).multiplyScalar(spec.boost) });
  const beadMaterial = new THREE.MeshStandardMaterial({ color: spec.color, metalness: .85, roughness: .3 });
  const group = new THREE.Group();
  let a = seed >>> 0;
  const rng = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  for (let k = 0; k < count; k++) {
    const theta = k * Math.PI * 2 / count + rng() * .6;
    const points = [];
    for (let j = 0; j < 18; j++) {
      const t = j / 17;
      const yMin = profile[0].y, yMax = profile[profile.length - 1].y;
      const y = yMin + (yMax - yMin) * t;
      const angle = theta + Math.sin(j * 1.6 + k) * .12;
      const r = radiusAt(profile, y) + spec.offset;
      points.push(new THREE.Vector3(Math.sin(angle) * r, y, Math.cos(angle) * r));
    }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 50, spec.radius, 4, false), material));
    // 金线表达：沿缝留几颗凸起的金铆点（形态差异看得见）
    for (let i = 0; i < (spec.beads || 0); i++) {
      const j = 4 + Math.round((i + .5) / spec.beads * 9);
      const c = points[Math.min(points.length - 1, j)];
      const bead = new THREE.Mesh(new THREE.SphereGeometry(spec.radius * 3, 10, 8), beadMaterial);
      bead.position.copy(c);
      group.add(bead);
    }
    if (mode === 'juci') {
      for (const j of [4, 9, 14]) {
        const center = points[j], angle = Math.atan2(center.x, center.z);
        const r = Math.hypot(center.x, center.z) + .035;
        const bridge = [-.09, 0, .09].map(offset => new THREE.Vector3(
          Math.sin(angle + offset) * r, center.y + (offset === 0 ? .035 : 0), Math.cos(angle + offset) * r));
        group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bridge), 10, .025, 6, false), material));
      }
    }
  }
  return group;
}

export function buildVesselMesh(vessel, texture, { mode = null, physical = true } = {}) {
  const profile = vesselProfile(vessel.outline);
  const geometry = new THREE.LatheGeometry(profile, 80);
  // LatheGeometry 默认按轮廓折点序号分配 v，改为实际高度，纹带才能贴合肩颈。
  const position = geometry.attributes.position, uv = geometry.attributes.uv;
  const minY = profile[0].y, height = profile[profile.length - 1].y - minY;
  for (let i = 0; i < uv.count; i++) uv.setY(i, (position.getY(i) - minY) / height);
  uv.needsUpdate = true;
  const material = physical
    ? new THREE.MeshPhysicalMaterial({ map: texture, color: 0xf5f2ea, roughness: .22, metalness: .03, clearcoat: 1, clearcoatRoughness: .12, side: THREE.DoubleSide })
    : new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  if (mode) group.add(buildSeams(profile, mode, vessel.textureSeed, 7 + vessel.index));
  group.userData.profile = profile;
  group.userData.material = material;
  return group;
}
