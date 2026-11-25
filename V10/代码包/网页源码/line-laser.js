'use strict';
(function(){
const G=LaserFOV,cp=x=>JSON.parse(JSON.stringify(x)),el=id=>document.getElementById(id),key='structured-light-fov-line-v10';let ls=cp(G.defaults),lr=null,history=[],index=0,editing=false,product='structuredLight';
try{const saved=localStorage.getItem(key);if(saved)ls=G.load(JSON.parse(saved));}catch(e){}
const selector=document.createElement('div');selector.className='product-selector';selector.setAttribute('role','group');selector.setAttribute('aria-label','产品线');selector.innerHTML='<button id="productStructured" type="button" aria-pressed="true">面阵结构光</button><button id="productLine" type="button" aria-pressed="false">线激光 · 沙姆镜头</button>';document.querySelector('header>div').append(selector);
// WebView may focus the first button at startup; show a focus ring only after keyboard navigation.
document.addEventListener('keydown',e=>{if(e.key==='Tab')selector.dataset.keyboardFocus='true';},true);
document.addEventListener('pointerdown',()=>{delete selector.dataset.keyboardFocus;},true);
const action=document.createElement('div');action.className='line-actions actions';action.hidden=true;action.innerHTML='<button id="lineUndo" disabled title="Ctrl+Z">撤销</button><button id="lineRedo" disabled title="Ctrl+Y">重做</button><button id="lineReset">恢复示例</button><button id="lineSave" class="primary">保存方案</button><label class="filelabel">载入方案<input id="lineLoad" type="file" accept=".json" hidden></label><button id="lineCSV">导出结果 CSV</button><select id="lineFormat" aria-label="线激光导出图片格式"><option value="bmp">BMP 图片</option><option value="svg">SVG 矢量图</option></select><button id="lineExportAll">导出两张图</button>';document.querySelector('header .actions').append(action);
const input=(path,label,step='.1',extra='')=>'<label>'+label+'<input data-line="'+path+'" type="number" step="'+step+'" '+extra+'></label>';
const main=document.createElement('main');main.id='lineMain';main.className='line-main';main.hidden=true;main.innerHTML=`<aside class="parameter-grid line-parameters">
<section class="panel"><div class="phead"><h2>线激光安装关系</h2><span class="small">激光竖直 · 光轴交点为零高</span></div><div class="body"><div class="fields">${input('camera.wd','镜头前端 WD · 沿轴 (mm)')}${input('theta','相机倾角 θ (°)','.1','min="0.000001" max="90"')}${input('baseline','X 光心基线 B (mm)','.1','readonly')}${input('normalH','光心垂直高度 (mm)','.1','readonly')}</div><p id="lineMountFormula" class="small line-link-note"></p></div></section>
<section class="panel"><div class="phead"><h2>沙姆镜头 · 等效视野</h2><span class="small">几何选型</span></div><div class="body"><div class="fields"><label class="wide">镜头成像模型<select data-line="camera.model"><option value="pinhole">针孔近似 · 焦距 / 距离</option><option value="thin">薄透镜 · 有限共轭</option><option value="magnification">已知参考倍率（正视）</option></select></label>${input('camera.f','镜头名义焦距 (mm)').replace('<label>','<label id="lineFocalField">')}${input('camera.originOffset','光心后移量 (mm)').replace('<label>','<label id="lineOffsetField">')}${input('camera.mag','参考正视倍率 |m|','0.0001').replace('<label>','<label id="lineMagField" hidden>')}${input('camera.magWD','倍率参考 WD · 沿轴 (mm)').replace('<label>','<label id="lineMagWDField" hidden>')}</div><p id="lineModelInfo" class="small line-link-note"></p></div></section>
<section class="panel"><div class="phead"><h2>Sensor 与 ROI</h2><button id="lineFullROI">全幅开窗</button></div><div class="body"><div class="fields">${input('camera.pixelPitch','像元大小 (μm)','.01')}${input('roi.nx','Sensor X 像素数','1')}${input('roi.ny','Sensor Y 像素数','1')}${input('camera.w','Sensor X 尺寸 (mm)','.001')}${input('camera.h','Sensor Y 尺寸 (mm)','.001')}${input('heightROI','<span id="lineROILabel">测高 ROI · Sensor Y (px)</span>','1','min="1"')}<label class="wide">梯形测高对应 Sensor<select data-line="heightAxis"><option value="short">短边（默认）</option><option value="long">长边</option></select></label></div><p id="lineSensorInfo" class="small line-link-note"></p><p id="lineOrientationInfo" class="small"></p></div></section>
</aside><div class="content line-content"><div id="lineStatus" class="status">线激光：垂直激光光平面 + 斜视镜头，独立于面阵结构光。</div><div id="lineError" class="error" role="alert" hidden></div><div class="laser-plots">
<section class="panel laser-panel"><div class="phead"><h2>激光器与镜头交汇图</h2><div class="line-plot-actions"><button data-line-export="layout">导出此图</button><button data-line-zoom="layout">放大</button></div></div><svg id="lineLayout" class="line-plot" role="img" aria-label="线激光 X–Z 剖面：安装倾角、光心基线、镜头前端沿轴工作距离和垂距，以及视野上界、零高和下界"></svg><div class="laser-info" id="lineLayoutInfo"></div></section>
<section class="panel laser-panel"><div class="phead"><h2>激光光平面内的梯形视野</h2><div class="line-plot-actions"><button data-line-export="footprint">导出此图</button><button data-line-zoom="footprint">放大</button></div></div><svg id="lineFootprint" class="line-plot" role="img" aria-label="激光平面视野的上底下底总高上高下高及光轴横向宽度"></svg><div class="laser-info" id="lineDimensions"></div></section>
</div><section class="panel line-sampling-panel"><div class="phead"><h2>测高方向像素间距</h2><span class="small">mm / 像素</span></div><div id="lineSampling" class="line-sampling"></div><p class="caption">上、下端取首末像素的两边缘；光轴处取光轴上下各半像素，反投影后计算高度差。</p></section><p class="small line-model-note">采用等效视锥与垂直激光光平面求交，尺寸按平面内实长计；用于粗略选型，不计算沙姆调焦或测量精度。红色为激光光平面，蓝色为镜头视野；右图的上高、下高从光轴交点分别量至上底、下底。激光器扇形角不限制本次计算；梯形视野是否落在激光扇形覆盖内，需对照激光器规格书核对。</p></div>`;el('structuredMain').after(main);
// The line laser exposes one centred ROI along the selected measurement-height axis.
function heightAxisOf(s){const short=s.camera.w<s.camera.h?'X':'Y';return s.heightAxis==='long'?(short==='X'?'Y':'X'):short;}
function heightROIOf(s){return s.roi[heightAxisOf(s)==='X'?'rw':'rh'];}
function heightPixelsOf(s){return s.roi[heightAxisOf(s)==='X'?'nx':'ny'];}
const linkedFields=new Set(['camera.pixelPitch','camera.w','camera.h','roi.nx','roi.ny']);
let sensorEdit=null;
function validSensor(){
 const c=ls.camera,r=ls.roi;
 return [c.pixelPitch,c.w,c.h].every(v=>Number.isFinite(v)&&v>0)&&[r.nx,r.ny].every(v=>Number.isInteger(v)&&v>0);
}
function normalizeROI(intent){
 if(!validSensor())return;
 const r=ls.roi,verticalX=heightAxisOf(ls)==='X',pixels=heightPixelsOf(ls);
 if(intent)r[verticalX?'rw':'rh']=intent.full?pixels:Math.min(intent.count,pixels);
 r[verticalX?'rh':'rw']=verticalX?r.ny:r.nx;
}
function syncSensorSummary(){
 const choose=main.querySelector('[data-line="heightAxis"]'),input=main.querySelector('[data-line="heightROI"]');
 const valid=validSensor(),shortAxis=ls.camera.w<ls.camera.h?'X':'Y',longAxis=shortAxis==='X'?'Y':'X',axis=heightAxisOf(ls);
 const axisText=a=>' · Sensor '+a+'（'+N(a==='X'?ls.camera.w:ls.camera.h,4)+' mm）';
 choose.options[0].textContent='短边'+(valid?axisText(shortAxis):'');
 choose.options[1].textContent='长边'+(valid?axisText(longAxis):'');
 el('lineROILabel').textContent='测高 ROI'+(valid?' · Sensor '+axis:'')+' (px)';
 if(valid)input.max=heightPixelsOf(ls);else input.removeAttribute('max');
 el('lineSensorInfo').textContent=valid?N(ls.camera.pixelPitch,4)+' μm × '+ls.roi.nx+' / '+ls.roi.ny+' px = '+N(ls.camera.w,4)+' × '+N(ls.camera.h,4)+' mm':'';
 el('lineOrientationInfo').textContent=valid?'当前测高：Sensor '+axis+'；沿线：Sensor '+(axis==='X'?'Y':'X')+'。ROI 沿测高方向自动居中，沿线方向保持全幅。':'';
}
const esc=s=>escapeText(String(s)),N=(v,n=2)=>fmt(v,n),getValue=(p,mount)=>p==='baseline'?mount.baseline:p==='normalH'?mount.normalHeight:p==='heightROI'?heightROIOf(ls):p.split('.').reduce((v,k)=>v[k],ls);
function put(p,v){if(p==='heightROI'){ls.roi[heightAxisOf(ls)==='X'?'rw':'rh']=v;return;}const a=p.split('.'),k=a.pop();let obj=ls;for(const s of a)obj=obj[s];obj[k]=v;}
function syncInputs(force=false){
 const mount=lr||G.mountDimensions(ls);
 ls.baseline=Number.isFinite(mount.baseline)?mount.baseline:null;
 for(const e of main.querySelectorAll('[data-line]')){
  if(!force&&!e.readOnly&&e===document.activeElement)continue;
  const v=getValue(e.dataset.line,mount);
  if(typeof v==='string')e.value=v;
  else e.value=Number.isFinite(v)?e.readOnly?Number(v.toFixed(2)):Number(v.toPrecision(9)):'';
 }
}
function linkSensor(path){const c=ls.camera,r=ls.roi;if(path==='camera.w')c.pixelPitch=c.w*1000/r.nx;if(path==='camera.h')c.pixelPitch=c.h*1000/r.ny;c.w=r.nx*c.pixelPitch/1000;c.h=r.ny*c.pixelPitch/1000;}
function hasLineDraft(){return editing&&JSON.stringify(ls)!==JSON.stringify(history[index]);}
function buttons(){el('lineUndo').disabled=index<=0&&!hasLineDraft();el('lineRedo').disabled=!lr||hasLineDraft()||index>=history.length-1;for(const e of [el('lineSave'),el('lineCSV'),el('lineExportAll'),...document.querySelectorAll('[data-line-export],[data-line-zoom]')])e.disabled=!lr;}
function persistLine(){try{localStorage.setItem(key,JSON.stringify(ls));}catch(e){}}
function record(){
 if(!lr)return;
 editing=false;
 if(JSON.stringify(ls)===JSON.stringify(history[index]))return;
 history.splice(index+1);history.push(cp(ls));index++;
 if(history.length>101){history.shift();index--;}
 persistLine();
}
function commitLineEdit(){if(editing&&lr){record();buttons();}}
function sampleRange(s){return s.axisCentered?'光轴中心 ±0.5像素'+(s.withinROI?'':'（取样部分超出 ROI）'):'第 '+s.row+' 个像素';}
function sampleStatus(s){
 const notes=[];
 if(s.illumination==='outside')notes.push('超出照射范围');
 if(s.illumination==='partial')notes.push('部分可照射');
 if(!s.withinROI)notes.push('取样跨出 ROI，仅供参考');
 return notes.join(' · ');
}
function valueCell(label,value,unit='mm'){return '<div><span>'+label+'</span><strong>'+N(value)+' <small>'+unit+'</small></strong></div>';}
function illuminationWarning(r){
 const height=r.unreachableHeight<.01?'小于 0.01':N(r.unreachableHeight);
 return '视野上缘超出激光前端 '+height+' mm，前端以上不可照射。';
}
function updateLine(saveHistory=true){
 normalizeROI();syncSensorSummary();
 el('lineMountFormula').textContent='θ 从竖直方向量起。基线 B = '+(G.originOffset(ls)===0?'WD':'(WD + 光心后移量)')+' × sin θ';
 const reference=ls.camera.model==='magnification';el('lineFocalField').hidden=el('lineOffsetField').hidden=reference;el('lineMagField').hidden=el('lineMagWDField').hidden=!reference;el('lineModelInfo').textContent=reference?'输入普通正视倍率建立视锥，测高方向另计倾斜投影；不使用名义焦距和光心后移，离开参考 WD 按中心投影估算。':ls.camera.model==='thin'?'薄透镜物距按前端 WD 加光心后移估算，需大于焦距；光心后移正值在后方。':'针孔近似按焦距与视距估算；光心后移以镜头前端为基准，正值在后方。';
 try{lr=G.solve(ls);ls.baseline=lr.baseline;el('lineError').hidden=true;el('lineStatus').classList.toggle('bad',!lr.laserReachesTop);el('lineStatus').textContent=lr.laserReachesTop?'线激光 · 激光器与镜头前端同高；光轴交点为零高，当前视野为'+(lr.rectangle?'矩形':'梯形')+'。':illuminationWarning(lr);
 el('lineDimensions').innerHTML='<div class="line-dimension-grid">'+valueCell('上底',lr.upperBase)+valueCell('下底',lr.lowerBase)+valueCell('总高',lr.height)+valueCell('上高 · 光轴至上底',lr.upperHeight)+valueCell('下高 · 光轴至下底',lr.lowerHeight)+valueCell('光轴处横向视野',lr.axisWidth)+'</div><p class="small">尺寸在激光光平面 Y–Z 内测量；上底对应较高位置。</p>';
 el('lineLayoutInfo').innerHTML='<div class="line-install-grid">'+valueCell('前端至光平面 · 沿光轴',lr.frontDistance)+valueCell('X 光心基线',lr.baseline)+valueCell('相机倾角 θ',lr.theta,'°')+valueCell('激光 / 镜头前端共同高度',lr.front[2])+'</div><p class="small">X–Z 侧视。蓝色实线为视野边界，蓝色虚线为相机光轴。θ 从向下的平面法线量起，WD 从镜头前端沿光轴量至零高交点。</p>';
 el('lineSampling').innerHTML=lr.sampling.samples.map(s=>{
  const summary=sampleStatus(s),detail='测高方向 Sensor '+lr.sensor.heightSensorAxis+' '+sampleRange(s)+'；Sensor 上点='+N(s.sensorEdges[0]*1000,6)+' μm；下点='+N(s.sensorEdges[1]*1000,6)+' μm；上边缘 Z='+N(s.heightEdges[0][1],9)+' mm；下边缘 Z='+N(s.heightEdges[1][1],9)+' mm；差值='+N(s.heightPitch,9)+' mm';
  return '<article class="line-sample" title="'+esc(detail)+'"><h3>'+s.label+'</h3><div><strong>'+N(s.heightPitch,6)+'</strong>'+(summary?'<span style="color:#935000">'+summary+'</span>':'')+'</div></article>';
 }).join('');
 if(saveHistory)record();
 }catch(e){lr=null;el('lineError').hidden=false;el('lineError').textContent=e.message;el('lineStatus').classList.add('bad');el('lineStatus').textContent='线激光参数未形成有效视野，请修改参数。';el('lineDimensions').innerHTML=el('lineLayoutInfo').innerHTML=el('lineSampling').innerHTML='';}
 syncInputs();buttons();drawLine();
}
function ln(a,b,c='#b7c3d0',dash='',width=1){return '<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="'+c+'" stroke-width="'+width+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>';}
function tx(p,s,color='#62768a',size=11,anchor='middle',weight=400){return '<text x="'+p[0]+'" y="'+p[1]+'" text-anchor="'+anchor+'" style="font-size:'+size+'px;fill:'+color+';font-weight:'+weight+'" class="annot">'+esc(s)+'</text>';}
function marker(p,color,r=3){return '<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+r+'" fill="white" stroke="'+color+'" stroke-width="1.5"/>';}
function dim(a,b,label,color='#62768a',pos=null,rotate=false){const d=[b[0]-a[0],b[1]-a[1]],len=Math.hypot(...d);if(len<.01)return pos?tx(pos,label,color,10.5):'';const ux=d[0]/len,uy=d[1]/len,n=[-uy,ux],head=5;let q=ln(a,b,color,'',1);for(const [p,sgn]of[[a,1],[b,-1]])q+=ln(p,[p[0]+sgn*ux*head+n[0]*2.5,p[1]+sgn*uy*head+n[1]*2.5],color)+ln(p,[p[0]+sgn*ux*head-n[0]*2.5,p[1]+sgn*uy*head-n[1]*2.5],color);const mid=pos||[(a[0]+b[0])/2,(a[1]+b[1])/2-7];if(rotate)q+='<text transform="translate('+mid[0]+' '+mid[1]+') rotate(-90)" text-anchor="middle" class="annot" style="font-size:10.5px;fill:'+color+'">'+esc(label)+'</text>';else q+=tx(mid,label,color,10.5);return q;}
function fitMap(points,W,H,pad){const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),lo=Math.min(...xs),hi=Math.max(...xs),bottom=Math.min(...zs),top=Math.max(...zs),dx=Math.max(hi-lo,1e-9),dz=Math.max(top-bottom,1e-9),s=Math.min((W-pad[0]-pad[1])/dx,(H-pad[2]-pad[3])/dz),cx=pad[0]+(W-pad[0]-pad[1])/2,cz=pad[2]+(H-pad[2]-pad[3])/2;return p=>[cx+(p[0]-(lo+hi)/2)*s,cz-(p[1]-(bottom+top)/2)*s];}
function initLine(id){const s=el(id),W=s.clientWidth,H=s.clientHeight;if(W<10||H<10)return null;s.setAttribute('viewBox','0 0 '+W+' '+H);return{s,W,H};}
function drawSide(){
 const view=initLine('lineLayout');
 if(!view)return;
 const {s:svg,W,H}=view,r=lr;
 if(!r){svg.innerHTML='';return;}
 const side=q=>[q[0],q[2]],topWorld=[0,r.zTop],bottomWorld=[0,r.zBottom];
 const world=[side(r.camera),side(r.front),side(r.laserFront),side(r.axisHit),topWorld,bottomWorld];
 const theta=r.theta*Math.PI/180,sn=Math.sin(theta),cs=Math.cos(theta);
 // In X–Z the outward normal to the optical axis is (cos θ, -sin θ).
 // The largest projection of the three cone vertices defines its outside edge.
 const coneWorld=[world[0],topWorld,bottomWorld];
 const edgeDistance=Math.max(...coneWorld.map(([x,z])=>x*cs-z*sn));
 const railPoint=([x,z])=>[x+edgeDistance*cs,z-edgeDistance*sn];
 const railFront=railPoint(world[1]),railZero=railPoint(world[3]);
 const wdGap=Math.min(32,Math.max(24,W*.06));
 const map=fitMap([...world,railFront,railZero],W,H,
  [W<380?72:84,(W<380?41:54)+wdGap*cs,63,60+wdGap*sn]);
 const [C,F,L,O,top,bottom]=world.map(map),cone=[C,top,bottom];
 const blue='#007aff',red='#cf4552',green='#008b76',ink='#53667b',guide='#a2adba';
 const normal=[cs,sn],shift=(pt,v,k)=>[pt[0]+v[0]*k,pt[1]+v[1]*k];
 const group=(name,body)=>'<g data-line-dim="'+name+'">'+body+'</g>';
 const measure=(pt,qt)=>sectionDimension(pt,qt,ink);
 const mid=(pt,qt)=>[(pt[0]+qt[0])/2,(pt[1]+qt[1])/2];
 const heightX=W-14,baseY=H-28;
 let out=ln([Math.max(5,O[0]-12),O[1]],[heightX+3,O[1]],guide,'4 3');
 out+='<polygon points="'+[C,top,bottom].map(pt=>pt.join(',')).join(' ')+'" fill="#007aff0d"/>';
 // Both fronts share an elevation. The camera centre can be on either side of its front.
 out+=ln(L,F,guide,'3 4');
 if(!r.laserReachesTop)out+=ln(L,top,red,'4 4',1.4);
 out+=ln(L,bottom,red,'',2)+ln(C,top,blue,'',1.5)+ln(C,bottom,blue,'',1.5)+ln(C,O,blue,'5 4',1.25);
 if(bottom[1]-L[1]>34){
  const tip=[L[0],L[1]+17];
  out+=ln([tip[0]-3,tip[1]-5],tip,red)+ln([tip[0]+3,tip[1]-5],tip,red);
 }
 const wdA=shift(map(railFront),normal,wdGap),wdB=shift(map(railZero),normal,wdGap),along=mid(wdA,wdB);
 // A witness line points back to the true endpoint, with its in-cone part omitted.
 const axial=p=>(p[0]-O[0])*sn-(p[1]-O[1])*cs;
 const across=p=>(p[0]-O[0])*cs+(p[1]-O[1])*sn;
 const axisSection=cone.map(p=>[axial(p),across(p)]);
 function wdWitness(origin,end){
  const cut=FOV.sliceSegment(axisSection,axial(origin),0);
  const start=Math.max(0,(cut?cut[1][1]:0)-across(origin))+3;
  return ln(shift(origin,normal,start),end,guide,'3 3');
 }
 out+=group('axial-wd',wdWitness(F,wdA)+wdWitness(O,wdB)+measure(wdA,wdB));
 const baseA=[O[0],baseY],baseB=[C[0],baseY];
 out+=group('baseline',ln(bottom,baseA,guide,'2 4')+ln(C,baseB,guide,'2 4')+
  measure(baseA,baseB)+tx([Math.max(82,Math.min(W-82,(C[0]+O[0])/2)),H-10],
   'X 光心基线 B '+N(r.baseline)+' mm',ink,11));
 const heightA=[heightX,F[1]],heightB=[heightX,O[1]];
 const heightLabel='前端垂距 '+N(r.front[2])+' mm';
 const heightLabelY=Math.max(78,Math.min(H-83,(F[1]+O[1])/2));
 out+=group('normal-wd',ln(F,[heightX+3,F[1]],guide,'3 4')+measure(heightA,heightB)+
  '<g transform="translate('+(heightX-6)+' '+heightLabelY+') rotate(-90)">'+
  tx([0,0],heightLabel,ink,10.5)+'</g>');
 const radius=Math.min(38,Math.max(8,Math.hypot(C[0]-O[0],C[1]-O[1])*.36));
 const arcEnd=[C[0]-radius*sn,C[1]+radius*cs];
 out+=group('tilt',ln(C,[C[0],C[1]+radius+12],guide,'2 3')+
  (Math.hypot(C[0]-O[0],C[1]-O[1])<radius?ln(C,arcEnd,blue,'2 3'):'')+
  '<path d="M '+C[0]+' '+(C[1]+radius)+' A '+radius+' '+radius+' 0 0 1 '+arcEnd.join(' ')+'" fill="none" stroke="'+blue+'" stroke-width="1.4"/>');
 out+='<rect x="'+(L[0]-14)+'" y="'+(L[1]-13)+'" width="28" height="13" rx="3" fill="#fff2f3" stroke="'+red+'"/>'+
  ln(shift(C,normal,-9),shift(C,normal,9),blue,'',3.5)+marker(C,blue,3.6);
 out+='<circle data-laser-front="true" cx="'+L[0]+'" cy="'+L[1]+'" r="2.5" fill="'+red+'"/>'+
  '<circle data-camera-front="true" cx="'+F[0]+'" cy="'+F[1]+'" r="2.6" fill="'+blue+'"/>';
 out+=marker(top,green,2.8)+marker(bottom,green,2.8)+marker(O,blue,3);
 // Leave true intersections in place; use short leaders when labels would touch.
 const labelX=Math.max(68,O[0]-12);
 const edgePoints=[top,O,bottom];
 const withLevels=W>=460&&O[0]>=135;
 const level=z=>' Z '+(z>0?'+':'')+N(z)+' mm';
 const edgeLabels=['视野上界'+(withLevels?level(r.zTop):''),'光轴交点 Z=0','视野下界'+(withLevels?level(r.zBottom):'')];
 const ys=edgePoints.map(pt=>pt[1]+3);
 ys[1]=Math.max(ys[1],ys[0]+17);
 ys[2]=Math.max(ys[2],ys[1]+17);
 const backoff=Math.max(0,ys[2]-(baseY-12));
 out+=tx([10,16],'X–Z 剖面',ink,10,'start');
 const boxes=[[6,1,56,21]];
 const ctx=drawSide.textContext||(drawSide.textContext=document.createElement('canvas').getContext('2d'));
 ctx.font='11px '+getComputedStyle(svg).fontFamily;
 for(let i=0;i<3;i++){
  const y=ys[i]-backoff,pt=edgePoints[i],color=i===1?blue:green;
  out+=ln([pt[0]-3,pt[1]],[labelX+2,y-3],guide)+tx([labelX,y],edgeLabels[i],color,10,'end');
  boxes.push([labelX-ctx.measureText(edgeLabels[i]).width-4,y-11,labelX+2,y+3]);
 }
 function note(label,color,candidates,anchorPoint,dimName){
  const width=Math.ceil(ctx.measureText(label).width)+4;
  const [ax,ay]=anchorPoint;
  for(const dy of [-16,20,-33,38,-52,55]){
   for(const dx of [-width/2-9,width/2+9,0])candidates.push([ax+dx,ay+dy]);
  }
  const isWD=dimName==='axial-wd';
  // The strip above the baseline also fits a horizontal reading on narrow plots.
  if(isWD)candidates.push([ax,baseY-5],[W*.5,baseY-5]);
  let best;
  for(const [x,y] of candidates){
   const left=Math.max(5,Math.min(W-32-width,x-width/2)),base=Math.max(14,Math.min(baseY-4,y));
   const box=[left-2,base-13,left+width+2,base+4];
   if(isWD){
    const [x0,y0,x1,y1]=box,margin=10;
    const keepClear=[[x0-margin,y0-margin],[x1+margin,y0-margin],[x1+margin,y1+margin],[x0-margin,y1+margin]];
    if(FOV.intersect(cone,keepClear).length)continue;
   }
   const overlap=boxes.reduce((sum,b)=>sum+Math.max(0,Math.min(box[2],b[2]+2)-Math.max(box[0],b[0]-2))*
     Math.max(0,Math.min(box[3],b[3]+2)-Math.max(box[1],b[1]-2)),0);
   if(!best||overlap<best.overlap)best={left,base,box,overlap};
   if(!overlap)break;
  }
  const {left,base,box}=best;boxes.push(box);
  const to=[Math.max(left,Math.min(left+width,anchorPoint[0])),Math.max(base-10,Math.min(base,anchorPoint[1]))];
  let body=Math.hypot(to[0]-anchorPoint[0],to[1]-anchorPoint[1])>10?ln(anchorPoint,to,guide,'2 2'):'';
  body+=tx([left+width/2,base],label,color,11);
  out+=dimName?group(dimName+'-label',body):body;
 }
 const labelLane=Math.min(C[1],L[1])-22;
 note('线激光器 · 0°',red,[[L[0]-17,L[1]-22],[L[0]-34,labelLane-13]],L);
 note('沙姆镜头光心',blue,[[C[0]+17,C[1]-12],[C[0]+18,labelLane-10],[C[0]+20,labelLane+5]],C);
 const arcMid=[C[0]-radius*Math.sin(theta/2),C[1]+radius*Math.cos(theta/2)];
 note('θ '+N(r.theta,1)+'°',blue,[[arcMid[0]-19,arcMid[1]+11],[C[0]+28,C[1]+30],[C[0]+4,labelLane-16]],arcMid,'tilt');
 const wdText='沿轴 WD '+N(r.frontDistance)+' mm';
 const wdLabelOffset=ctx.measureText(wdText).width*cs/2+9*sn+6;
 const wdCaption=shift(along,normal,wdLabelOffset);
 note(wdText,ink,[[wdCaption[0],wdCaption[1]+3],[along[0]+48,along[1]+20],[along[0],along[1]+22]],along,'axial-wd');
 const frontMid=mid(L,F);
 note('前端同高',ink,[[frontMid[0],frontMid[1]-5],[frontMid[0],frontMid[1]-23],[frontMid[0],labelLane-23]],frontMid);
 if(r.optical.originOffset!==0){
  note('镜头前端',blue,[[F[0]+26,F[1]+13],[F[0]+28,F[1]-3],[F[0]+31,F[1]+30],[F[0]+20,labelLane-11]],F);
 }
 svg.innerHTML=out;
}
function drawLaserLimit(r,p){
 const z=r.laserFront[2],fraction=(z-r.zBottom)/r.height;
 const [bottomLeft,bottomRight,topRight,topLeft]=r.points;
 const cut=(bottom,top)=>p([bottom[0]+fraction*(top[0]-bottom[0]),z]);
 const left=cut(bottomLeft,topLeft),right=cut(bottomRight,topRight);
 const outline=[left,p(topLeft),p(topRight),right].map(q=>q.join(',')).join(' ');
 const color='#ad581c';
 return '<g class="line-illumination-limit"><title>'+esc(illuminationWarning(r))+'</title>'+
  '<polygon points="'+outline+'" fill="#f9e6d5"/><polyline points="'+outline+'" stroke="'+color+'" stroke-width="1.4" fill="none"/>'+
  ln([left[0]-4,left[1]],[right[0]+4,right[1]],color,'5 3',1.5)+ln([14,34],[31,34],color,'5 3',1.5)+
  tx([36,37],'激光前端 · 上方不可照射 '+(r.unreachableHeight<.01?'(<0.01 mm)':'('+N(r.unreachableHeight)+' mm)'),color,10,'start')+'</g>';
}
function drawTrap(){
 const a=initLine('lineFootprint');if(!a)return;if(!lr){a.s.innerHTML='';return;}
 const r=lr,W=a.W,H=a.H;
 // At a grazing angle the upper boundary and zero height converge near the chart heading.
 const topPad=(r.laserReachesTop?52:76)+(r.upperHeight<.15*r.height?24:0);
 const leftPad=W<400?42:64;
 const longestHeight=Math.max(N(r.upperHeight).length,N(r.lowerHeight).length);
 const rightPad=Math.max(W<400?80:100,48+7*longestHeight);
 const p=fitMap(r.points,W,H,[leftPad,rightPad,topPad,54]),ps=r.points.map(p),axis=p([0,0]);
 const left=Math.min(...ps.map(q=>q[0])),right=Math.max(...ps.map(q=>q[0])),top=ps[2][1],bottom=ps[0][1];
 // Reserve a clear column for the two on-axis labels even for a very tall, narrow footprint.
 const labelHalfWidth=Math.max(48,35+3.5*N(r.axisWidth).length);
 const leftGuide=Math.max(20,Math.min(left-15,axis[0]-labelHalfWidth-5));
 const rightGuide=Math.min(W-rightPad+18,Math.max(right+13,axis[0]+labelHalfWidth+5));
 const upperDimY=top-(axis[1]-top<26?32:22),lowerDimY=bottom+(bottom-axis[1]<30?33:23);
 function widthDimension(x1,x2,y,label,color,caption){
  if(x2-x1>=12)return dim([x1,y],[x2,y],label,color,caption);
  return ln([x1,y],[x2,y],color)+ln([x1,y-3],[x1,y+3],color)+ln([x2,y-3],[x2,y+3],color)+tx(caption,label,color,10.5);
 }
 let out='';
 for(let i=0;i<=4;i++){const y=topPad+(H-topPad-54)*i/4;out+=ln([40,y],[W-14,y],'#edf0f5');}out+=ln([axis[0],26],[axis[0],H-26],'#e8edf3');
 out+='<polygon points="'+ps.map(v=>v.join(',')).join(' ')+'" fill="#00a68a1c" stroke="#009d85" stroke-width="1.7"/>';
 if(!r.laserReachesTop)out+=drawLaserLimit(r,p);
 out+=widthDimension(p(r.axisLeft)[0],p(r.axisRight)[0],axis[1],'光轴横向 '+N(r.axisWidth)+' mm','#007aff',[axis[0],axis[1]+21])+ln([axis[0]-5,axis[1]],[axis[0]+5,axis[1]],'#007aff','',1.5)+ln([axis[0],axis[1]-5],[axis[0],axis[1]+5],'#007aff','',1.5)+tx([axis[0],axis[1]-12],'光轴交点 · Z=0','#007aff',10);
 out+=ln(ps[3],[ps[3][0],upperDimY],'#b9c9c5')+ln(ps[2],[ps[2][0],upperDimY],'#b9c9c5')+widthDimension(ps[3][0],ps[2][0],upperDimY,'上底 '+N(r.upperBase)+' mm','#008f7a',[(ps[3][0]+ps[2][0])/2,upperDimY-7]);
 out+=ln(ps[0],[ps[0][0],lowerDimY],'#b9c9c5')+ln(ps[1],[ps[1][0],lowerDimY],'#b9c9c5')+widthDimension(ps[0][0],ps[1][0],lowerDimY,'下底 '+N(r.lowerBase)+' mm','#008f7a',[(ps[0][0]+ps[1][0])/2,lowerDimY+17]);
 out+=ln(ps[3],[leftGuide-3,top],'#b9c9c5')+ln(ps[0],[leftGuide-3,bottom],'#b9c9c5');
 if(bottom-top>=12)out+=dim([leftGuide,bottom],[leftGuide,top],'','#62768a');
 else out+=ln([leftGuide,bottom],[leftGuide,top],'#62768a');
 out+='<g transform="translate('+(leftGuide-8)+' '+((top+bottom)/2)+') rotate(-90)">'+tx([0,0],'总高 '+N(r.height)+' mm','#62768a',10.5)+'</g>';
 for(const edge of [ps[2],p(r.axisRight),ps[1]])out+=ln(edge,[rightGuide+3,edge[1]],'#b9c9c5');
 const upperMiddle=(axis[1]+top)/2,lowerMiddle=(axis[1]+bottom)/2;
 const spread=Math.max(0,(42-(lowerMiddle-upperMiddle))/2);
 for(const [label,value,from,to,yy] of [
  ['上高',r.upperHeight,top,axis[1],upperMiddle-spread],
  ['下高',r.lowerHeight,axis[1],bottom,lowerMiddle+spread]
 ]){
  if(to-from>=12)out+=dim([rightGuide,from],[rightGuide,to],'','#007aff');
  else out+=ln([rightGuide,from],[rightGuide,to],'#007aff');
  const mid=(from+to)/2;
  if(spread>0)out+=ln([rightGuide,mid],[rightGuide+8,yy],'#9dbadb');
  out+=tx([rightGuide+11,yy-4],label,'#62768a',10,'start')+tx([rightGuide+11,yy+14],N(value)+' mm','#007aff',11,'start',600);
 }
 out+=tx([14,20],'Y：沿线 · Z：高度','#8e8e93',10,'start');a.s.innerHTML=out;
}
function drawLine(){if(product!=='lineLaser')return;drawSide();drawTrap();}
main.querySelectorAll('[data-line]').forEach(e=>{
 if(e.readOnly)return;
 e.addEventListener('input',()=>{
  const path=e.dataset.line,linked=linkedFields.has(path),adjustROI=linked||path==='heightAxis';
  // Short/long axes and the size limit may cross several times as a number is typed.
  // Keep the user's original window for the duration of this edit.
  if(adjustROI&&(!sensorEdit||(sensorEdit.path!==path&&validSensor()))){
   const count=heightROIOf(ls);
   sensorEdit={path,count,full:count===heightPixelsOf(ls)};
  }
  const value=e.tagName==='SELECT'?e.value:e.value===''?NaN:Number(e.value);
  put(path,value);
  if(linked)linkSensor(path);
  if(adjustROI)normalizeROI(sensorEdit);
  if(path==='heightROI')sensorEdit=null;
  editing=true;
  updateLine(false);
  if(e.tagName==='SELECT')commitLineEdit();
 });
 e.addEventListener('change',commitLineEdit);
 e.addEventListener('keydown',ev=>{if(ev.key==='Enter')commitLineEdit();});
});
main.addEventListener('focusout',()=>{commitLineEdit();if(validSensor())sensorEdit=null;});
window.addEventListener('pagehide',commitLineEdit);
function restore(n,save){ls=cp(n);editing=false;sensorEdit=null;updateLine(false);syncInputs(true);if(save)persistLine();}
el('lineUndo').onclick=()=>{
 if(hasLineDraft())restore(history[index],false);
 else if(index>0)restore(history[--index],true);
 buttons();toast('已撤销线激光参数修改');
};
el('lineRedo').onclick=()=>{if(index<history.length-1)restore(history[++index],true);buttons();toast('已重做线激光参数修改');};
document.addEventListener('keydown',e=>{if(product!=='lineLaser'||!(e.ctrlKey||e.metaKey)||e.altKey)return;const k=e.key.toLowerCase();if(k==='z'||k==='y'){e.preventDefault();e.stopImmediatePropagation();const id=k==='y'||e.shiftKey?'lineRedo':'lineUndo';if(!el(id).disabled)el(id).click();}},true);
el('lineReset').onclick=()=>{ls=cp(G.defaults);editing=false;sensorEdit=null;updateLine();syncInputs(true);toast('已恢复线激光示例');};el('lineFullROI').onclick=()=>{sensorEdit=null;ls.roi.rw=ls.roi.nx;ls.roi.rh=ls.roi.ny;editing=false;updateLine();};
el('lineSave').onclick=()=>{if(lr)download('线激光视野方案-V10.json',JSON.stringify(ls,null,2),'application/json');};el('lineLoad').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>200000)throw Error('方案文件过大');ls=G.load(JSON.parse(await file.text()));editing=false;sensorEdit=null;updateLine();syncInputs(true);toast('已载入线激光方案 '+file.name);}catch(err){toast('载入失败：'+err.message);}e.target.value='';};
el('lineCSV').onclick=()=>{if(!lr)return;const r=lr,rows=[['产品线','线激光 / 沙姆镜头'],['参数','值','单位'],['镜头模型',ls.camera.model||'pinhole'],['名义焦距',ls.camera.f,'mm'],['当前有效投影尺度',r.optical.effectiveF,'mm'],['前端轴向 WD',ls.camera.wd,'mm'],['当前模型使用光心后移',r.optical.originOffset,'mm'],['基线',r.baseline,'mm'],['倾角（相对竖直）',ls.theta,'°'],['光心垂直高度',r.normalHeight,'mm'],['像元大小',ls.camera.pixelPitch,'μm'],['Sensor X 像素数',ls.roi.nx,'px'],['Sensor Y 像素数',ls.roi.ny,'px'],['Sensor X',ls.camera.w,'mm'],['Sensor Y',ls.camera.h,'mm'],['ROI',heightROIOf(ls),'px'],['ROI 方向','Sensor '+r.sensor.heightSensorAxis,'测高方向居中'],['上底',r.upperBase,'mm'],['下底',r.lowerBase,'mm'],['总高',r.height,'mm'],['光轴处横向视野',r.axisWidth,'mm'],['上高（光轴至上底）',r.upperHeight,'mm'],['下高（光轴至下底）',r.lowerHeight,'mm'],[],['顶点','Y 沿线 mm','Z 高度 mm']];r.points.forEach((p,i)=>rows.push([i+1,...p]));if(ls.camera.model==='magnification')rows.push(['参考正视倍率',ls.camera.mag],['倍率参考轴向WD',ls.camera.magWD,'mm']);rows.push([],['测高使用',ls.heightAxis==='long'?'Sensor 长边':'Sensor 短边'],['测高 Sensor 轴',r.sensor.heightSensorAxis],['沿线 Sensor 轴',r.sensor.lineSensorAxis],['激光前端高度',r.laserFront[2]],['镜头前端高度',r.front[2]],['前端以上不可照射高度',r.unreachableHeight,'mm'],['竖直下射范围',r.laserReachesTop?'视野位于激光前端及以下':illuminationWarning(r)],[],['位置','测高 mm/像素','测高 Sensor 轴','取样区间','物方上交点 Z mm','物方下交点 Z mm','Sensor 上点 μm','Sensor 下点 μm','取样适用状态']);for(const s of r.sampling.samples)rows.push([s.label,s.heightPitch,r.sensor.heightSensorAxis,sampleRange(s),s.heightEdges[0][1],s.heightEdges[1][1],s.sensorEdges[0]*1000,s.sensorEdges[1]*1000,sampleStatus(s)||'取样在 ROI 和激光前端照射范围内']);csvDownload('线激光梯形视野-V10.csv',rows);};
function lineExport(kind){const id=kind==='layout'?'lineLayout':'lineFootprint',svg=el(id),W=svg.clientWidth,H=svg.clientHeight,title=kind==='layout'?'线激光器与镜头交汇图':'线激光光平面内梯形视野';let content='<g>'+svg.innerHTML+'</g>',y=H+23;const rows=kind==='layout'?[]:['上底 '+N(lr.upperBase)+' mm · 下底 '+N(lr.lowerBase)+' mm · 总高 '+N(lr.height)+' mm','上高 '+N(lr.upperHeight)+' mm · 下高 '+N(lr.lowerHeight)+' mm','光轴处横向视野 '+N(lr.axisWidth)+' mm','测高方向像素间距（mm/像素）',...lr.sampling.samples.map(s=>[s.label+'：'+N(s.heightPitch,6),sampleStatus(s)].filter(Boolean).join(' · '))];
 if(!lr.laserReachesTop)rows.push(illuminationWarning(lr));
 for(const row of wrapPlotRows(rows,W-30,11)){content+=exportText(15,y,row,11);y+=19;}return{title,W,H:rows.length?y+9:H,content};}
