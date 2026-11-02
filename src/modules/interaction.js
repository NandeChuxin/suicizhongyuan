import * as THREE from 'three';
import { confineFragment } from './fragments.js';

export function installInteraction({canvas,camera,fragments,enabled,onSelect,onRelease,onMove=()=>{},tapMode=()=>false,onTap=null}) {
  // fragments 允许传数组或 () => 数组；传函数可在外部重新绑定碎片集合后依然有效。
  // tapMode：无障碍「点击吸附」替代模式——禁用拖拽，改为先点碎片、再点目标位置尝试吸附。
  const list=typeof fragments==='function'?fragments:()=>fragments;
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,0,1),0);
  let selected=null,drag=null;
  function project(event) {
    const rect=canvas.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    return raycaster.ray.intersectPlane(plane,new THREE.Vector3());
  }
  function choose(fragment) {
    selected=fragment;
    fragment.mesh.renderOrder=100;
    onSelect(fragment);
  }
  function down(event) {
    if(!enabled()||drag||(event.pointerType==='mouse'&&event.button!==0&&event.button!==2))return;
    const point=project(event);
    const hits=raycaster.intersectObjects(list().filter(f=>!f.locked).map(f=>f.mesh),false);
    hits.sort((a,b)=>a.distance-b.distance||b.object.renderOrder-a.object.renderOrder);
    // 点击吸附模式：不拖拽。命中碎片=选中；点击空处=把已选碎片移到该处并尝试吸附。
    if(tapMode()){
      if(hits.length){
        const hit=list()[hits[0].object.userData.id];
        if(hit)choose(hit);
      }else if(selected&&!selected.locked){
        selected.mesh.position.set(point.x,point.y,0);
        confineFragment(selected,camera);
        onTap?.(selected);
      }
      event.preventDefault();
      return;
    }
    if(!hits.length)return;
    const fragment=list()[hits[0].object.userData.id];
    if(!fragment)return;
    choose(fragment);
    drag={fragment,pointerId:event.pointerId,offset:fragment.mesh.position.clone().sub(point),
      rotating:event.button===2,lastX:event.clientX};
    try{canvas.setPointerCapture(event.pointerId);}catch{/* Synthetic test pointers have no native capture. */}
    event.preventDefault();
  }
  function move(event) {
    if(!drag||event.pointerId!==drag.pointerId)return;
    if(drag.rotating) {
      drag.fragment.mesh.rotation.z+=(event.clientX-drag.lastX)*.012;
      drag.lastX=event.clientX;
    }else {
      const point=project(event);
      drag.fragment.mesh.position.set(point.x+drag.offset.x,point.y+drag.offset.y,0);
    }
    confineFragment(drag.fragment,camera);
    onMove(drag.fragment,drag.rotating);
  }
  function up(event) {
    if(!drag||event.pointerId!==drag.pointerId)return;
    const fragment=drag.fragment;drag=null;
    fragment.mesh.position.z=0;
    onRelease(fragment);
  }
  function cancel(event) { if(drag?.pointerId===event.pointerId)drag=null; }
  function rotate(delta) {
    if(!enabled()||!selected||selected.locked||drag)return;
    selected.mesh.rotation.z+=delta;
    confineFragment(selected,camera);
    onRelease(selected);
  }
  function key(event) {
    if(event.target instanceof HTMLElement && event.target.closest('input,textarea,[contenteditable="true"]'))return;
    if(event.repeat)return;
    if(event.key.toLowerCase()==='q') {event.preventDefault();rotate(Math.PI/12);}
    if(event.key.toLowerCase()==='e') {event.preventDefault();rotate(-Math.PI/12);}
  }
  const context=event=>event.preventDefault();
  canvas.addEventListener('pointerdown',down);
  canvas.addEventListener('pointermove',move);
  canvas.addEventListener('pointerup',up);
  canvas.addEventListener('pointercancel',cancel);
  canvas.addEventListener('lostpointercapture',cancel);
  canvas.addEventListener('contextmenu',context);
  window.addEventListener('keydown',key);
  return {rotate,selected:()=>selected,dragging:()=>Boolean(drag),clear:()=>{selected=null;drag=null;onSelect(null);},
    destroy:()=>{for(const [type,fn] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel],['contextmenu',context]])canvas.removeEventListener(type,fn);window.removeEventListener('keydown',key);}};
}
