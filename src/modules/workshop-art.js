// 原创 Canvas 场景：只绘制一次；景深位移由外层 CSS transform 完成。
export function paintWorkshop(canvas) {
  canvas.width=1600;canvas.height=1000;
  const c=canvas.getContext('2d');let seed=1725;
  const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const glow=(x,y,r,color)=>{const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);};
  c.fillStyle='#111d2b';c.fillRect(0,0,1600,1000);
  glow(830,330,660,'#44658088');
  // 圆拱窗、层叠远山，形成窑坊纵深。
  c.save();c.beginPath();c.arc(820,420,440,Math.PI,0);c.lineTo(1260,780);c.lineTo(380,780);c.closePath();c.clip();
  c.fillStyle='#526479';c.fillRect(380,0,880,800);
  for(let k=0;k<5;k++){c.beginPath();c.moveTo(350,780);for(let x=350;x<1300;x+=20)c.lineTo(x,410+k*65+Math.sin(x/100+k)*40+Math.cos(x/57)*22);c.lineTo(1300,800);c.closePath();c.fillStyle=['#71808b','#596e81','#425b73','#30485e','#23394d'][k];c.fill();}
  c.restore();c.strokeStyle='#0b131f';c.lineWidth=27;c.beginPath();c.arc(820,420,450,Math.PI,0);c.stroke();
  for(const x of [165,335,1280,1450]){c.fillStyle='#0b111b';c.fillRect(x,0,22,830);c.fillStyle='#c9a96118';c.fillRect(x+20,0,2,830);}
  for(const x of [50,1300]){c.strokeStyle='#0b131f';c.lineWidth=8;for(let y=90;y<690;y+=95){c.strokeRect(x,y,230,70);c.strokeRect(x+55,y-23,115,115);}}
  // 暖灯只作局部照明，青花蓝仍是场景主色。
  for(const [x,y] of [[270,340],[1400,400]]){glow(x,y+40,210,'#c9a96138');c.strokeStyle='#121721';c.lineWidth=4;c.beginPath();c.moveTo(x,0);c.lineTo(x,y);c.stroke();c.fillStyle='#101b28';c.fillRect(x-27,y,54,100);glow(x,y+48,42,'#f5dfaa99');c.fillStyle='#e6c185';c.fillRect(x-15,y+14,30,69);c.strokeStyle='#665139';c.lineWidth=5;c.strokeRect(x-24,y,48,99);}
  c.fillStyle='#101927';c.fillRect(0,790,1600,210);
  for(let i=0;i<100;i++){const x=random()*1600,y=810+random()*190;c.strokeStyle=`rgba(143,164,180,${random()*.12})`;c.beginPath();c.moveTo(x,y);c.lineTo(x+60+random()*150,y-random()*5);c.stroke();}
  // 椭圆石台与散落瓷片。
  c.fillStyle='#080f1a';c.beginPath();c.ellipse(810,856,290,48,0,0,Math.PI*2);c.fill();c.fillStyle='#354556';c.beginPath();c.ellipse(810,833,276,38,0,0,Math.PI*2);c.fill();c.strokeStyle='#94a1a544';c.lineWidth=2;c.stroke();
  for(let i=0;i<24;i++){const x=100+random()*1400,y=850+random()*120,s=8+random()*22;c.save();c.translate(x,y);c.rotate(random()*6);c.shadowColor='#000';c.shadowBlur=14;c.shadowOffsetY=8;c.beginPath();c.moveTo(-s,0);c.lineTo(s*.4,-s*.5);c.lineTo(s,s*.3);c.lineTo(-s*.3,s*.6);c.closePath();c.fillStyle='#bbc4c8';c.fill();c.clip();c.shadowBlur=0;c.strokeStyle='#2c4a7c';c.lineWidth=3;c.beginPath();c.arc(0,0,s*.65,0,6.3);c.stroke();c.restore();}
  for(let i=0;i<160;i++){c.fillStyle=`rgba(201,169,97,${random()*.55})`;c.fillRect(random()*1600,random()*970,1+random()*2,1+random()*2);}
  const v=c.createRadialGradient(820,440,200,820,440,1000);v.addColorStop(0,'transparent');v.addColorStop(1,'#070e1be0');c.fillStyle=v;c.fillRect(0,0,1600,1000);
}

