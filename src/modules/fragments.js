import * as THREE from 'three';
import { Delaunay } from 'd3-delaunay';
import { createFractureVisuals } from './repair.js';
import { MEIPING_OUTLINE as SILHOUETTE, generateSites } from '../data/vessels.js';

export { SILHOUETTE };

// 康熙梅瓶的原始八片站点（保持与既有测试、存档兼容）。
export const SITES = [[-.08,3.12],[-.9,1.72],[.92,1.58],[-1.28,.22],[.34,.22],[1.32,-.62],[-.95,-1.82],[.45,-2.35]];

const MEIPING_BBOX = [-2.3, -3.6, 2.3, 3.9];

// 显式传入 outline 时按该轮廓自身取包围盒：宽体器型（如云龙罐）远超梅瓶口径，
// 沿用梅瓶 bbox 会让 Voronoi 裁剪框装不下站点，cellPolygon 返回 null。
function outlineBounds(outline) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of outline) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function clip(poly,a,b) {
  const result=[],cross=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  for(let i=0;i<poly.length;i++) {
    const p=poly[i],q=poly[(i+1)%poly.length],cp=cross(p),cq=cross(q);
    if(cp>=-1e-8)result.push(p);
    if((cp>=0)!==(cq>=0)) {const t=cp/(cp-cq);result.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
  }
  return result;
}

function area(poly) {
  return poly.reduce((n,a,i)=>{const b=poly[(i+1)%poly.length];return n+a[0]*b[1]-b[0]*a[1];},0)/2;
}

function intersectTriangle(triangle,cell) {
  let result=triangle;
  const ccw=area(cell)<0?[...cell].reverse():cell;
  for(let i=0;i<ccw.length&&result.length;i++)result=clip(result,ccw[i],ccw[(i+1)%ccw.length]);
  return result;
}

// Clip a cell edge against one convex triangle using the segment parameter t.
function clipSegment(a,b,triangle) {
  const ccw=area(triangle)<0?[...triangle].reverse():triangle;
  let start=0,end=1;
  for(let i=0;i<3;i++) {
    const c=ccw[i],d=ccw[(i+1)%3];
    const cross=p=>(d[0]-c[0])*(p[1]-c[1])-(d[1]-c[1])*(p[0]-c[0]);
    const ca=cross(a),cb=cross(b);
    if(ca<0&&cb<0)return null;
    if(ca<0)start=Math.max(start,ca/(ca-cb));
    if(cb<0)end=Math.min(end,ca/(ca-cb));
  }
  return end-start>1e-7?[start,end]:null;
}

// 参数化碎片生成：任何器型轮廓 + 站点 + 难度旋转都可走同一套切割管线。
// options = { outline, sites, bbox, rotationMap }；缺省为康熙梅瓶（兼容既有测试）。
export function createFragments(texture, stories, options = {}) {
  const outline = options.outline ?? SILHOUETTE;
  const contour = outline.map(p=>new THREE.Vector2(...p));
  // 包围盒一律由轮廓自身推出：轮廓换过（2026-10-17 六件改为模型反推）后，写死梅瓶口径会裁掉器口/圈足。
  const bbox = options.bbox ?? outlineBounds(outline);
  const sites = options.sites ?? SITES;
  const rotationMap = options.rotationMap ?? {};
  const [minX,minY,maxX,maxY]=bbox,w=maxX-minX,h=maxY-minY;
  const triangles=THREE.ShapeUtils.triangulateShape(contour,[]).map(t=>t.map(i=>outline[i]));
  const delaunay=Delaunay.from(sites);
  const voronoi=delaunay.voronoi([minX-.05,minY-.05,maxX+.05,maxY+.05]);
  return sites.map((origin,id)=>{
    const cell=Array.from(voronoi.cellPolygon(id)).slice(0,-1),vertices=[],uv=[],edges=[];
    for(const triangle of triangles) {
      const poly=intersectTriangle(triangle,cell);
      for(let i=1;i<poly.length-1;i++)for(const p of [poly[0],poly[i],poly[i+1]]) {
        vertices.push(p[0]-origin[0],p[1]-origin[1],0);
        uv.push((p[0]-minX)/w,(p[1]-minY)/h);
      }
    }
    for(let i=0;i<cell.length;i++) {
      const a=cell[i],b=cell[(i+1)%cell.length];
      // 包围盒边缘不是断口；真正的器形边缘仍是瓷面。
      if((Math.abs(a[0]-b[0])<1e-7&&Math.abs(Math.abs(a[0]-minX)-w)<1e-7)||
        (Math.abs(a[1]-b[1])<1e-7&&(Math.abs(a[1]-minY)<1e-7||Math.abs(a[1]-maxY)<1e-7)))continue;
      for(const triangle of triangles) {
        const range=clipSegment(a,b,triangle);
        if(range)for(const t of range)edges.push(a[0]+(b[0]-a[0])*t-origin[0],a[1]+(b[1]-a[1])*t-origin[1],.025);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.computeVertexNormals();geometry.computeBoundingBox();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,color:0xbac4c6,side:THREE.DoubleSide}));
    mesh.position.set(...origin,0);mesh.renderOrder=id;mesh.userData.id=id;
    const seams=createFractureVisuals(edges);mesh.add(seams.group);
    return {mesh,seams,correctPosition:new THREE.Vector3(...origin,0),
      correctRotation:THREE.MathUtils.degToRad(rotationMap[id]??0),
      locked:false,adjacent:Array.from(delaunay.neighbors(id)),storyId:stories[id]?.id??`fragment-${id}`,revealed:false};
  });
}

export function confineFragment(fragment,camera) {
  const bounds=fragment.mesh.geometry.boundingBox,a=fragment.mesh.rotation.z,c=Math.cos(a),s=Math.sin(a);
  const corners=[[bounds.min.x,bounds.min.y],[bounds.min.x,bounds.max.y],[bounds.max.x,bounds.min.y],[bounds.max.x,bounds.max.y]];
  const xs=corners.map(([x,y])=>x*c-y*s),ys=corners.map(([x,y])=>x*s+y*c);
  fragment.mesh.position.x=THREE.MathUtils.clamp(fragment.mesh.position.x,camera.left-Math.min(...xs)+.12,camera.right-Math.max(...xs)-.12);
  fragment.mesh.position.y=THREE.MathUtils.clamp(fragment.mesh.position.y,camera.bottom-Math.min(...ys)+.12,camera.top-Math.max(...ys)-.12);
  fragment.mesh.position.z=0;
}

// 散落：碎片均分上下两排，随机旋转 ±180°；自适应任意碎片数与画幅宽度。
export function scatterFragments(fragments,camera,random=Math.random) {
  const perRow=Math.ceil(fragments.length/2);
  for(const [index,fragment] of fragments.entries()) {
    const col=index%perRow,row=index%2;
    fragment.mesh.rotation.z=(random()*2-1)*Math.PI;
    const x=(perRow===1?0:(col/(perRow-1)-.5)*2*.82)*camera.right+(random()-.5)*.3;
    const y=(row?[-.94,-.92]:[.94,.95])[col%2]*Math.max(4.6,Math.abs(camera.top))+ (random()-.5)*.35;
    fragment.mesh.position.set(x,y,0);fragment.mesh.renderOrder=index;
    confineFragment(fragment,camera);
  }
}
