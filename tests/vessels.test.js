import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import * as THREE from 'three';
import { VESSELS, LOCATIONS, HERO_MODEL, generateSites } from '../src/data/vessels.js';
import { createFragments, scatterFragments } from '../src/modules/fragments.js';
import { makeVesselTexture } from '../src/modules/textures.js';
import { vesselProfile, radiusAt, buildSeams } from '../src/modules/vessels3d.js';

const SIX_GLAZE = new Set(['青花', '釉里红', '颜色釉', '玲珑瓷']);

test('六件瓷器覆盖釉彩全谱系，参数完整且档案编号唯一', () => {
  assert.equal(VESSELS.length, 6);
  assert.equal(new Set(VESSELS.map(v => v.archive)).size, 6);
  assert.ok(VESSELS.every(v => v.name && v.era && v.origin && v.storyline && v.location));
  assert.ok(VESSELS.every(v => SIX_GLAZE.has(v.glaze)));
  assert.deepEqual(VESSELS.map(v => v.fragmentCount), [8, 10, 12, 10, 12, 10]);
  assert.ok(VESSELS.every(v => Object.keys(v.rotationMap).every(k => k < v.fragmentCount)));
  // 难度梯度：后期器型存在非零正确旋转角。
  assert.ok(VESSELS.slice(2).some(v => Object.values(v.rotationMap).some(a => a !== 0)));
});

test('真实 GLB 映射齐全：六件器身 + 首页主角，路径规则一致且网页副本存在', async () => {
  // 每件器物都要有 model 字段，且落在 vessels/<id>.glb，与 id 一一对应。
  assert.ok(VESSELS.every(v => typeof v.model === 'string' && v.model.length), '六件器物均有 model 字段');
  assert.deepEqual(VESSELS.map(v => v.model), VESSELS.map(v => `vessels/${v.id}.glb`));
  assert.equal(new Set(VESSELS.map(v => v.model)).size, VESSELS.length, 'model 路径不重复');
  assert.equal(HERO_MODEL, 'hero.glb');
  // 网页优化副本必须已生成（npm run models 的产物），否则运行时只会静默回退程序化。
  for (const path of [HERO_MODEL, ...VESSELS.map(v => v.model)]) {
    await access(new URL(`../public/models/${path}`, import.meta.url));
  }
});

test('六件器物均挂原型参考卡：img/caption/source 齐全，参考图存在', async () => {
  for (const vessel of VESSELS) {
    const proto = vessel.proto;
    assert.ok(proto, `${vessel.id} 缺 proto 原型参考卡`);
    assert.ok(proto.img && proto.caption && proto.source, `${vessel.id} proto 字段不全`);
    assert.ok(proto.source.includes('故宫博物院藏'), `${vessel.id} proto.source 需注明馆藏出处`);
    assert.ok(proto.img.startsWith('./patterns/real/'), `${vessel.id} proto.img 需指向本站参考图`);
    await access(new URL(`../public/${proto.img.replace(/^\.\//, '')}`, import.meta.url));
  }
});

test('每件器型都能走完切割管线：碎片覆盖轮廓、UV 连续、站点在轮廓内', () => {
  for (const vessel of VESSELS) {
    const sites = generateSites(vessel.outline, vessel.fragmentCount, vessel.siteSeed);
    assert.equal(sites.length, vessel.fragmentCount, `${vessel.id} 站点数量`);
    const fragments = createFragments(new THREE.Texture(), vessel.stories,
      { outline: vessel.outline, sites, rotationMap: vessel.rotationMap });
    assert.equal(fragments.length, vessel.fragmentCount);
    let area = 0;
    for (const fragment of fragments) {
      const p = fragment.mesh.geometry.attributes.position;
      assert.ok(p.count > 0, `${vessel.id} 存在空碎片`);
      const u = fragment.mesh.geometry.attributes.uv;
      for (let i = 0; i < p.count; i += 3) {
        area += Math.abs((p.getX(i + 1) - p.getX(i)) * (p.getY(i + 2) - p.getY(i)) - (p.getY(i + 1) - p.getY(i)) * (p.getX(i + 2) - p.getX(i))) / 2;
      }
      assert.ok(u.count === p.count);
      for (const id of fragment.adjacent) assert.ok(fragments[id].adjacent.includes(fragment.mesh.userData.id), `${vessel.id} 邻接应双向`);
    }
    const outline = vessel.outline;
    const expected = Math.abs(outline.reduce((sum, a, i) => { const b = outline[(i + 1) % outline.length]; return sum + a[0] * b[1] - a[1] * b[0]; }, 0)) / 2;
    assert.ok(Math.abs(area - expected) < 1e-4, `${vessel.id} 碎片总面积 ${area.toFixed(4)} ≠ 轮廓 ${expected.toFixed(4)}`);
  }
});

