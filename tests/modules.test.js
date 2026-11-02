import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import * as THREE from 'three';
import { createFragments, SILHOUETTE, scatterFragments } from '../src/modules/fragments.js';
import { canSnap, SNAP_DISTANCE, SNAP_ANGLE, createGameState, lockFragment, setRepairMode, resetGameState, issueCertificate, setUserName } from '../src/modules/gameState.js';
import { applyRepairVisuals, REPAIR_PROFILES, ribbonGeometry } from '../src/modules/repair.js';

const stories=JSON.parse(await readFile(new URL('../src/data/storyData.json',import.meta.url),'utf8'));
const makeFragments=()=>createFragments(new THREE.Texture(),stories);

test('Voronoi 碎片覆盖瓶形面积，UV 连续，邻接关系双向',()=>{
  const fragments=makeFragments();assert.equal(fragments.length,8);
  let area=0;
  for(const fragment of fragments) {
    const p=fragment.mesh.geometry.attributes.position,u=fragment.mesh.geometry.attributes.uv;
    assert.ok(p.count>0);assert.equal(p.count,u.count);
    for(let i=0;i<p.count;i+=3)area+=Math.abs((p.getX(i+1)-p.getX(i))*(p.getY(i+2)-p.getY(i))-(p.getY(i+1)-p.getY(i))*(p.getX(i+2)-p.getX(i)))/2;
    for(let i=0;i<p.count;i++) {
      assert.equal(p.getZ(i),0);
      const xs=SILHOUETTE.map(pt=>pt[0]),ys=SILHOUETTE.map(pt=>pt[1]);
      const bx0=Math.min(...xs),bx1=Math.max(...xs),by0=Math.min(...ys),by1=Math.max(...ys);
      assert.ok(Math.abs(u.getX(i)-(p.getX(i)+fragment.correctPosition.x-bx0)/(bx1-bx0))<1e-6);
      assert.ok(Math.abs(u.getY(i)-(p.getY(i)+fragment.correctPosition.y-by0)/(by1-by0))<1e-6);
    }
    for(const id of fragment.adjacent)assert.ok(fragments[id].adjacent.includes(fragment.mesh.userData.id));
  }
  const expected=Math.abs(SILHOUETTE.reduce((sum,a,i)=>{const b=SILHOUETTE[(i+1)%SILHOUETTE.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;
  assert.ok(Math.abs(area-expected)<1e-5,`${area} !== ${expected}`);
});

test('散落后 Z 始终为零，移动端与桌面边界内保留完整碎片',()=>{
  for(const halfWidth of [3.9,7.4]) {
    const fragments=makeFragments(),camera={left:-halfWidth,right:halfWidth,top:6.2,bottom:-6.2};
    scatterFragments(fragments,camera,()=>.3);
    for(const f of fragments){assert.equal(f.mesh.position.z,0);f.mesh.updateMatrixWorld();const p=f.mesh.geometry.attributes.position;
      for(let i=0;i<p.count;i++){const point=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(f.mesh.matrixWorld);assert.ok(point.x>=camera.left&&point.x<=camera.right&&point.y>=camera.bottom&&point.y<=camera.top);}}
  }
});

test('吸附同时要求距离和角度；整圈旋转、阈值和锁定状态正确',()=>{
  const f=makeFragments()[0];assert.equal(canSnap(f),true);
  f.mesh.position.x=f.correctPosition.x+SNAP_DISTANCE+.001;assert.equal(canSnap(f),false);
  f.mesh.position.copy(f.correctPosition);f.mesh.rotation.z=SNAP_ANGLE+.001;assert.equal(canSnap(f),false);
  f.mesh.rotation.z=Math.PI*2-.05;assert.equal(canSnap(f),true);
  f.mesh.rotation.z=0;f.mesh.position.y+=SNAP_DISTANCE;assert.equal(canSnap(f),false);
  f.mesh.position.copy(f.correctPosition);f.locked=true;assert.equal(canSnap(f),false);
});

test('每片只计数一次，记忆不重复，重置清除证书和模式',()=>{
  const fragments=makeFragments(),state=createGameState(fragments);
  assert.throws(()=>setRepairMode(state,'traditional'));
  for(const f of fragments){assert.equal(lockFragment(state,f),true);assert.equal(lockFragment(state,f),false);assert.equal(f.revealed,true);}
  assert.equal(state.repairedCount,8);assert.equal(state.unlockedStories.length,8);
  setRepairMode(state,'traditional');issueCertificate(state,new Date('2026-10-06T17:00:00Z'),()=> 'a');
  assert.equal(state.certificateDate,'2026/10/07');
  resetGameState(state);assert.equal(state.repairedCount,0);assert.equal(state.unlockedStories.length,0);assert.equal(state.certificateId,null);assert.equal(state.repairMode,null);assert.ok(fragments.every(f=>!f.revealed&&!f.locked));
});

test('传统与金缮有真实线宽、颜色、可见性与 Bloom 差异',()=>{
  const fragments=makeFragments(),bloom={};
  applyRepairVisuals(fragments,bloom,'traditional');assert.equal(bloom.enabled,false);
  assert.ok(fragments.every(f=>f.seams.line.visible&&!f.seams.gold.visible&&f.seams.line.material.opacity===.42));
  applyRepairVisuals(fragments,bloom,'kintsugi');assert.equal(bloom.enabled,true);
  assert.ok(fragments.every(f=>!f.seams.line.visible&&f.seams.gold.visible));
  const g=ribbonGeometry([0,0,0,1,0,0],.042);assert.ok(Math.abs(g.attributes.position.getY(0)-.021)<1e-7);
  assert.notEqual(REPAIR_PROFILES.traditional.story,REPAIR_PROFILES.kintsugi.story);
});

test('证书编号重复下载稳定，改变修复方式后重新签发，昵称限制长度',()=>{
  const fragments=makeFragments(),state=createGameState(fragments);fragments.forEach(f=>lockFragment(state,f));
  setUserName(state,'  青花匠  ');assert.equal(state.userName,'青花匠');setRepairMode(state,'traditional');
  const first=issueCertificate(state,new Date(),()=> 'one');assert.equal(issueCertificate(state,new Date(),()=> 'two').id,first.id);
  setRepairMode(state,'kintsugi');assert.equal(issueCertificate(state,new Date(),()=> '2a4f').id,'窑 · 乙巳 · 2A4F');
  setRepairMode(state,'preserve');assert.equal(state.repairMode,'preserve');
  setUserName(state,'');assert.equal(state.userName,'无名修复师');setUserName(state,'瓷'.repeat(30));assert.equal(state.userName.length,20);
});

test('八段编年手记均含纪年、感官细节，绑定唯一且所有纹样文件存在',async()=>{
  assert.equal(new Set(stories.map(s=>s.id)).size,8);
  assert.ok(stories.every(s=>s.year&&s.text.startsWith('我')));
  for(const s of stories){const count=Array.from(s.text).length;assert.ok(count>=60&&count<=120,`${s.id} 字数 ${count}`);await access(new URL(`../public/${s.image}`,import.meta.url));}
});
