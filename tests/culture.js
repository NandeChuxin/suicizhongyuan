import '../src/immersive.js';
import { CULTURE } from '../src/data/culture.js';
const key='porcelain-reunion-progress-v1', saved=localStorage.getItem(key), lines=[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function check(value,label){if(!value)throw new Error(label);lines.push('PASS '+label);}
try {
  const p=window.porcelain;
  for(const v of p.VESSELS){
    p.openVessel(v);
    check(document.querySelector('#commission-quote').textContent===CULTURE[v.id].wish,v.id+' 委托人物与心愿');
    document.querySelector('#culture-clue').click();
    check(document.querySelector('#drawer-body').textContent.includes(CULTURE[v.id].clue),v.id+' 纹样提示');
  }
  p.openVessel(p.VESSELS[0]);p.go('choice');await wait(1400);
  document.querySelector('#choose-juci').click();document.querySelector('#juci-next').click();
  check(document.querySelector('#juci-next').disabled,'未布钉时禁止继续');
  for(let i=0;i<3;i++)document.querySelector(`[data-pin="${i}"]`).click();
  check(!document.querySelector('#juci-next').disabled,'三枚布钉后允许继续');
  document.querySelector('#juci-next').click();document.querySelector('#juci-next').click();await wait(1500);
  check(p.mode==='juci'&&document.querySelector('#cert-mode').textContent==='锔瓷体验','锔瓷证书正确签发');
  const input=document.querySelector('#cert-note');input.value='<瓷器的记忆>';input.dispatchEvent(new Event('input',{bubbles:true}));
  check(JSON.parse(localStorage.getItem(key)).exhibitNotes.meiping===input.value,'手记持久化');
  document.querySelector('#exhibit').click();
  check(document.querySelector('#drawer-body blockquote').textContent===input.value,'展签安全显示手记');
  check(!document.querySelector('#drawer-body 瓷器的记忆'),'手记未被解析成 HTML');
  // 拦截最终下载以核验实际生成的 PNG，不触发浏览器下载提示。
  const old=HTMLAnchorElement.prototype.click;let png=false;
  HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('文化展签.png')){png=this.href.startsWith('blob:');}else old.call(this);};
  try{document.querySelector('#download-exhibit').click();await wait(800);check(png,'文化展签 PNG 已生成');}finally{HTMLAnchorElement.prototype.click=old;}
}catch(error){lines.push('FAIL '+error.message);}finally{
  if(saved===null)localStorage.removeItem(key);else localStorage.setItem(key,saved);
  const result=document.querySelector('#culture-result');result.hidden=false;result.textContent=lines.join('\n');
}
