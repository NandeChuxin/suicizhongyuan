import * as THREE from 'three';
import { gsap } from 'gsap';
import stories from './data/storyData.json';
import { createFragments, scatterFragments, confineFragment } from './modules/fragments.js';
import { createGameState, canSnap, normalizeAngle, lockFragment, resetGameState, setRepairMode, setUserName, issueCertificate } from './modules/gameState.js';
import { createScene, makePorcelainTexture, configureGlaze } from './modules/scene.js';
import { installInteraction } from './modules/interaction.js';
import { createMemoryUI } from './modules/memories.js';
import { applyRepairVisuals, REPAIR_PROFILES } from './modules/repair.js';
import { captureRepair, exportCertificate } from './modules/certificate.js';
import { renderUI } from './modules/ui.js';
import './style.css';

renderUI();
const $=selector=>document.querySelector(selector),wrap=$('#canvas-wrap');
const toast=text=>{$('#toast').textContent=text;};
gsap.ticker.lagSmoothing(0);
let resources;
try { resources=createScene(wrap); }
catch {
  toast('无法启用 WebGL。请使用支持 WebGL 的浏览器，并启用硬件加速。');
  $('#welcome-title').textContent='当前浏览器无法呈现瓷片';
  $('#start').disabled=true;$('#demo').disabled=true;
}
let app=null;
if(resources) app=initialize(resources);
export const game=app;

