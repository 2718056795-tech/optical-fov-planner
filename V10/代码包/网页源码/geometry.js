/* First-order central projection and convex footprint intersection. Units: mm, deg. */
(function(root){
'use strict';
const EPS=1e-9, rad=x=>x*Math.PI/180;
const add=(a,b)=>a.map((x,i)=>x+b[i]), mul=(a,s)=>a.map(x=>x*s), dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a), distance=(a,b)=>norm(a.map((x,i)=>x-b[i]));
function basis(d){const y=rad(d.yaw),p=rad(d.pitch),r=rad(d.roll); const axis=[Math.sin(y)*Math.cos(p),Math.sin(p),-Math.cos(y)*Math.cos(p)];const u=[Math.cos(y),0,Math.sin(y)],v=cross(u,axis);return {axis,u:add(mul(u,Math.cos(r)),mul(v,Math.sin(r))),v:add(mul(v,Math.cos(r)),mul(u,-Math.sin(r)))};}
function signedArea(p){return p.reduce((s,a,i)=>{let b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1]},0)/2;}
const area=p=>Math.abs(signedArea(p));
function ccw(p){return signedArea(p)<0?[...p].reverse():[...p];}
function clean(p){let a=p.filter((v,i)=>i===0||distance(v,p[i-1])>EPS);if(a.length>1&&distance(a[0],a[a.length-1])<EPS)a.pop();return a;}
function intersect(subject,clip){let out=ccw(subject);const c=ccw(clip);if(c.length<3||out.length<3)return [];for(let i=0;i<c.length;i++){const a=c[i],b=c[(i+1)%c.length];const side=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);const input=out;out=[];if(!input.length)break;let prev=input[input.length-1],sp=side(prev);for(const cur of input){const sc=side(cur),ip=sp>=-EPS,ic=sc>=-EPS;if(ip!==ic){const t=sp/(sp-sc);out.push([prev[0]+t*(cur[0]-prev[0]),prev[1]+t*(cur[1]-prev[1])]);}if(ic)out.push(cur);prev=cur;sp=sc;}out=clean(out);}return out.length>=3&&area(out)>EPS?ccw(out):[];}
function metrics(poly){if(poly.length<3)return {area:0,width:0,height:0,center:null,edges:[],bounds:null};const p=ccw(poly),A=area(p);let cx=0,cy=0;p.forEach((v,i)=>{const q=p[(i+1)%p.length],s=v[0]*q[1]-q[0]*v[1];cx+=(v[0]+q[0])*s;cy+=(v[1]+q[1])*s;});const xs=p.map(v=>v[0]),ys=p.map(v=>v[1]);const bounds={xmin:Math.min(...xs),xmax:Math.max(...xs),ymin:Math.min(...ys),ymax:Math.max(...ys)};return {area:A,width:bounds.xmax-bounds.xmin,height:bounds.ymax-bounds.ymin,center:[cx/(6*A),cy/(6*A)],bounds,edges:p.map((v,i)=>distance(v,p[(i+1)%p.length]))};}
function number(v,name,min=-Infinity,max=Infinity){if(!Number.isFinite(v)||v<min||v>max)throw Error(name+' 超出有效范围');}
function validateDevice(d,name){for(const k of ['f','w','h','wd'])number(d[k],name+' '+k,0.000001,1e7);for(const k of ['yaw','pitch'])number(d[k],name+' '+k,-89.9,89.9);number(d.roll,name+' roll',-360,360);for(const k of ['ox','oy'])number(d[k],name+' '+k,-1e5,1e5);}
function height(d,mode){const c=-basis(d).axis[2];const offset=(d.model||'pinhole')==='magnification'?0:(d.originOffset||0);return (mode==='axis'?d.wd*c:d.wd)+offset*c;}
// Absolute distance from the camera front along its optical axis to the target plane.
function workingDistance(s){const c=-basis(s.camera).axis[2];return (s.wdMode==='axis'?s.camera.wd:s.camera.wd/c)-s.plane/c;}
function planeAtDistance(s,d){number(d,'其他工作距离',0.000001,1e7);const c=-basis(s.camera).axis[2];return ((s.wdMode==='axis'?s.camera.wd:s.camera.wd/c)-d)*c;}
function footprint(d,pos,z,roi){const b=basis(d);let w=d.w,h=d.h,ox=d.ox,oy=d.oy;if(roi){w*=roi.rw/roi.nx;h*=roi.rh/roi.ny;ox+=d.w*((roi.rx+roi.rw/2)/roi.nx-0.5);oy+=d.h*(0.5-(roi.ry+roi.rh/2)/roi.ny);}
const uv=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
const points=uv.map(([x,y])=>{const r=add(b.axis,add(mul(b.u,(x+ox)/d.f),mul(b.v,(y+oy)/d.f)));if(r[2]>=-1e-8)throw Error('视场边缘光线平行或背离工作平面，请减小倾角、幅面或偏心');const t=(z-pos[2])/r[2];if(t<=0)throw Error('工作平面必须位于两个光心的前方');return [pos[0]+t*r[0],pos[1]+t*r[1]];});
const ta=(z-pos[2])/b.axis[2],fa=fovAngles(d,roi);return {points:ccw(points),pos,basis:b,axisHit:[pos[0]+ta*b.axis[0],pos[1]+ta*b.axis[1]],axisWD:ta,normalWD:pos[2]-z,metrics:metrics(points),angles:[fa.x,fa.y]};}
// Exit-angle field of view from the lens in degrees; honours lateral offset and ROI crop, independent of distance and tilt.
function fovAngles(d,roi){let w=d.w,h=d.h,ox=d.ox,oy=d.oy;if(roi){w*=roi.rw/roi.nx;h*=roi.rh/roi.ny;ox+=d.w*((roi.rx+roi.rw/2)/roi.nx-0.5);oy+=d.h*(0.5-(roi.ry+roi.rh/2)/roi.ny);}const deg=x=>x*180/Math.PI;return {x:deg(Math.atan((w/2+ox)/d.f)+Math.atan((w/2-ox)/d.f)),y:deg(Math.atan((h/2+oy)/d.f)+Math.atan((h/2-oy)/d.f))};}
// Back-project target-plane polygon vertices into full-frame pixel coordinates; the spans count covered columns/rows.
function pixelSpan(d,pos,z,poly,nx,ny){
 if(!poly.length)return {x:0,y:0};const b=basis(d);
 const coords=poly.map(p=>{const ray=[p[0]-pos[0],p[1]-pos[1],z-pos[2]],depth=dot(ray,b.axis);if(depth<=EPS)throw Error('共同视野顶点必须位于光心前方');return [nx*(0.5+(dot(ray,b.u)/depth*d.f-d.ox)/d.w),ny*(0.5-(dot(ray,b.v)/depth*d.f-d.oy)/d.h)];});
 const xs=coords.map(c=>c[0]),ys=coords.map(c=>c[1]);return {x:Math.max(...xs)-Math.min(...xs),y:Math.max(...ys)-Math.min(...ys)};
}
function solveMono(s){validateDevice(s.camera,'相机');validateDevice(s.projector,'光机');const optical=cameraOptics(s.camera,s.wdMode),cam={...s.camera,f:optical.effectiveF};const proj=projectorOptics(s.projector);number(s.baseline,'X 基线',-1e7,1e7);number(s.plane,'其他工作距离',-1e7,1e7);number(workingDistance(s),'其他工作距离',0.000001,1e7);if(!['normal','axis'].includes(s.wdMode))throw Error('未知工作距离定义');if(!['x','length'].includes(s.baselineMode))throw Error('未知基线定义');number(s.mountZ===undefined?0:s.mountZ,'Z 光心高度差',-1e7,1e7);const hc=height(s.camera,s.wdMode),hp=hc+(s.mountZ===undefined?0:s.mountZ);let bx=s.baseline;if(s.baselineMode==='length'){const b2=s.baseline*s.baseline-(hp-hc)**2;if(b2 < -EPS)throw Error('光心直线基线小于 Y 偏移和高度差所需距离；请增大基线或修改工作距离');bx=(s.baseline<0?-1:1)*Math.sqrt(Math.max(0,b2));}
const r=s.roi;for(const k of ['nx','ny','rw','rh']){number(r[k],'ROI '+k,1,1e7);if(!Number.isInteger(r[k]))throw Error('像素数必须为整数');}for(const k of ['rx','ry']){number(r[k],'ROI '+k,0,1e7);if(!Number.isInteger(r[k]))throw Error('ROI 起点必须为整数');}if(r.rx+r.rw>r.nx||r.ry+r.rh>r.ny)throw Error('ROI 开窗超出 Sensor 完整像素范围');
const camera=footprint(cam,[0,0,hc],s.plane),active=footprint(cam,[0,0,hc],s.plane,r),projector=footprint(proj,[bx,0,hp],s.plane);const overlap=intersect(active.points,projector.points),m=metrics(overlap);return {camera,active,projector,overlap,missing:missingEdges(overlap),regions:coverageRegions(active.points,projector.points),optical,tr:proj.f/proj.w,metrics:m,baseline:Math.hypot(bx,hp-hc),bx,by:0,dz:hp-hc,cameraCoverage:m.area/active.metrics.area,projectorCoverage:m.area/projector.metrics.area};}

