import { REPAIR_PROFILES } from './repair.js';
import { issueCertificate } from './gameState.js';

export function captureRepair({scene,camera,renderer,composer,wrap,ghost,outline,clearEffects}) {
  const saved={left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom};
  const pixelRatio=renderer.getPixelRatio(),ghostVisible=ghost.visible,outlineVisible=outline.visible;
  clearEffects();ghost.visible=false;outline.visible=false;
  function capture(bounds,w,h) {
    Object.assign(camera,bounds);camera.updateProjectionMatrix();
    renderer.setSize(w,h,false);composer.setSize(w,h);
    renderer.render(scene,camera);composer.render();
    return renderer.domElement.toDataURL('image/png');
  }
  try {
    renderer.setPixelRatio(1);composer.setPixelRatio(1);
    const image=capture({left:-3,right:3,top:4.5,bottom:-4.5},600,900);
    const detail=capture({left:-1.2,right:1.2,top:1.3,bottom:-1.1},600,600);
    return {image,detail};
  }finally{
    Object.assign(camera,saved);camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio);composer.setPixelRatio(pixelRatio);
    renderer.setSize(wrap.clientWidth,wrap.clientHeight,false);composer.setSize(wrap.clientWidth,wrap.clientHeight);
    ghost.visible=ghostVisible;outline.visible=outlineVisible;composer.render();
  }
}

export function buildCertificate(poster,state,pictures) {
  const record=issueCertificate(state),profile=REPAIR_PROFILES[state.repairMode];
  // Static markup only: all user data is inserted through textContent.
  poster.innerHTML=`<div class="poster-top">景德镇青花意象 · 数字修复习作</div><h1>碎瓷重圆</h1><div class="poster-sub">修 复 证 书 / CERTIFICATE</div><div class="certificate-art"><img class="whole" alt="修复后的青花瓶"><div class="certificate-detail"><img alt="裂痕局部特写"><span>裂痕特写 · 数字记录</span></div></div><div class="certificate-meta"><div>修复师<span data-field="userName"></span></div><div>修复日期<span data-field="date"></span></div><div>修复方式<span data-field="mode"></span></div><div class="id-row">作品编号<span data-field="id"></span></div></div><h2 data-field="philosophy"></h2><p data-field="text"></p><p class="certificate-story" data-field="story"></p><div class="poster-bottom"><span>八片重逢 · 八段记忆</span><span>完整，不必抹去经历</span></div><small>虚构委托 · 自制纹样 · 数字体验证书，不作为实际文物修复鉴定</small>`;
  const values={...record,mode:profile.label,philosophy:profile.philosophy,text:profile.text,story:profile.story};
  for(const [field,value] of Object.entries(values)) {const target=poster.querySelector(`[data-field="${field}"]`);if(target)target.textContent=value;}
  poster.querySelector('.whole').src=pictures.image;
  poster.querySelector('.certificate-detail img').src=pictures.detail;
  return record;
}

export async function exportCertificate(poster,state,pictures,{download=true}={}) {
  const record=buildCertificate(poster,state,pictures);
  await document.fonts.ready;
  await Promise.all([...poster.querySelectorAll('img')].map(image=>image.decode()));
  const {default:html2canvas}=await import('html2canvas');
  const canvas=await html2canvas(poster,{backgroundColor:'#f1ecdf',scale:2,logging:false,windowWidth:1280,windowHeight:1600});
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('证书图像生成失败');
  if(download) {
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=`碎瓷重圆-${REPAIR_PROFILES[state.repairMode].label}-${record.id}.png`;
    document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  return {record,canvas,blob};
}