test('六件瓷器各 8 段编年记忆：第一人称、含纪年、字数 60-120，纹样文件存在', async () => {
  for (const vessel of VESSELS) {
    assert.equal(vessel.stories.length, 8, `${vessel.id} 记忆段数`);
    assert.equal(new Set(vessel.stories.map(s => s.id)).size, 8);
    for (const s of vessel.stories) {
      assert.ok(s.year, `${s.id} 缺纪年`);
      assert.ok(s.text.startsWith('我'), `${s.id} 应以第一人称开头`);
      const count = Array.from(s.text).length;
      assert.ok(count >= 55 && count <= 130, `${s.id} 字数 ${count}`);
      await access(new URL(`../public/${s.image}`, import.meta.url));
    }
    assert.ok(vessel.voices.painter && vessel.voices.keeper && vessel.voices.kilnWorker, `${vessel.id} 匠人之声不全`);
  }
});

test('三个写实考察点与瓷器对应；3D 器型轮廓可生成车削半径', () => {
  assert.equal(LOCATIONS.length, 3);
  const sites = ['yuyao', 'guyao', 'taoxichuan'];
  for (const loc of LOCATIONS) {
    assert.ok(sites.includes(loc.site), `${loc.id} 未指向写实景点`);
    assert.ok(Number.isInteger(loc.camera), `${loc.id} 缺预设机位`);
    assert.ok(loc.unlockAt >= 1 && loc.unlockAt <= VESSELS.length, `${loc.id} 解锁门槛无效`);
    assert.ok(loc.note && loc.ambient && loc.timeLabel, `${loc.id} 考察点信息不全`);
  }
  for (const vessel of VESSELS) {
    assert.ok(LOCATIONS.some(l => l.id === vessel.location), `${vessel.id} 未指向考察点`);
    const profile = vesselProfile(vessel.outline);
    assert.ok(profile.length >= 4, `${vessel.id} 车削轮廓过短`);
    assert.ok(profile.every(p => p.x > 0 && Number.isFinite(p.y)));
    for (const p of profile) assert.ok(radiusAt(profile, p.y) >= p.x - 1e-6);
    const seams = buildSeams(profile, 'kintsugi', vessel.textureSeed);
    assert.ok(seams.children.length >= 7);
  }
});

test('锔瓷在六种器型上生成跨裂钉，全部几何坐标有效', () => {
  for (const vessel of VESSELS) {
    const profile = vesselProfile(vessel.outline);
    const seams = buildSeams(profile, 'juci', vessel.textureSeed, 7);
    assert.equal(seams.children.length, 28, '七条裂线各有三枚锔钉');
    for (const child of seams.children) {
      assert.ok([...child.geometry.attributes.position.array].every(Number.isFinite), vessel.id);
      child.geometry.dispose();
    }
    seams.children[0].material.dispose();
  }
});

test('全部釉彩纹理可程序化生成（Canvas 环境）', () => {
  if (typeof document === 'undefined') return; // Node 环境跳过，浏览器验收覆盖
  for (const vessel of VESSELS) {
    const texture = makeVesselTexture(vessel);
    assert.ok(texture.image.width === 768 && texture.image.height === 1200);
  }
});

test('多器型散落后仍在视野边界内且 Z 为零', () => {
  for (const vessel of VESSELS) {
    const sites = generateSites(vessel.outline, vessel.fragmentCount, vessel.siteSeed);
    const fragments = createFragments(new THREE.Texture(), vessel.stories,
      { outline: vessel.outline, sites, rotationMap: vessel.rotationMap });
    const camera = { left: -7.4, right: 7.4, top: 6.2, bottom: -6.2 };
    scatterFragments(fragments, camera, () => .3);
    for (const f of fragments) {
      assert.equal(f.mesh.position.z, 0);
      f.mesh.updateMatrixWorld();
      const p = f.mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(f.mesh.matrixWorld);
        assert.ok(point.x >= camera.left && point.x <= camera.right && point.y >= camera.bottom && point.y <= camera.top, `${vessel.id} 散落越界`);
      }
    }
  }
});