// 首页月洞背景：圆窗内的青花水墨远山与楼阁剪影。零素材，一次绘制。
// 画面为方形，实际显示由外层 .moon 的圆形裁切决定；四周自带暗角以融入墨蓝底色。
export function paintLandscape(canvas){
  canvas.width=1000;canvas.height=1000;
  const c=canvas.getContext('2d');let seed=925;
  const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  // 底色：晨雾微光，越靠中心越亮。
  const base=c.createRadialGradient(470,410,50,500,500,640);
  base.addColorStop(0,'#eef3f7');base.addColorStop(.55,'#ccd8e2');base.addColorStop(1,'#a9b9ca');
  c.fillStyle=base;c.fillRect(0,0,1000,1000);
  // 层叠远山：越远越淡，色相压在青花蓝灰一带。
  const ridge=(y,amp,color,phase)=>{c.beginPath();c.moveTo(-20,1010);for(let x=-20;x<=1020;x+=16)c.lineTo(x,y+Math.sin(x/155+phase)*amp+Math.sin(x/62+phase*2)*amp*.35);c.lineTo(1020,1010);c.closePath();c.fillStyle=color;c.fill();};
  ridge(548,30,'#8398ae99',.4);
  ridge(592,42,'#607a9366',1.1);
  ridge(646,52,'#46617c66',2.0);
  ridge(706,58,'#2f4a6644',2.8);
  // 雾带：把山层轻轻隔开，形成远意。
  for(let i=0;i<5;i++){const y=556+i*48;const g=c.createLinearGradient(0,y-26,0,y+26);g.addColorStop(0,'#f4f8fbee');g.addColorStop(.5,'#dfe8ef7a');g.addColorStop(1,'#f4f8fb00');c.fillStyle=g;c.fillRect(0,y-26,1000,52);}
  // 楼阁剪影：三层飞檐塔 + 台基，一大一小拉开纵深。
  const pagoda=(x,y,s)=>{c.fillStyle='#2b3f57cc';for(let k=0;k<3;k++){const w=s*(1.55-k*.3),yy=y-k*s*.8;c.beginPath();c.moveTo(x-w,yy);c.quadraticCurveTo(x,yy-s*.32,x+w,yy);c.lineTo(x+w*.76,yy+s*.16);c.lineTo(x-w*.76,yy+s*.16);c.closePath();c.fill();c.fillRect(x-s*.15,yy-s*.56,s*.3,s*.62);}c.fillRect(x-s*.5,y+s*.12,s,s*.5);};
  pagoda(686,706,46);
  pagoda(258,730,30);
  // 近景松枝：右下压角，稳住画面。
  c.strokeStyle='#24384ecc';c.lineWidth=7;c.beginPath();c.moveTo(126,1010);c.quadraticCurveTo(152,822,112,662);c.stroke();
  c.lineWidth=3;for(let i=0;i<9;i++){const yy=698+i*30;c.beginPath();c.moveTo(120+i*1.5,yy);c.lineTo(58-i*3,yy-16);c.moveTo(122+i*1.5,yy);c.lineTo(192+i*2,yy-20);c.stroke();}
  // 飞鸟
  c.strokeStyle='#2b3f57aa';c.lineWidth=2.4;for(const [bx,by] of [[432,300],[474,278],[516,306],[566,286]]){c.beginPath();c.moveTo(bx-9,by);c.quadraticCurveTo(bx,by-7,bx+9,by);c.moveTo(bx+9,by);c.quadraticCurveTo(bx+18,by-5,bx+26,by+1);c.stroke();}
  // 纸纹颗粒
  for(let i=0;i<2600;i++){c.fillStyle=rand()>.5?'#ffffff22':'#3b556622';c.fillRect(rand()*1000,rand()*1000,1+rand()*2,1);}
  // 暗角：与站点的墨蓝底色衔接。
  const vg=c.createRadialGradient(500,500,300,500,500,505);
  vg.addColorStop(0,'#0b152900');vg.addColorStop(1,'#0b1529cc');
  c.fillStyle=vg;c.fillRect(0,0,1000,1000);
}

// 修复师篆印：白文姓名章（朱砂印底 + 暖白阴刻字），印泥颗粒与石章磨损由噪声模拟。
// 字数自适应：1 字居中、2-3 字竖读、4 字按传统「右上 → 右下 → 左上 → 左下」读序。
export function sealImage(name='',size=256){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const c=canvas.getContext('2d');
  let chars=Array.from(String(name).normalize('NFC')).filter(ch=>/[\u3400-\u9fff]/.test(ch)).slice(0,4);
  if(!chars.length)chars=Array.from('惜物重生');
  // 以名字派生种子：同一名字每次生成同一枚印章。
  let seed=7;for(const ch of chars)seed=(seed*131+ch.codePointAt(0))>>>0;
  const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const pad=size*.07,box=size-pad*2,r=size*.05;
  // 印底：朱砂红，四角略圆钝。
  c.fillStyle='#b23a2e';
  c.beginPath();c.moveTo(pad+r,pad);c.arcTo(pad+box,pad,pad+box,pad+box,r);c.arcTo(pad+box,pad+box,pad,pad+box,r);c.arcTo(pad,pad+box,pad,pad,r);c.arcTo(pad,pad,pad+box,pad,r);c.closePath();c.fill();
  // 印泥颗粒：随机细点缺失，避免纯色塑料感。
  c.save();c.beginPath();c.rect(pad,pad,box,box);c.clip();
  for(let i=0;i<size*26;i++){c.fillStyle=rand()>.5?'rgba(246,239,226,.16)':'rgba(120,40,32,.20)';c.fillRect(rand()*size,rand()*size,1+rand()*3,1+rand()*3);}
  c.restore();
  // 白文：字取印泥未着处的暖白。
  c.fillStyle='#f6efe2';c.textAlign='center';c.textBaseline='middle';
  const n=chars.length;
  if(n===1){c.font=`${Math.round(box*.82)}px "Songti SC","SimSun",serif`;c.fillText(chars[0],size/2,size*.5+size*.01);}
  else if(n<=3){const cell=box/n;c.font=`${Math.round(cell*.8)}px "Songti SC","SimSun",serif`;chars.forEach((ch,i)=>c.fillText(ch,size/2,pad+cell*(i+.5)));}
  else{const cell=box/2;c.font=`${Math.round(cell*.8)}px "Songti SC","SimSun",serif`;const order=[[1,0],[1,1],[0,0],[0,1]];chars.forEach((ch,i)=>{const [col,row]=order[i];c.fillText(ch,pad+cell*(col+.5),pad+cell*(row+.5));});}
  return canvas.toDataURL('image/png');
}