async function exportLine(kind){if(!lr)return;const old=el('imageFormat').value;el('imageFormat').value=el('lineFormat').value;try{if(kind==='all'){const plots=[lineExport('layout'),lineExport('footprint')],W=Math.max(...plots.map(p=>p.W));let y=0,content='';for(const p of plots){content+=exportText(15,y+20,p.title,13,'#253a50',650)+'<g transform="translate(0,'+(y+30)+')">'+p.content+'</g>';y+=p.H+45;}await downloadPlotImage('线激光光路与梯形视野-V10',W,y,content);}else{const q=lineExport(kind);await downloadPlotImage(q.title+'-V10',q.W,q.H,q.content);}}finally{el('imageFormat').value=old;}}
main.querySelectorAll('[data-line-export]').forEach(e=>e.onclick=()=>exportLine(e.dataset.lineExport));el('lineExportAll').onclick=()=>exportLine('all');
const dialog=document.createElement('dialog');dialog.id='lineDialog';dialog.className='line-dialog';dialog.innerHTML='<div class="plot-dialog-head"><strong id="lineDialogTitle"></strong><button id="lineCloseDialog">恢复视图 · Esc</button></div><div id="lineDialogBody"></div>';document.body.append(dialog);let zoomed=null,slot=null,trigger=null;main.querySelectorAll('[data-line-zoom]').forEach(e=>e.onclick=()=>{if(!lr||zoomed)return;trigger=e;zoomed=e.closest('.laser-panel');slot=document.createComment('line-panel-position');zoomed.before(slot);el('lineDialogTitle').textContent=zoomed.querySelector('h2').textContent;el('lineDialogBody').append(zoomed);zoomed.classList.add('line-expanded');e.hidden=true;dialog.showModal();requestAnimationFrame(drawLine);});el('lineCloseDialog').onclick=()=>dialog.close();managePlotDialog(dialog,()=>trigger,()=>{
 slot.replaceWith(zoomed);
 zoomed.classList.remove('line-expanded');
 trigger.hidden=false;
 zoomed=slot=trigger=null;
},drawLine);
let productToastTimer=null;function selectProduct(next,announce=true){if(!['structuredLight','lineLaser'].includes(next))return;product=next;document.body.classList.toggle('line-mode',next==='lineLaser');el('structuredMain').hidden=next==='lineLaser';main.hidden=next!=='lineLaser';action.hidden=next!=='lineLaser';el('productStructured').setAttribute('aria-pressed',String(next==='structuredLight'));el('productLine').setAttribute('aria-pressed',String(next==='lineLaser'));document.querySelector('header h1').textContent=next==='lineLaser'?'线激光视野规划 · V10':'3D 视觉视野规划 · V10';document.querySelector('header p').textContent=next==='lineLaser'?'线激光 × 沙姆镜头 → 激光光平面内的梯形视野':'光机投影 × 相机拍摄 → 工作平面上的共同视野';if(announce){const message=next==='lineLaser'?'已切换线激光产品线':'已切换面阵结构光产品线';toast(message);clearTimeout(productToastTimer);productToastTimer=setTimeout(()=>{if(el('toast').textContent===message)toast('');},2400);}if(announce){try{localStorage.setItem('structured-light-fov-v10-product',next);}catch(e){}}requestAnimationFrame(()=>{if(next==='lineLaser')drawLine();else{drawFootprint();drawLayout();}});}
el('productStructured').onclick=()=>selectProduct('structuredLight');el('productLine').onclick=()=>selectProduct('lineLaser');normalizeROI();updateLine(false);history=[cp(ls)];buttons();let last='structuredLight';try{last=localStorage.getItem('structured-light-fov-v10-product')||last;}catch(e){}selectProduct(last,false);
let lastSize='';new ResizeObserver(()=>{if(product!=='lineLaser')return;const size=['lineLayout','lineFootprint'].map(id=>el(id).clientWidth+','+el(id).clientHeight).join(';');if(size!==lastSize){lastSize=size;drawLine();}}).observe(main.querySelector('.laser-plots'));for(const id of ['lineLayout','lineFootprint'])new ResizeObserver(drawLine).observe(el(id));window.addEventListener('resize',drawLine);
window.LineLaserApp={selectProduct,getProduct:()=>product,getState:()=>cp(ls),getResult:()=>lr,lineExport};
})();