function initialize(resources) {
  const {scene,camera,renderer,composer,bloom}=resources;
  const fragments=createFragments(makePorcelainTexture(),stories);
  for(const fragment of fragments){configureGlaze(fragment);scene.add(fragment.mesh);}
  const gameState=createGameState(fragments);
  let demoRunning=false,demoIndex=0,demoTimeline=null,session=0,exporting=false,selected=null;
  let sound=false,audioContext;
  const hints=new Set();

  function updateProgress() {
    const n=gameState.repairedCount;
    $('#count').textContent=`${String(n).padStart(2,'0')} / ${String(gameState.totalCount).padStart(2,'0')}`;
    $('#bar').style.width=`${n/gameState.totalCount*100}%`;
    $('#memory-count').textContent=`已解锁 ${gameState.unlockedStories.length}/${stories.length} 段记忆`;
    $('#state').textContent=n===gameState.totalCount?'八片归一 · 等待你的选择':`已找回 ${n} 片时光`;
    memories.refresh();
  }
  function showOverlay(id) {
    document.body.dataset.phase=gameState.phase;
    for(const name of ['welcome','commission','choice','finish'])$('#'+name).classList.toggle('hidden',name!==id);
    $('#'+id)?.querySelector('button:not(:disabled),input')?.focus({preventScroll:true});
  }
  function hideOverlays(){document.body.dataset.phase=gameState.phase;for(const name of ['welcome','commission','choice','finish'])$('#'+name).classList.add('hidden');}
  function updateSelection(fragment) {
    if(selected&&!selected.locked)selected.mesh.material.color.set(0xbac4c6);
    selected=fragment;
    if(fragment&&!fragment.locked)fragment.mesh.material.color.set(0xffffff);
    for(const id of ['left','right','hint'])$('#'+id).disabled=!fragment||fragment.locked||demoRunning;
  }
  function chime() {
    if(!sound)return;
    try {
      audioContext??=new (window.AudioContext||window.webkitAudioContext)();audioContext.resume();
      const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();
      oscillator.frequency.setValueAtTime(880,audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1320,audioContext.currentTime+.18);
      gain.gain.setValueAtTime(.04,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.4);
      oscillator.connect(gain).connect(audioContext.destination);oscillator.start();oscillator.stop(audioContext.currentTime+.4);
    }catch{toast('当前环境无法播放声音，修复仍可继续。');}
  }
  const memories=createMemoryUI({stories,layer:$('#memory-layer'),archive:$('#memory-archive'),state:gameState,onClose:()=>{
    if(gameState.repairedCount===gameState.totalCount&&gameState.phase==='playing')finishAssembly();
  }});
  function attemptSnap(fragment,continuation=null) {
    if(gameState.phase!=='playing'||!canSnap(fragment))return false;
    const diff=normalizeAngle(fragment.mesh.rotation.z-fragment.correctRotation);
    if(!lockFragment(gameState,fragment))return false;
    gsap.to(fragment.mesh.position,{x:fragment.correctPosition.x,y:fragment.correctPosition.y,z:0,duration:.2});
    gsap.to(fragment.mesh.rotation,{z:fragment.mesh.rotation.z-diff,duration:.2});
    fragment.mesh.material.color.set(0xe4e4d8);
    gsap.to(fragment.seams.line.material,{opacity:.35,duration:.3});
    resources.emit(fragment.correctPosition);chime();
    interaction.clear();updateProgress();toast('这一片，回家了。一段记忆已解锁。');
    memories.show(fragment.storyId,continuation);
    return true;
  }
  const interaction=installInteraction({canvas:renderer.domElement,camera,fragments,
    enabled:()=>gameState.phase==='playing'&&!demoRunning&&!exporting,
    onSelect:updateSelection,onRelease:fragment=>attemptSnap(fragment)});
  function clearHints(){for(const hint of hints){gsap.killTweensOf(hint.material);scene.remove(hint);hint.material.dispose();}hints.clear();}
  function reset() {
    if(exporting){toast('证书正在生成，请稍候。');return;}
    session++;demoTimeline?.kill();demoTimeline=null;demoRunning=false;demoIndex=0;
    gsap.killTweensOf(bloom);clearHints();resources.clearEffects();
    for(const fragment of fragments) {
      for(const target of [fragment.mesh.position,fragment.mesh.rotation,fragment.mesh.material.color,fragment.mesh.material.userData.glaze,fragment.seams.line.material,fragment.seams.gold.material])gsap.killTweensOf(target);
      fragment.mesh.material.color.set(0xbac4c6);fragment.mesh.material.userData.glaze.value=.68;
      fragment.seams.line.visible=true;fragment.seams.line.material.color.set(0xbfc4c5);fragment.seams.line.material.opacity=.12;
      fragment.seams.gold.visible=false;fragment.seams.gold.material.opacity=0;
    }
    resetGameState(gameState);scatterFragments(fragments,camera);
    bloom.enabled=true;bloom.strength=.35;
    interaction.clear();memories.hide(false);updateProgress();hideOverlays();
    $('#completed-summary').classList.add('hidden');$('#glaze').disabled=false;$('#change-mode').disabled=false;
    $('#demo').disabled=false;$('#archive-toggle').disabled=false;$('#memory-archive').inert=false;
    $('#export-status').textContent='';
    toast('拖动瓷片到瓶身轮廓，选中后用 Q / E 或按钮调正角度。');
  }
  function begin() {setUserName(gameState,$('#user-name').value);reset();}
  $('#start').onclick=()=>{gameState.phase='commission';showOverlay('commission');};$('#begin').onclick=begin;
  $('#reset').onclick=()=>{if(gameState.phase==='welcome'||gameState.phase==='commission')return;reset();};$('#again').onclick=reset;
  $('#memory-reset').onclick=reset;
  $('#left').onclick=()=>interaction.rotate(Math.PI/12);$('#right').onclick=()=>interaction.rotate(-Math.PI/12);
  $('#hint').onclick=()=>{
    if(!selected||selected.locked||demoRunning)return;
    clearHints();
    const hint=new THREE.Mesh(selected.mesh.geometry,new THREE.MeshBasicMaterial({color:0xffd58b,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false}));
    hint.position.copy(selected.correctPosition);hint.position.z=.08;scene.add(hint);hints.add(hint);
    gsap.to(hint.material,{opacity:0,duration:2.5,onComplete:()=>{scene.remove(hint);hint.material.dispose();hints.delete(hint);}});
    toast('金色轮廓是它的归处。轮廓和角度都合适时，它会自动归位。');
  };
  function finishAssembly() {
    if(gameState.repairedCount!==gameState.totalCount)return;
    demoRunning=false;$('#demo').disabled=false;$('#archive-toggle').disabled=false;$('#memory-archive').inert=false;
    gameState.phase='choice';interaction.clear();memories.hide(false);
    for(const fragment of fragments){fragment.seams.gold.visible=true;fragment.seams.gold.material.color.set(0xf4c56f).multiplyScalar(2.2);fragment.seams.gold.material.opacity=.6;resources.emit(fragment.correctPosition,10);}
    bloom.enabled=true;gsap.to(bloom,{strength:.7,duration:.6,yoyo:true,repeat:1});
    showOverlay('choice');toast('拼合已完成。裂痕如何留下，由你决定。');
  }
  function chooseMode(mode) {
    if(gameState.phase!=='choice')return;
    gsap.killTweensOf(bloom);resources.clearEffects();setRepairMode(gameState,mode);
    const profile=applyRepairVisuals(fragments,bloom,mode);
    gameState.phase='finishing';$('#chosen-mode').textContent=profile.label;
    $('#story').textContent=profile.story+' '+profile.text;
    $('#glaze').disabled=false;$('#change-mode').disabled=false;showOverlay('finish');
    toast(`${profile.label}：${profile.philosophy}`);
  }
  $('#traditional').onclick=()=>chooseMode('traditional');$('#kintsugi').onclick=()=>chooseMode('kintsugi');
  function rechoose() {
    if(exporting||gameState.phase==='glazing')return;
    gameState.phase='choice';$('#completed-summary').classList.add('hidden');showOverlay('choice');
  }
  $('#change-mode').onclick=rechoose;$('#rechoose').onclick=rechoose;
  function showSummary() {
    const record=issueCertificate(gameState),profile=REPAIR_PROFILES[gameState.repairMode];
    $('#summary-mode').textContent=profile.label;$('#summary-philosophy').textContent=profile.philosophy;
    $('#summary-name').textContent=record.userName;$('#summary-date').textContent=record.date;$('#summary-id').textContent=record.id;
    $('#completed-summary').classList.remove('hidden');hideOverlays();$('#state').textContent='修复完成 · 已签发数字证书';
  }
  $('#glaze').onclick=()=>{
    if(gameState.phase!=='finishing')return;
    const currentSession=session;gameState.phase='glazing';$('#glaze').disabled=true;$('#change-mode').disabled=true;
    const timeline=gsap.timeline({onComplete:()=>{
      if(currentSession!==session)return;
      gameState.phase='ready';showSummary();toast('青花重绽。记忆、裂痕和你的理念，一同留下。');
    }});
    for(const fragment of fragments) {
      timeline.to(fragment.mesh.material.userData.glaze,{value:1,duration:1.3},0);
      timeline.to(fragment.mesh.material.color,{r:1,g:1,b:1,duration:1.3},0);
    }
  };
  async function generateCertificate(download=true){
    if(gameState.phase!=='ready'||exporting)return;
    exporting=true;for(const id of ['download','preview-certificate','reset','again','rechoose','demo'])$('#'+id).disabled=true;
    $('#export-status').textContent='正在绘制证书与裂痕特写…';
    try {
      const pictures=captureRepair({...resources,wrap});
      const result=await exportCertificate($('#poster'),gameState,pictures,{download});
      if(download){app.lastExport=result;$('#export-status').textContent='证书已生成，请在浏览器下载列表查看。';}
      else {
        $('#certificate-preview img').src=result.canvas.toDataURL('image/png');
        $('#certificate-preview').classList.remove('hidden');$('#close-preview').focus({preventScroll:true});
        $('#export-status').textContent='证书预览已生成。';
      }
    }catch(error){$('#export-status').textContent='导出未成功，请重试。';toast('导出失败：'+error.message);}
    finally{exporting=false;for(const id of ['download','preview-certificate','reset','again','rechoose','demo'])$('#'+id).disabled=false;}
  }
  $('#download').onclick=()=>generateCertificate(true);
  $('#preview-certificate').onclick=()=>generateCertificate(false);
  $('#close-preview').onclick=()=>{$('#certificate-preview').classList.add('hidden');$('#preview-certificate').focus({preventScroll:true});};
  function demoStep() {
    if(!demoRunning)return;
    if(demoIndex===fragments.length){finishAssembly();return;}
    const fragment=fragments[demoIndex++],currentSession=session;
    toast(`演示 ${demoIndex}/9：观察归位，然后阅读手记。`);
    demoTimeline=gsap.timeline();
    demoTimeline.to(fragment.mesh.position,{x:fragment.correctPosition.x,y:fragment.correctPosition.y,z:0,duration:.4});
    demoTimeline.to(fragment.mesh.rotation,{z:fragment.correctRotation,duration:.4},0);
    demoTimeline.call(()=>{if(currentSession===session&&demoRunning)attemptSnap(fragment,()=>{if(currentSession===session)demoStep();});});
  }
  $('#demo').onclick=()=>{
    if(exporting||demoRunning)return;
    setUserName(gameState,$('#user-name').value);reset();demoRunning=true;
    $('#demo').disabled=true;$('#archive-toggle').disabled=true;$('#memory-archive').inert=true;
    interaction.clear();demoStep();
  };
  $('#sound').onclick=()=>{sound=!sound;$('#sound').textContent='声音 · '+(sound?'开':'关');$('#sound').setAttribute('aria-pressed',String(sound));if(sound)chime();};
  $('#archive-toggle').onclick=()=>{
    const expanded=$('#memory-archive').classList.toggle('hidden')===false;
    $('#archive-toggle').setAttribute('aria-expanded',String(expanded));$('#archive-toggle').textContent='记忆册 · '+(expanded?'收起':'展开');
  };
  function resize() {
    if(exporting)return;
    const width=wrap.clientWidth,height=wrap.clientHeight;if(!width||!height)return;
    renderer.setSize(width,height);composer.setSize(width,height);
    const aspect=width/height,halfHeight=Math.max(6.2,3.4/aspect);
    camera.top=halfHeight;camera.bottom=-halfHeight;camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.updateProjectionMatrix();
    if(gameState.phase==='playing'&&!demoRunning)for(const fragment of fragments)if(!fragment.locked)confineFragment(fragment,camera);
  }
  new ResizeObserver(resize).observe(wrap);resize();memories.refresh();
  let last=performance.now();
  function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;resources.tick(dt);if(!exporting)composer.render();}
  requestAnimationFrame(frame);
  return {gameState,resources,interaction,memories,fragments,lastExport:null,
    diagnostics:()=>({phase:gameState.phase,repairMode:gameState.repairMode,repairedCount:gameState.repairedCount,
      unlocked:gameState.unlockedStories.length,certificateId:gameState.certificateId,exporting,bloom:bloom.enabled,zFixed:fragments.every(f=>f.mesh.position.z===0)}),reset};
}