function translateFrame(d,dx){return {...d,pos:[d.pos[0]+dx,d.pos[1],d.pos[2]],points:d.points.map(p=>[p[0]+dx,p[1]]),axisHit:[d.axisHit[0]+dx,d.axisHit[1]],metrics:metrics(d.points.map(p=>[p[0]+dx,p[1]]))};}
function stereoReference(s){
 const m=s.stereoMount;
 
 const leftH=height(s.camera,s.wdMode),projectorH=leftH-m.leftZ,rightH=projectorH+m.rightZ;
 const c=-basis(s.camera2).axis[2],o=(s.camera2.model||'pinhole')==='magnification'?0:(s.camera2.originOffset||0);
 const frontNormal=rightH-o*c;
 return {leftH,projectorH,rightH,rightWD:s.wdMode==='axis'?frontNormal/c:frontNormal};
}
function solveStereo(s){
 const mount=s.stereoMount;for(const k of ['leftGap','rightGap'])number(mount[k],'相机与光机 X 间距',0,1e7);for(const k of ['leftZ','rightZ'])number(mount[k],'相机相对光机 Z 高度差',-1e7,1e7);
 const m=s.stereoMount,ref=stereoReference(s),rightDevice={...s.camera2,wd:ref.rightWD};
 const left=solveMono({...s,baselineMode:'x',baseline:m.leftGap,mountZ:-m.leftZ});
 const right=solveMono({...s,camera:rightDevice,roi:s.roi2,baselineMode:'x',baseline:-m.rightGap,mountZ:-m.rightZ});
 const camera=translateFrame(left.camera,-m.leftGap),active=translateFrame(left.active,-m.leftGap),projector=translateFrame(left.projector,-m.leftGap);
 const camera2=translateFrame(right.camera,m.rightGap),active2=translateFrame(right.active,m.rightGap);
 const cameraOverlap=intersect(active.points,active2.points),overlap=intersect(cameraOverlap,projector.points),metric=metrics(overlap);
 const tagged=(d,prefix,label)=>coverageRegions(d.points,projector.points).camera.map(r=>({...r,id:prefix+r.id,label,ownerCenter:d.metrics.center}));
 return {...left,scene:'stereo',camera,active,projector,camera2,active2,optical2:right.optical,rightDevice,cameraOverlap,
  overlap,metrics:metric,regions:{camera:tagged(active,'L','左相机未被光机覆盖').concat(tagged(active2,'R','右相机未被光机覆盖')),projector:[]},
  pairwise:{left:intersect(active.points,projector.points),right:intersect(active2.points,projector.points)},
  baseline:Math.hypot(m.leftGap+m.rightGap,m.rightZ-m.leftZ),bx:m.leftGap+m.rightGap,dz:m.rightZ-m.leftZ,
  baselines:{left:Math.hypot(m.leftGap,m.leftZ),right:Math.hypot(m.rightGap,m.rightZ)},
  cameraCoverage:metric.area/active.metrics.area,camera2Coverage:metric.area/active2.metrics.area,projectorCoverage:metric.area/projector.metrics.area};
}
// Shortest in-plane Euclidean distance to finite projector boundary segments.
function coverageClearance(camera,projector){
 if(camera.length!==4||projector.length<3||area(projector)<=EPS||![...camera,...projector].every(p=>p.length===2&&p.every(Number.isFinite)))throw Error('无法计算四角余量：画幅无效');
 const clip=ccw(projector),tolerance=1e-7;
 const corners=camera.map((point,index)=>{
  let inside=true,nearest=null;
  for(let i=0;i<clip.length;i++){
   const a=clip[i],b=clip[(i+1)%clip.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<=EPS)continue;
   if((dx*(point[1]-a[1])-dy*(point[0]-a[0]))/length < -tolerance)inside=false;
   const u=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(length*length)));
   const hit=[a[0]+u*dx,a[1]+u*dy],d=distance(point,hit);
   if(!nearest||d<nearest.distance)nearest={distance:d<=tolerance?0:d,nearestPoint:hit,edge:i};
  }
  return{index,point:[...point],inside,...nearest,signedDistance:inside?nearest.distance:-nearest.distance};
 });
 const covered=corners.every(c=>c.inside),minimumSigned=Math.min(...corners.map(c=>c.signedDistance));return{covered,corners,minimum:covered?minimumSigned:null,minimumSigned,maxOverflow:Math.max(0,-minimumSigned),outsideCount:corners.filter(c=>!c.inside).length,tolerance};
}
function solve(s){const r=s.scene==='stereo'?solveStereo(s):solveMono(s);r.clearance={camera:coverageClearance(r.active.points,r.projector.points)};if(s.scene==='stereo')r.clearance.camera2=coverageClearance(r.active2.points,r.projector.points);return r;}