// 程序化二维码占位框：三个定位角 + 定时图案 + 由种子决定的数据模块。
// 这不是可扫描的真二维码，只作分享入口的视觉占位；正式码请放置 public/share-qr.png 覆盖。
export function qrPlaceholder(size=256,seed=1725){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const c=canvas.getContext('2d');
  const modules=25,quiet=2,cell=size/(modules+quiet*2);
  let seedState=seed>>>0;const rand=()=>((seedState=(seedState*1664525+1013904223)>>>0)/4294967296);
  const dark='#1a2332',light='#fdfcf8';
  c.fillStyle=light;c.fillRect(0,0,size,size);
  const px=(col,row,w=1,h=1,color=dark)=>{c.fillStyle=color;c.fillRect((col+quiet)*cell,(row+quiet)*cell,w*cell,h*cell);};
  const finder=(col,row)=>{
    for(let i=0;i<7;i++)px(col,row+i,7,1,dark);
    for(let i=1;i<6;i++)px(col+1,row+i,5,1,light);
    for(let i=2;i<5;i++)px(col+2,row+i,3,1,dark);
  };
  finder(0,0);finder(modules-7,0);finder(0,modules-7);
  for(let i=8;i<modules-8;i++){px(i,6,1,1,i%2?dark:light);px(6,i,1,1,i%2?dark:light);}
  const inFinder=(col,row)=>(col<8&&row<8)||(col>modules-9&&row<8)||(col<8&&row>modules-9);
  for(let row=0;row<modules;row++)for(let col=0;col<modules;col++){
    if(inFinder(col,row)||row===6||col===6)continue;
    if(rand()>.5)px(col,row);
  }
  // 中心一枚朱砂印，点明这是本项目自己的分享码位。
  c.fillStyle='#b0432e';c.fillRect(size*.42,size*.42,size*.16,size*.16);
  c.fillStyle=light;c.font=`${Math.round(size*.08)}px "Songti SC","SimSun",serif`;c.textAlign='center';c.textBaseline='middle';c.fillText('瓷',size/2,size*.5+size*.005);
  return canvas;
}

export function kilnMemory(index=0){
  const canvas=document.createElement('canvas');canvas.width=650;canvas.height=680;const c=canvas.getContext('2d');let seed=71+index;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  c.fillStyle='#b8a584';c.fillRect(0,0,650,680);
  // 窑口木刻式插图，不冒充历史照片。
  c.fillStyle='#514b40';c.beginPath();c.moveTo(30,590);c.lineTo(30,300);c.quadraticCurveTo(325,-50,620,300);c.lineTo(620,590);c.fill();
  c.fillStyle='#282c29';c.beginPath();c.moveTo(115,590);c.lineTo(115,330);c.quadraticCurveTo(325,100,540,330);c.lineTo(540,590);c.fill();
  for(let row=0;row<9;row++)for(let col=0;col<11;col++){c.strokeStyle='#b9ab8840';c.strokeRect(col*65+(row%2)*30,90+row*58,61,53);}
  for(let i=0;i<35;i++){const x=95+rand()*470,y=365+rand()*230,s=12+rand()*20;c.fillStyle=rand()>.5?'#c0b18e':'#968a71';c.beginPath();c.ellipse(x,y,s*.7,s,0,0,6.3);c.fill();c.fillRect(x-s*.25,y-s*1.2,s*.5,s*.4);c.strokeStyle='#514b40';c.stroke();}
  c.fillStyle='#5d5748';c.fillRect(0,600,650,80);
  for(let i=0;i<11000;i++){c.fillStyle=rand()>.5?'#f5e4b416':'#211d191a';c.fillRect(rand()*650,rand()*680,1+rand()*3,1);}
  c.fillStyle='#e6d6b3';c.font='18px SimSun';c.fillText('窑火与匠人 · 原创记忆插图',170,647);
  return canvas.toDataURL();
}
