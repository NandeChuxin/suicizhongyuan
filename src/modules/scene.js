import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SILHOUETTE } from './fragments.js';

export function makePorcelainTexture() {
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=1200;
  const ctx=canvas.getContext('2d'),shade=ctx.createLinearGradient(0,0,768,0);
  shade.addColorStop(0,'#c5c6bc');shade.addColorStop(.3,'#faf4e5');shade.addColorStop(.65,'#eee7d4');shade.addColorStop(1,'#a3b3b6');
  ctx.fillStyle=shade;ctx.fillRect(0,0,768,1200);ctx.strokeStyle='#245b88';ctx.lineWidth=5;
  for(let row=0;row<5;row++)for(let col=0;col<4;col++) {
    ctx.save();ctx.translate(col*220+(row%2)*95-35,row*245+130);
    ctx.beginPath();ctx.arc(0,0,94,0,Math.PI*1.8);ctx.stroke();
    for(let petal=0;petal<8;petal++){ctx.save();ctx.rotate(petal*Math.PI/4);ctx.beginPath();ctx.ellipse(0,-34,13,31,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
    ctx.fillStyle='#245b88';ctx.beginPath();ctx.arc(0,0,12,0,7);ctx.fill();
    for(let leaf=0;leaf<5;leaf++){ctx.save();ctx.rotate(leaf*1.3);ctx.beginPath();ctx.ellipse(65,0,21,7,.7,0,7);ctx.fill();ctx.restore();}
    ctx.restore();
  }
  // 海水江崖纹：连续波峰与山石构成瓶足的“福山寿海”母题。
  ctx.lineWidth=4;
  for(let band=0;band<2;band++)for(let x=-80;x<850;x+=96){
    const y=930+band*42;
    ctx.beginPath();ctx.arc(x,y,48,Math.PI,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x+18,y);ctx.lineTo(x+48,y-55);ctx.lineTo(x+78,y);ctx.stroke();
  }
  // 回纹带：折线连续而不闭合，象征时间与记忆的延续。
  ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,180);
  for(let x=0;x<768;x+=32){ctx.lineTo(x+16,180);ctx.lineTo(x+16,198);ctx.lineTo(x+32,198);ctx.lineTo(x+32,180);}ctx.stroke();
  for(const y of [70,90,1040,1060,1100]){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(768,y);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

export function configureGlaze(fragment) {
  const material=fragment.mesh.material;
  material.userData.glaze={value:.68};
  material.onBeforeCompile=shader=>{
    shader.uniforms.uGlaze=material.userData.glaze;
    shader.fragmentShader='uniform float uGlaze;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\ndiffuseColor.rgb = mix(vec3(0.80, 0.82, 0.78), diffuseColor.rgb, uGlaze);');
  };
  material.customProgramCacheKey=()=> 'porcelain-glaze-v2';
}

export function createScene(wrap) {
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-7,7,6,-6,.1,100);camera.position.z=20;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x183340,1);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.domElement.setAttribute('aria-label','青花瓷修复画布');wrap.append(renderer.domElement);
  const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
  const bloom=new UnrealBloomPass(new THREE.Vector2(800,800),.3,.35,1.05);composer.addPass(bloom);composer.addPass(new OutputPass());
  const contour=SILHOUETTE.map(p=>new THREE.Vector2(...p));
  const ghost=new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(contour)),new THREE.MeshBasicMaterial({color:0xa6bac0,transparent:true,opacity:.08,side:THREE.DoubleSide}));
  ghost.position.z=-.3;scene.add(ghost);
  const outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(contour.map(p=>new THREE.Vector3(p.x,p.y,-.2))),new THREE.LineBasicMaterial({color:0xb9c5ba,transparent:true,opacity:.35}));scene.add(outline);
  const positions=new Float32Array(90*3);
  for(let i=0;i<90;i++)positions.set([(Math.random()-.5)*16,(Math.random()-.5)*14,-1],i*3);
  const dust=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(positions,3)),new THREE.PointsMaterial({color:0xb9a578,size:.023,transparent:true,opacity:.3}));scene.add(dust);
  const effects=[];
  function emit(position,count=24) {
    const data=new Float32Array(count*3),velocities=[];
    for(let i=0;i<count;i++){data.set([position.x,position.y,1],i*3);velocities.push([(Math.random()-.5)*1.1,Math.random()*1.3+.3]);}
    const points=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(data,3)),new THREE.PointsMaterial({color:0xffd58b,size:.05,transparent:true,depthWrite:false}));
    scene.add(points);effects.push({points,velocities,life:1.3});
  }
  function clearEffects(){for(const effect of effects){scene.remove(effect.points);effect.points.geometry.dispose();effect.points.material.dispose();}effects.length=0;}
  function tick(dt) {
    dust.rotation.z+=dt*.007;
    for(let i=effects.length-1;i>=0;i--){const effect=effects[i];effect.life-=dt;
      const attr=effect.points.geometry.attributes.position;
      for(let j=0;j<attr.count;j++){attr.array[j*3]+=effect.velocities[j][0]*dt;attr.array[j*3+1]+=effect.velocities[j][1]*dt;}
      attr.needsUpdate=true;effect.points.material.opacity=Math.max(0,effect.life/1.3);
      if(effect.life<=0){scene.remove(effect.points);effect.points.geometry.dispose();effect.points.material.dispose();effects.splice(i,1);}
    }
  }
  return {scene,camera,renderer,composer,bloom,ghost,outline,emit,tick,clearEffects};
}