// Pixel boundaries are traced by the same central projection as the footprint.
function pixelSpacing(d,frame,z,nx,ny,roi=null,mode='normal'){
 for(const [name,n] of [['横向',nx],['纵向',ny]])if(!Number.isInteger(n)||n<1||n>1e7)throw Error('有效'+name+'像素数必须为 1～10000000 的整数');
 if(!['normal','tilted'].includes(mode))throw Error('未知像素间距模式');
 const x0=roi?roi.rx:0,y0=roi?roi.ry:0,rw=roi?roi.rw:nx,rh=roi?roi.rh:ny;
 const normal={x:d.w/nx*frame.axisWD/d.f,y:d.h/ny*frame.axisWD/d.f};
 if(mode==='normal')return {mode,nx,ny,normal,samples:[{label:'正视矩形',x:normal.x,y:normal.y}],bounds:{x0,y0,rw,rh}};
 const at=(col,row)=>{
  const x=d.w*(col/nx-.5)+d.ox,y=d.h*(.5-row/ny)+d.oy,b=frame.basis;
  const ray=add(b.axis,add(mul(b.u,x/d.f),mul(b.v,y/d.f)));
  if(ray[2]>=-1e-8)throw Error('像素边缘光线平行或背离工作平面');
  const t=(z-frame.pos[2])/ray[2];if(t<=0)throw Error('像素必须投射在光心前方');
  return [frame.pos[0]+t*ray[0],frame.pos[1]+t*ray[1]];
 };
 const ax=nx*(.5-d.ox/d.w),ay=ny*(.5+d.oy/d.h),axisColumnInside=ax>=x0&&ax<=x0+rw,axisRowInside=ay>=y0&&ay<=y0+rh;
 const clampIndex=(v,start,count)=>Math.max(start,Math.min(start+count-1,Math.floor(v)));
 const middle=clampIndex(axisColumnInside?ax:x0+rw/2,x0,rw),rowLine=axisRowInside?ay:y0+rh/2,row=clampIndex(rowLine,y0,rh);
 const samples=[[x0,'左侧'],[middle,axisColumnInside?'光轴列':'中列'],[x0+rw-1,'右侧']].map(([col,label])=>{
  const xEdges=[at(col,rowLine),at(col+1,rowLine)],yEdges=[at(col+.5,row),at(col+.5,row+1)];
  return {label,column:col+1,roiColumn:col-x0+1,row:row+1,x:distance(...xEdges),y:distance(...yEdges),xEdges,yEdges};
 });
 return {mode,nx,ny,normal,samples,axisColumnInside,axisRowInside,rowLine,bounds:{x0,y0,rw,rh}};
}
function pixelSampling(s,r=solve(s)){
 const mode=s.pixelMode||'normal',stereo=s.scene==='stereo';
 const devices=[{key:'camera',name:stereo?'左相机':'2D 相机',...pixelSpacing({...s.camera,f:r.optical.effectiveF},r.camera,s.plane,s.roi.nx,s.roi.ny,s.roi,mode)}];
 if(stereo)devices.push({key:'camera2',name:'右相机',...pixelSpacing({...r.rightDevice,f:r.optical2.effectiveF},r.camera2,s.plane,s.roi2.nx,s.roi2.ny,s.roi2,mode)});
 devices.push({key:'projector',name:'投影光机',...pixelSpacing(projectorOptics(s.projector),r.projector,s.plane,s.projector.nx,s.projector.ny,null,mode)});
 return {mode,devices};
}

