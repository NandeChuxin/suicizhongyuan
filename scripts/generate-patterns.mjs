import { mkdir, writeFile } from 'node:fs/promises';
const target=new URL('../public/patterns/',import.meta.url);
await mkdir(target,{recursive:true});
const labels=['留白','一笔','灯影','花叶','裂痕','记录','曲线','日常','重圆'];
for(let i=0;i<9;i++) {
  let motifs='';
  for(let n=0;n<3;n++){
    const x=130+n*170,y=170+(n%2?14:-14),petals=6+i%4;
    let flower=`<circle r="12" fill="#275b80"/>`;
    for(let k=0;k<petals;k++)flower+=`<ellipse cx="0" cy="-36" rx="13" ry="30" transform="rotate(${360*k/petals+i*11})"/>`;
    motifs+=`<g transform="translate(${x} ${y})">${flower}<path d="M-76 38 Q-106 -57 -38 -86 Q43 -101 82 -12 Q94 36 45 62"/><path d="M56 68 Q98 106 133 48"/><ellipse cx="105" cy="75" rx="23" ry="7" transform="rotate(-30 105 75)" fill="#275b80"/></g>`;
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="340" viewBox="0 0 600 340"><title>自制青花纹样 · ${labels[i]}</title><rect width="600" height="340" fill="#eee9db"/><rect x="14" y="14" width="572" height="312" fill="none" stroke="#baaa88"/><g stroke="#275b80" stroke-width="3" fill="none">${motifs}<path d="M35 48 H565 M35 55 H565 M35 279 H565 M35 286 H565"/></g><text x="300" y="311" text-anchor="middle" font-family="serif" font-size="14" fill="#846f4b">纹样习作 ${String(i+1).padStart(2,'0')} · ${labels[i]}</text></svg>`;
  await writeFile(new URL(`memory-${String(i+1).padStart(2,'0')}.svg`,target),svg);
}
console.log('已生成 9 张原创纹样 SVG。');
