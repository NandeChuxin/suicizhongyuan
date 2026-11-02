import * as THREE from 'three';

export const REPAIR_PROFILES = {
  traditional: {label:'传统修复', color:0xbfc4c5, opacity:0.42, width:0.012, bloom:false,
    philosophy:'最小干预 · 可逆理念 · 可识别记录',
    text:'让器物的轮廓回归，让浅灰裂线保留可识别的记录。尊重已有信息，给未来的判断留下空间。',
    story:'我选择轻声记录裂痕，让青花延续，也让改变留下可辨认的痕迹。'},
  kintsugi: {label:'金缮修复', color:0xf4c56f, opacity:0.95, width:0.042, bloom:true,
    philosophy:'接受不完美 · 看见裂痕 · 赋予新生',
    text:'用金色强调经历过的裂痕，让破碎成为新的表达。在这场数字习作中，完整与不完美可以同时存在。',
    story:'我选择让金线沿着裂痕生长，记住曾经的破碎，也接纳此刻的新生。'},
  preserve: {label:'现状保存', color:0x8793a2, opacity:0.2, width:0.012, bloom:false,
    philosophy:'维持现状 · 保存证据 · 克制介入',
    text:'有些破碎本身就是完整的证据。保留断裂与缺口，让器物以破碎的样子说出真实经历。',
    story:'今天我没有替你愈合。我让八片保持可辨的距离，也让沉埋、断裂与重见天日都成为档案。'}
};

// Screen-space line widths are unreliable in WebGL. Gold ribbons use actual triangle geometry.
export function ribbonGeometry(segments, width) {
  const vertices = [];
  for (let i=0; i<segments.length; i+=6) {
    const [ax,ay,az,bx,by,bz] = segments.slice(i,i+6);
    const length = Math.hypot(bx-ax,by-ay);
    if (length < 1e-8) continue;
    const nx = -(by-ay)/length*width/2, ny = (bx-ax)/length*width/2;
    const a=[ax+nx,ay+ny,az],b=[ax-nx,ay-ny,az],c=[bx+nx,by+ny,bz],d=[bx-nx,by-ny,bz];
    vertices.push(...a,...b,...c,...c,...b,...d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3));
  return geometry;
}

export function createFractureVisuals(segments) {
  const group = new THREE.Group();
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(segments,3)),
    new THREE.LineBasicMaterial({color:0xbfc4c5,transparent:true,opacity:0.12,depthWrite:false}));
  const gold = new THREE.Mesh(ribbonGeometry(segments,REPAIR_PROFILES.kintsugi.width),
    new THREE.MeshBasicMaterial({color:0xf4c56f,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));
  gold.visible = false;
  group.add(line,gold);
  return { group, line, gold };
}

export function applyRepairVisuals(fragments, bloom, mode) {
  const profile = REPAIR_PROFILES[mode];
  if (!profile) throw new Error('未知修复方式');
  bloom.enabled = profile.bloom;
  bloom.strength = profile.bloom ? 0.5 : 0;
  for (const fragment of fragments) {
    fragment.seams.line.visible = mode !== 'kintsugi';
    fragment.seams.line.material.color.set(profile.color);
    fragment.seams.line.material.opacity = profile.opacity;
    fragment.seams.gold.visible = mode === 'kintsugi';
    fragment.seams.gold.material.color.set(profile.color).multiplyScalar(2.2);
    fragment.seams.gold.material.opacity = profile.opacity;
  }
  return profile;
}
