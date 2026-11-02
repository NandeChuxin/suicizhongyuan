import * as THREE from 'three';
import { gsap } from 'gsap';
import { game } from '../src/main.js';
import { confineFragment } from '../src/modules/fragments.js';
import { captureRepair, buildCertificate } from '../src/modules/certificate.js';

const $=s=>document.querySelector(s),results=$('#test-results');
function assert(value,message){if(!value)throw new Error(message);}
function pass(message){const li=document.createElement('li');li.textContent='✓ '+message;results.append(li);}
function fastForward(){gsap.globalTimeline.time(gsap.globalTimeline.time()+3,false);}
async function waitUntil(predicate,label,timeout=12000){const start=Date.now();while(!predicate()){if(Date.now()-start>timeout)throw new Error('等待超时：'+label);await new Promise(resolve=>setTimeout(resolve,60));}}

$('#run-tests').onclick=async()=>{
  $('#run-tests').disabled=true;results.replaceChildren();$('#test-status').textContent='正在测试…';
  try {
    assert(game,'WebGL 未能创建');
    const {fragments,resources,gameState,interaction}=game,{camera,renderer,scene}=resources,canvas=renderer.domElement;
    $('#start').click();assert(gameState.phase==='commission','委托页状态');
    $('#user-name').value='测试修复师';$('#begin').click();
    assert(gameState.phase==='playing'&&gameState.userName==='测试修复师','昵称与委托流程');
    assert(fragments.every(f=>f.mesh.position.z===0),'散落 Z 不固定');pass('开始 → 委托 → 昵称 → 碎片散落');
    $('#demo').click();fastForward();
    assert(gameState.repairedCount===1&&!$('#memory-layer').classList.contains('hidden'),'演示首片未打开手记');
    $('#memory-reset').click();fastForward();
    assert(gameState.repairedCount===0&&gameState.unlockedStories.length===0&&!game.memories.isOpen(),'从手记退出未清空演示');
    assert(!$('#demo').disabled,'演示退出后无法再次开始');pass('手记卡可直接退出演示，重置不会留下旧锁定或旧回调');

    function samplePoint(fragment) {
      scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      const p=fragment.mesh.geometry.attributes.position;
      let best=0,maxArea=0;
      for(let i=0;i<p.count;i+=3){const area=Math.abs((p.getX(i+1)-p.getX(i))*(p.getY(i+2)-p.getY(i))-(p.getY(i+1)-p.getY(i))*(p.getX(i+2)-p.getX(i)));if(area>maxArea){maxArea=area;best=i;}}
      return new THREE.Vector3((p.getX(best)+p.getX(best+1)+p.getX(best+2))/3,(p.getY(best)+p.getY(best+1)+p.getY(best+2))/3,0).applyMatrix4(fragment.mesh.matrixWorld);
    }
    function client(point) {
      const rect=canvas.getBoundingClientRect(),ndc=point.clone().project(camera);
      return {clientX:rect.left+(ndc.x+1)/2*rect.width,clientY:rect.top+(1-ndc.y)/2*rect.height};
    }
    function pointer(type,point,extra={}) {
      canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:41,pointerType:'touch',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,...client(point),...extra}));
    }
    for(const [index,fragment] of fragments.entries()) {
      // Deterministic initial transforms only; all locks go through the real interaction handlers.
      fragment.mesh.position.set(index%2?.3:-.3,4.4,0);fragment.mesh.rotation.z=Math.PI/6;
      fragment.mesh.renderOrder=900;confineFragment(fragment,camera);
      let point=samplePoint(fragment),start=fragment.mesh.position.clone();
      pointer('pointerdown',point);assert(interaction.selected()===fragment,'Raycaster 拾取错误');
      assert(fragment.mesh.position.distanceTo(start)<1e-6,'按下时出现瞬移');
      const moved=point.clone().add(new THREE.Vector3(.12,-.13,0));
      pointer('pointermove',moved);pointer('pointerup',moved);
      assert(Math.abs(fragment.mesh.position.x-start.x-.12)<1e-5,'触屏拖动偏移不正确');
      assert(!fragment.locked,'错误位置被吸附');
      $('#right').click();$('#right').click();
      assert(Math.abs(fragment.mesh.rotation.z)<1e-7,'旋转按钮未按 15 度工作');
      if(index===0) {
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'q'}));assert(Math.abs(fragment.mesh.rotation.z-Math.PI/12)<1e-7,'Q 旋转失败');
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'e'}));assert(Math.abs(fragment.mesh.rotation.z)<1e-7,'E 旋转失败');
        point=samplePoint(fragment);pointer('pointerdown',point,{pointerType:'mouse',button:2,buttons:2});
        const pixel=client(point);
        canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:41,pointerType:'mouse',buttons:2,clientX:pixel.clientX+Math.PI/12/.012,clientY:pixel.clientY}));
        pointer('pointerup',point,{pointerType:'mouse',button:2});
        assert(Math.abs(fragment.mesh.rotation.z-Math.PI/12)<1e-6,'右键旋转失败');$('#right').click();
        pass('真实 Raycaster 拾取、touch 拖拽无瞬移、Q/E 与右键旋转');
        const before=fragment.mesh.rotation.z;
        $('#user-name').dispatchEvent(new KeyboardEvent('keydown',{key:'q',bubbles:true}));
        assert(fragment.mesh.rotation.z===before,'在昵称输入框按 Q 误触旋转');
        point=samplePoint(fragment);pointer('pointerdown',point);pointer('pointercancel',point);
        assert(!interaction.dragging()&&!fragment.locked,'pointercancel 未取消拖拽');
        pass('输入框按键不误触玩法，pointercancel 正常释放');
      }
      point=samplePoint(fragment);const delta=fragment.correctPosition.clone().sub(fragment.mesh.position);
      pointer('pointerdown',point);pointer('pointermove',point.clone().add(delta));pointer('pointerup',point.clone().add(delta));
      assert(fragment.locked&&fragment.revealed,`第 ${index+1} 片未锁定`);
      assert(gameState.repairedCount===index+1&&gameState.unlockedStories.length===index+1,'计数不一致');
      assert(!$('#memory-layer').classList.contains('hidden'),'手记未弹出');
      assert($('#memory-layer img').getAttribute('src').includes(fragment.storyId),'纹样绑定错误');
      await $('#memory-layer img').decode();
      assert($('#memory-layer img').naturalWidth===600,'手记纹样加载失败');
      assert(fragment.mesh.position.z===0,'Z 轴发生移动');
      $('#memory-continue').click();fastForward();
    }
    assert(gameState.phase==='choice','最终没有进入修复抉择');pass('九片均通过拖拽锁定，每片解锁对应手记和图片，完成判定正确');
    $('#archive-toggle').click();assert($('#memory-archive').querySelectorAll('button:not(:disabled)').length===9,'记忆册漏项');
    $('#memory-archive button').click();assert(!$('#memory-layer').classList.contains('hidden'),'记忆无法回看');$('#memory-continue').click();
    pass('9/9 记忆册可回看');

    $('#traditional').click();assert(gameState.repairMode==='traditional'&&!resources.bloom.enabled,'传统模式 Bloom 未关闭');
    assert(fragments.every(f=>f.seams.line.visible&&!f.seams.gold.visible),'传统裂线显示错误');
    const traditionStory=$('#story').textContent;$('#glaze').click();fastForward();
    assert(gameState.phase==='ready'&&gameState.certificateId,'证书未签发');
    const oldId=gameState.certificateId,pictures=captureRepair({...resources,wrap:$('#canvas-wrap')});
    buildCertificate($('#poster'),gameState,pictures);
    assert($('#poster [data-field="userName"]').textContent==='测试修复师','证书昵称缺失');
    assert($('#poster [data-field="date"]').textContent,'证书日期缺失');
    assert($('#poster img').naturalWidth===600||$('#poster img').src.startsWith('data:image/png'),'3D 截图缺失');
    assert($('#poster').querySelectorAll('img').length===2,'裂痕特写缺失');pass('传统修复：浅灰线、无 Bloom，证书字段与裂痕特写完整');

    const safeState={...gameState,userName:'<img src=x onerror=1>',certificateId:'TEST-SAFE'};
    buildCertificate($('#poster'),safeState,pictures);
    assert($('#poster [data-field="userName"]').textContent===safeState.userName&&$('#poster').querySelectorAll('img').length===2,'昵称被作为 HTML 执行');
    pass('昵称按纯文本写入，无法插入 HTML');

    $('#rechoose').click();$('#kintsugi').click();
    assert(gameState.repairMode==='kintsugi'&&resources.bloom.enabled,'金缮模式未启用');
    assert(fragments.every(f=>f.seams.gold.visible&&!f.seams.line.visible),'金缮裂线未切换');
    assert($('#story').textContent!==traditionStory,'两种模式文案相同');
    $('#glaze').click();fastForward();assert(gameState.certificateId!==oldId,'切换方式后未重新签发');
    pass('金缮修复：更宽金色裂线与 Bloom，文案和证书理念改变');

    $('#download').click();await waitUntil(()=>game.lastExport||!game.diagnostics().exporting,'海报导出',25000);
    assert(game.lastExport,$('#export-status').textContent);
    assert(game.lastExport.canvas.width===1280,'证书分辨率不正确');
    assert(game.lastExport.blob.size>30000,'导出的图像为空');
    assert(game.lastExport.record.id===gameState.certificateId,'下载编号不一致');
    pass(`html2canvas PNG 实际导出：${game.lastExport.canvas.width}×${game.lastExport.canvas.height}，${Math.round(game.lastExport.blob.size/1024)} KB`);
    $('#test-status').textContent='全部通过：核心玩法 → 记忆 → 抉择 → 修复证书';
    document.title='验收通过 · 碎瓷重圆';
  }catch(error){$('#test-status').textContent='验收失败：'+error.message;document.title='验收失败 · 碎瓷重圆';}
  finally{$('#run-tests').disabled=false;}
};