function slice(poly,value,axis){let hits=[];for(let i=0;i<poly.length;i++){let a=poly[i],b=poly[(i+1)%poly.length];if(Math.abs(a[axis]-value)<EPS)hits.push(a[1-axis]);if((a[axis]<value&&b[axis]>value)||(a[axis]>value&&b[axis]<value)){let t=(value-a[axis])/(b[axis]-a[axis]);hits.push(a[1-axis]+t*(b[1-axis]-a[1-axis]));}}return hits.length?Math.max(...hits)-Math.min(...hits):0;}

function sliceSegment(poly,value,axis=0){
 if(poly.length<3||!Number.isFinite(value))return null;
 const hits=[],tolerance=1e-7;
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length];
  if(Math.abs(a[axis]-value)<tolerance)hits.push(a[1-axis]);
  if((a[axis]<value&&b[axis]>value)||(a[axis]>value&&b[axis]<value)){
   const t=(value-a[axis])/(b[axis]-a[axis]);hits.push(a[1-axis]+t*(b[1-axis]-a[1-axis]));
  }
 }
 if(!hits.length)return null;
 const lo=Math.min(...hits),hi=Math.max(...hits);
 return axis===0?[[value,lo],[value,hi]]:[[lo,value],[hi,value]];
}
// Missing corners are measured against the overlap's axis-aligned bounding rectangle.
// Other oblique segments get projection lengths without claiming a triangular corner gap.
function missingEdges(poly){
 const m=metrics(poly),triangles=[],slants=[];
 if(!m.bounds)return {triangles,slants};
 const b=m.bounds,tol=1e-8*Math.max(1,m.width,m.height),p=ccw(poly);
 const close=(a,b)=>Math.abs(a-b)<=tol;
 for(let i=0;i<p.length;i++){
  const a=p[i],q=p[(i+1)%p.length],dx=q[0]-a[0],dy=q[1]-a[1];
  if(Math.abs(dx)<=tol||Math.abs(dy)<=tol)continue;
  const candidates=[[a[0],q[1]],[q[0],a[1]]];
  const corner=candidates.find(c=>dx*(c[1]-a[1])-dy*(c[0]-a[0])<0);
  const left=close(corner[0],b.xmin),right=close(corner[0],b.xmax);
  const top=close(corner[1],b.ymax),bottom=close(corner[1],b.ymin);
  const isCorner=(left||right)&&(top||bottom),list=isCorner?triangles:slants;
  list.push({id:(isCorner?'T':'S')+(list.length+1),location:isCorner?(left?'左':'右')+(top?'上':'下'):'斜边投影',
   a,q,corner,vertices:[i+1,(i+1)%p.length+1],horizontal:Math.abs(dx),vertical:Math.abs(dy),
   diagonal:distance(a,q),area:Math.abs(dx*dy)/2});
 }
 return {triangles,slants};
}
// Disjoint convex pieces of subject minus clip. Vertical boundaries are cut first,
// so a complete side strip remains a rectangle when the geometry permits it.
function simplifyPolygon(poly){
 if(poly.length<3)return [];
 const m=metrics(poly),tol=1e-9*Math.max(1,m.width,m.height);
 let p=clean(poly);
 for(let pass=0;pass<12&&p.length>=3;pass++){
  let removed=false;
  for(let i=0;i<p.length;i++){
   const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length];
   const ac=[c[0]-a[0],c[1]-a[1]],ab=[b[0]-a[0],b[1]-a[1]];
   if(distance(a,b)<=tol||Math.abs(ac[0]*ab[1]-ac[1]*ab[0])<=tol*norm(ac)){
    p.splice(i,1);removed=true;break;
   }
  }
  if(!removed)break;
 }
 return p.length>=3&&area(p)>tol*tol?ccw(p):[];
}
function splitHalfPlane(poly,a,b){
 const len=distance(a,b),side=p=>((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))/len;
 const tol=1e-9*Math.max(1,...poly.flat().map(Math.abs));
 const half=sign=>{
  let out=[],prev=poly[poly.length-1],sp=side(prev)*sign;
  for(const cur of poly){
   const sc=side(cur)*sign,ip=sp>=-tol,ic=sc>=-tol;
   if(ip!==ic){const t=sp/(sp-sc);out.push([prev[0]+t*(cur[0]-prev[0]),prev[1]+t*(cur[1]-prev[1])]);}
   if(ic)out.push(cur);prev=cur;sp=sc;
  }
  return simplifyPolygon(out);
 };
 return {inside:half(1),outside:half(-1)};
}
function subtractConvex(subject,clip){
 const source=simplifyPolygon(subject),c=simplifyPolygon(clip);
 if(!source.length)return [];
 if(!c.length||!intersect(source,c).length)return [source];
 const order=c.map((a,i)=>({a,b:c[(i+1)%c.length],i}));
 order.sort((u,v)=>{
  const rank=e=>Math.abs(e.b[0]-e.a[0])<=1e-8*distance(e.a,e.b)?0:Math.abs(e.b[1]-e.a[1])<=1e-8*distance(e.a,e.b)?1:2;
  return rank(u)-rank(v)||u.i-v.i;
 });
 let remaining=source,pieces=[];
 for(const edge of order){
  if(!remaining.length)break;
  const halves=splitHalfPlane(remaining,edge.a,edge.b);
  if(halves.outside.length)pieces.push(halves.outside);
  remaining=halves.inside;
 }
 return pieces;
}
function regionDimensions(points){
 const p=simplifyPolygon(points),m=metrics(p),n=p.length;
 const es=p.map((a,i)=>{const b=p[(i+1)%n];return {a,b,v:[b[0]-a[0],b[1]-a[1]],length:distance(a,b),mid:[(a[0]+b[0])/2,(a[1]+b[1])/2]};});
 const parallel=(a,b)=>Math.abs(a.v[0]*b.v[1]-a.v[1]*b.v[0])<=1e-7*a.length*b.length;
 const perpendicular=(a,b)=>Math.abs(dot(a.v,b.v))<=1e-7*a.length*b.length;
 let kind=n+'边形',measures=es.map((e,i)=>({label:'边'+(i+1),value:e.length}));
 if(n===3){
  kind='三角形';
  const horizontal=es.find(e=>Math.abs(e.v[1])<=1e-7*e.length),vertical=es.find(e=>Math.abs(e.v[0])<=1e-7*e.length);
  if(horizontal&&vertical){kind='直角三角形';const slope=es.find(e=>e!==horizontal&&e!==vertical);measures=[{label:'水平边',value:horizontal.length},{label:'竖直边',value:vertical.length},{label:'斜边',value:slope.length}];}
 }else if(n===4){
  if(es.every((e,i)=>perpendicular(e,es[(i+1)%4]))){
   kind='矩形';const horizontal=es.reduce((a,b)=>Math.abs(b.v[0])/b.length>Math.abs(a.v[0])/a.length?b:a);
   const i=es.indexOf(horizontal);
   measures=[{label:'宽实长',value:horizontal.length},{label:'高实长',value:es[(i+1)%4].length}];
  }else{
   const pair=parallel(es[0],es[2])?[0,2]:parallel(es[1],es[3])?[1,3]:null;
   if(pair){
    kind='梯形';const bases=pair.map(i=>es[i]),others=es.filter((e,i)=>!pair.includes(i));
    const height=Math.abs(bases[0].v[0]*(bases[1].a[1]-bases[0].a[1])-bases[0].v[1]*(bases[1].a[0]-bases[0].a[0]))/bases[0].length;
    if(Math.abs(bases[0].v[1])>=Math.abs(bases[0].v[0])){
     bases.sort((a,b)=>a.mid[0]-b.mid[0]);others.sort((a,b)=>b.mid[1]-a.mid[1]);
     measures=[{label:'左侧',value:bases[0].length},{label:'右侧',value:bases[1].length},{label:'高',value:height},{label:'上边',value:others[0].length},{label:'下边',value:others[1].length}];
    }else{
     bases.sort((a,b)=>b.mid[1]-a.mid[1]);others.sort((a,b)=>a.mid[0]-b.mid[0]);
     measures=[{label:'上边',value:bases[0].length},{label:'下边',value:bases[1].length},{label:'高',value:height},{label:'左边',value:others[0].length},{label:'右边',value:others[1].length}];
    }
   }else kind='四边形';
  }
 }
 return {points:p,metrics:m,kind,measures,edges:es};
}
function overlapDimensions(poly){
 const d=regionDimensions(poly),m=d.metrics;
 if(!d.points.length)return {kind:'无重合',trapezoid:false,values:[{label:'X 长',value:0},{label:'Y 宽',value:0}],metrics:m};
 if(d.kind!=='梯形')return {kind:d.kind,trapezoid:false,values:[{label:d.kind==='矩形'?'X 长':'X 包络长',value:m.width},{label:d.kind==='矩形'?'Y 宽':'Y 包络宽',value:m.height}],metrics:m};
 const es=d.edges,parallel=(a,b)=>Math.abs(a.v[0]*b.v[1]-a.v[1]*b.v[0])<=1e-7*a.length*b.length;
 const pair=parallel(es[0],es[2])?[es[0],es[2]]:[es[1],es[3]];
 const vertical=Math.abs(pair[0].v[1])>=Math.abs(pair[0].v[0]);
 pair.sort((a,b)=>vertical?a.mid[0]-b.mid[0]:b.mid[1]-a.mid[1]);
 const length=Math.abs(pair[0].v[0]*(pair[1].a[1]-pair[0].a[1])-pair[0].v[1]*(pair[1].a[0]-pair[0].a[0]))/pair[0].length;
 return {kind:'梯形',trapezoid:true,vertical,metrics:m,
  values:[{label:vertical?'左宽':'上宽',value:pair[0].length},{label:vertical?'右宽':'下宽',value:pair[1].length},{label:'长度',value:length}],
  sideSegments:pair.map(e=>[e.a,e.b])};
}
function coverageRegions(camera,projector){
 const locate=(region,source)=>{
  const m=metrics(source),dx=(region.metrics.center[0]-m.center[0])/Math.max(m.width/2,EPS),dy=(region.metrics.center[1]-m.center[1])/Math.max(m.height/2,EPS);
  if(Math.abs(region.metrics.area-m.area)<1e-7*Math.max(1,m.area))return '全幅';
  if(Math.abs(dx)>.45&&Math.abs(dy)>.45)return (dx<0?'左':'右')+(dy<0?'下':'上');
  return Math.abs(dx)>Math.abs(dy)?(dx<0?'左侧':'右侧'):(dy<0?'下侧':'上侧');
 };
 const build=(source,clip,type)=>{
  let triangles=0,others=0;
  return subtractConvex(source,clip).map((p,i)=>{
   const r=regionDimensions(p);
   const id=type==='projector'?'P'+(i+1):p.length===3?'T'+(++triangles):'C'+(++others);
   return {...r,id,type,location:locate(r,source)};
  });
 };
 return {camera:build(camera,projector,'camera'),projector:build(projector,camera,'projector')};
}
function frameDimensions(d){
 const p=d.points,m=d.metrics;
 const vec=(a,b)=>[b[0]-a[0],b[1]-a[1]];
 const edges=p.map((v,i)=>vec(v,p[(i+1)%4]));
 const perpendicular=(a,b)=>Math.abs(dot(a,b))<=1e-7*norm(a)*norm(b);
 const parallel=(a,b)=>Math.abs(a[0]*b[1]-a[1]*b[0])<=1e-7*norm(a)*norm(b);
 const rectangle=edges.every((v,i)=>perpendicular(v,edges[(i+1)%4]));
 const sideParallel=parallel(edges[1],edges[3]);
 const middleSegment=sliceSegment(p,d.axisHit[0],0);
 const leftMid=mul(add(p[0],p[3]),.5),v=vec(p[1],p[2]);
 const q=dot(vec(p[1],leftMid),v)/dot(v,v);
 const rightProjection=add(p[1],mul(v,q));
 const highSegment=sideParallel?[leftMid,rightProjection]:null;
 return {rectangle,sideParallel,kind:rectangle?'矩形':(sideParallel||parallel(edges[0],edges[2]))?'梯形':'四边形',
  width:m.width,height:m.height,left:distance(p[0],p[3]),right:distance(p[1],p[2]),
  middle:middleSegment?distance(...middleSegment):null,high:highSegment?distance(...highSegment):null,
  leftSegment:[p[0],p[3]],rightSegment:[p[1],p[2]],middleSegment,highSegment,
  upper:distance(p[2],p[3]),lower:distance(p[0],p[1]),axisX:d.axisHit[0]};
}
function parseTable(source){if(typeof source!=='string')throw Error('倍率表需要文本');const rows=source.trim().split(/\n+/).filter(x=>x.trim()).map((line,i)=>{const a=line.trim().split(/[,，;；\s]+/).map(Number);if(a.length!==2||!a.every(Number.isFinite)||a[0]<=0||a[1]<=0)throw Error('倍率表第 '+(i+1)+' 行应为：镜头前端轴向距离,正倍率');return {wd:a[0],mag:a[1]};}).sort((a,b)=>a.wd-b.wd);if(rows.length<2)throw Error('倍率表至少需要两行');if(rows.length>200)throw Error('倍率表最多支持 200 行');for(let i=1;i<rows.length;i++)if(rows[i].wd===rows[i-1].wd)throw Error('倍率表距离不能重复');return rows;}
function interpolate(rows,wd){if(wd<rows[0].wd-1e-8||wd>rows[rows.length-1].wd+1e-8)throw Error('镜头前端轴向 WD 不在规格书倍率表范围 '+rows[0].wd+'–'+rows[rows.length-1].wd+' mm 内；不自动外推');for(let i=0;i<rows.length;i++){if(Math.abs(wd-rows[i].wd)<1e-8)return rows[i].mag;if(i>0&&wd<rows[i].wd){const a=rows[i-1],b=rows[i],t=(wd-a.wd)/(b.wd-a.wd);return a.mag+(b.mag-a.mag)*t;}}return rows[rows.length-1].mag;}
function cameraOptics(d,mode){const model=d.model||'pinhole',c=-basis(d).axis[2],offset=model==='magnification'?0:(d.originOffset===undefined?0:d.originOffset);number(offset,'光心后移量',-1e5,1e5);const frontAxisWD=mode==='axis'?d.wd:d.wd/c;const u=frontAxisWD+offset;number(u,'光心到参考平面的轴向距离',1e-6,1e8);let effectiveF=d.f,mag,calWD=null;if(model==='thin'){if(u<=d.f)throw Error('薄透镜模式要求物距（含光心后移）大于焦距');mag=d.f/(u-d.f);effectiveF=mag*u;}else if(model==='magnification'){number(d.mag,'参考倍率',1e-8,1e5);number(d.magWD,'倍率参考镜头前端轴向距离',1e-6,1e7);calWD=d.magWD;number(calWD,'倍率参考距离',1e-6,1e8);effectiveF=d.mag*calWD;mag=effectiveF/u;}else if(model==='pinhole'){mag=d.f/u;}else throw Error('未知相机成像模型');return {model,effectiveF,mag,frontAxisWD,axisWD:u,originOffset:offset,calWD};}
function projectorOptics(d){const link=d.link||'f';if(!['f','tr'].includes(link))throw Error('未知 TR 联动基准');let f=d.f;if(link==='tr'){number(d.tr,'投射比 TR',1e-8,1e5);f=d.tr*d.w;}return {...d,f};}

const defaults={version:10,pixelMode:'normal',wdMode:'normal',baselineMode:'x',baseline:66.4,mountZ:0,plane:0,camera:{f:23,w:10.24,h:6,wd:115,yaw:0,pitch:0,roll:0,ox:0,oy:0,model:'pinhole',originOffset:0,mag:.1572,magWD:115,pixelPitch:5},projector:{f:14,w:7.6,h:4.3,wd:115,yaw:-30,pitch:0,roll:0,ox:0,oy:0,tr:14/7.6,link:'f',nx:1280,ny:720},roi:{nx:2048,ny:1200,rw:2048,rh:1200,rx:0,ry:0}};

const cloneSetup=x=>JSON.parse(JSON.stringify(x));
defaults.scene='mono';defaults.camera2=cloneSetup(defaults.camera);defaults.roi2=cloneSetup(defaults.roi);
defaults.stereoMount={leftGap:66.4,rightGap:66.4,leftZ:0,rightZ:0};
const setupKeys=['pixelMode','wdMode','baselineMode','baseline','mountZ','plane','camera','projector','roi','camera2','roi2','stereoMount'];
const monoSetup=Object.fromEntries(setupKeys.map(k=>[k,cloneSetup(defaults[k])]));
const stereoSetup=cloneSetup(monoSetup);
stereoSetup.camera.yaw=Math.atan(stereoSetup.stereoMount.leftGap/stereoSetup.camera.wd)*180/Math.PI;
stereoSetup.camera2.yaw=-stereoSetup.camera.yaw;stereoSetup.projector.yaw=0;
defaults.setups={mono:monoSetup,stereo:stereoSetup};

const api={coverageClearance,pixelSpacing,pixelSampling,fovAngles,pixelSpan,basis,area,intersect,metrics,solve,stereoReference,setupKeys,footprint,slice,sliceSegment,frameDimensions,missingEdges,subtractConvex,regionDimensions,overlapDimensions,coverageRegions,defaults,distance,height,workingDistance,planeAtDistance,cameraOptics,projectorOptics,parseTable,interpolate};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.FOV=api;
})(typeof globalThis!=='undefined'?globalThis:this);

