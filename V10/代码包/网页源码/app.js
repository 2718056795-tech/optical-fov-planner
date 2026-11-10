'use strict';
const $=id=>document.getElementById(id),clone=x=>JSON.parse(JSON.stringify(x));
let sensorLastCounts={nx:1600,ny:1200},sensorLastCounts2={nx:1600,ny:1200};
let state=clone(FOV.defaults),result=null,view='3d',az=-.65,el=.58;
let workPlanes=[],currentPlane=null;
const endpointInputs=[['near','nearWD'],['far','farWD']];
const fmt=(x,n=2)=>Number.isFinite(x)?x.toLocaleString('zh-CN',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const displayNumber=(v,p='')=>{if(typeof v!=='number')return v;if(!Number.isFinite(v))return '';if(p.includes('.dof.'))return v===0?'':v;const places=/\.mag$/.test(p)?7:/\.tr$/.test(p)?5:/\.pixelPitch$/.test(p)?4:/^camera2?\.(w|h)$/.test(p)?5:/^roi2?\./.test(p)?0:2;const rounded=Number(v.toFixed(places));return rounded===0&&v!==0?Number(v.toPrecision(2)):rounded;};
const get=(o,p)=>p.split('.').reduce((a,k)=>a[k],o);
function set(o,p,v){let a=p.split('.'),k=a.pop();get(o,a.join('.'))[k]=v;}
function assign(p,v){if(p.includes('.'))set(state,p,v);else state[p]=v;}
function normalizeInputs(s){s.baselineMode='x';if(s.mountZ===undefined)s.mountZ=0;s.camera.roll=0;s.camera2.roll=0;s.projector.roll=0;for(const r of [s.roi,s.roi2]){r.rx=Math.floor((r.nx-r.rw)/2);r.ry=Math.floor((r.ny-r.rh)/2);}return s;}
function isStereo(){return state.scene==='stereo';}
function defaultLayoutView(){az=isStereo()?-.5:-.65;el=isStereo()?.7:.58;}
function regionTitle(r){return r.label||'相机未覆盖';}
function setupSnapshot(){return Object.fromEntries(FOV.setupKeys.map(k=>[k,clone(state[k])]));}
function updateSceneUI(){const yes=isStereo();document.body.classList.toggle('stereo-mode',yes);document.querySelectorAll('.stereo-only').forEach(e=>e.hidden=!yes);$('monoBaselineField').hidden=yes;$('monoZField').hidden=yes;$('sceneMode').value=state.scene;$('cameraTitle').textContent=yes?'左相机':'2D 相机';$('cameraLegend').textContent=yes?'左相机 ROI':'相机 ROI';$('cameraOutputTitle').textContent=yes?'左相机视野':'2D 相机视野';$('distanceHint').textContent=yes?'名义工作平面为 Z=0，WD 沿左相机光轴从镜头前端量起。':'名义工作平面为 Z=0，WD 沿相机光轴从镜头前端量起。';}
function switchScene(mode){if(!['mono','stereo'].includes(mode)||mode===state.scene)return;if(result)state.setups[state.scene]=setupSnapshot();Object.assign(state,clone(state.setups[mode]));state.scene=mode;defaultLayoutView();sync();update();toast(mode==='stereo'?'已切换双目：光机居中，左右各一台相机':'已切换单目');}

const escapeText=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field=(p,name,step='.1')=>`<label>${name}<input data-path="${p}" type="number" step="${step}"></label>`;

$('cameraFields').innerHTML=`<div class="fields">
<label class="wide">相机成像模型<select data-path="camera.model"><option value="pinhole">针孔近似 · 焦距 / 距离</option><option value="thin">薄透镜 · 有限共轭</option><option value="magnification">已知参考倍率</option></select></label>
${field('camera.f','镜头名义焦距 (mm)')}${field('camera.wd','镜头前端参考 WD (mm)')}${field('camera.yaw','X–Z 倾角 (°)')}
<label class="wide" id="originOffsetField" title="光心相对镜头前端的位置；正值在后方，负值在前方">光心后移量 (mm)<input data-path="camera.originOffset" type="number" step="0.1"><span class="small">正值在后方，负值在前方。</span></label>
<div id="singleMag" class="fields">${field('camera.mag','参考倍率 |m|','0.0001')}${field('camera.magWD','倍率参考轴向 WD (mm)')}</div>
<div class="sensor-roi-row wide"><div class="sensor-editor wide"><div class="editor-heading"><strong>Sensor 尺寸联动</strong><span>方形像元</span></div><div class="fields">
<label class="wide">像元大小 (μm)<input data-path="camera.pixelPitch" type="number" step="0.01" min="0.000001"></label>
${field('roi.nx','长边像素数 / X (px)','1')}${field('roi.ny','短边像素数 / Y (px)','1')}
${field('camera.w','Sensor 长 / X (mm)','.001')}${field('camera.h','Sensor 宽 / Y (mm)','.001')}
</div><p class="small" id="sensorInfo"></p><details class="param-help"><summary>Sensor 联动规则</summary><p class="editor-hint">改像元或像素数 → 更新毫米尺寸；改毫米尺寸 → 反算像元并更新另一边。X / Y 方向固定。</p></details></div><div class="roi-editor wide"><div class="editor-heading"><strong>ROI 开窗</strong><div class="editor-actions"><span class="small">自动居中</span><button id="fullROI" type="button">恢复全幅</button></div></div><p id="roiSensorInfo" class="small"></p><div class="fields" id="roiFields"></div><details class="param-help"><summary>ROI 坐标说明</summary><p class="editor-hint">开窗自动居中；像素数为奇数时，起点取整到左上侧。裁剪尺寸按像素比例换算。</p></details></div></div>

</div>
<details class="param-help"><summary>相机模型说明</summary><p id="cameraModelInfo" class="small"></p></details><details><summary>其他姿态与幅面偏心</summary><div class="fields">${field('camera.pitch','Y 方向俯仰 (°)')}${field('camera.ox','幅面中心偏心 X (mm)','.01')}${field('camera.oy','幅面中心偏心 Y (mm)','.01')}</div></details>`;
$('projectorFields').innerHTML=`<div class="fields">${field('projector.tr','投射比 TR = 距离 / 宽','0.001')}${field('projector.f','投影等效焦距 (mm)','.001')}

${field('projector.w','DMD 有效宽 (mm)','.001')}${field('projector.h','DMD 有效高 (mm)','.001')}${field('projector.nx','投影横向像素数 / X (px)','1')}${field('projector.ny','投影纵向像素数 / Y (px)','1')}<label>参考垂直距离 (mm)<input id="projectorNormalWD" type="number" readonly title="光机光心到参考平面的垂直距离，自动联动"></label><label>参考沿光轴距离 (mm)<input id="projectorAxisWD" type="number" readonly title="沿光机光轴到参考平面的距离，包含倾斜影响，自动联动"></label>${field('projector.yaw','X–Z 倾角 (°)')}
</div><details class="param-help"><summary>TR 与投影说明</summary><p class="small" id="projectorInfo"></p></details><details><summary>更多姿态与投影偏心</summary><div class="fields">${field('projector.pitch','Y 方向俯仰 (°)')}${field('projector.ox','幅面中心偏心 X (mm)','.01')}${field('projector.oy','幅面中心偏心 Y (mm)','.01')}</div></details>`;
function linkProjector(changed){const d=state.projector;if(changed==='projector.tr')d.f=d.tr*d.w;else d.tr=d.f/d.w;d.link='f';for(const k of ['f','tr','link']){const e=document.querySelector('[data-path="projector.'+k+'"]');if(e&&e!==document.activeElement)e.value=Number.isFinite(d[k])||typeof d[k]==='string'?displayNumber(d[k],'projector.'+k):'';}}

function sensorParts(side=1){const right=side===2;return {c:right?state.camera2:state.camera,r:right?state.roi2:state.roi,cp:right?'camera2':'camera',rp:right?'roi2':'roi',suffix:right?'2':'',counts:right?sensorLastCounts2:sensorLastCounts};}
function syncSensorInputs(side=1){const {cp,rp}=sensorParts(side);for(const key of [cp+'.pixelPitch',cp+'.w',cp+'.h',rp+'.nx',rp+'.ny',rp+'.rw',rp+'.rh',rp+'.rx',rp+'.ry']){const e=document.querySelector('[data-path="'+key+'"]');if(e&&e!==document.activeElement){const v=get(state,key);e.value=Number.isFinite(v)?displayNumber(v,key):'';}}}
function linkSensor(changed,side=1){const {c,r,cp,rp,counts}=sensorParts(side),validCount=v=>Number.isInteger(v)&&v>0;for(const [count,size,start] of [['nx','rw','rx'],['ny','rh','ry']])if(changed===rp+'.'+count&&validCount(r[count])){if(r[start]===0&&r[size]===counts[count])r[size]=r[count];counts[count]=r[count];}if(changed===cp+'.w')c.pixelPitch=validCount(r.nx)?c.w*1000/r.nx:NaN;if(changed===cp+'.h')c.pixelPitch=validCount(r.ny)?c.h*1000/r.ny:NaN;if(changed!==cp+'.w')c.w=validCount(r.nx)?r.nx*c.pixelPitch/1000:NaN;if(changed!==cp+'.h')c.h=validCount(r.ny)?r.ny*c.pixelPitch/1000:NaN;syncSensorInputs(side);sensorInfo(side);}
function sensorInfo(side=1){const {c,r,suffix}=sensorParts(side),p=c.pixelPitch,consistent=Number.isFinite(p)&&p>0&&Math.abs(c.w-r.nx*p/1000)<1e-7&&Math.abs(c.h-r.ny*p/1000)<1e-7;$('sensorInfo'+suffix).textContent=consistent?fmt(p,4)+' μm × '+r.nx+' / '+r.ny+' px = '+fmt(c.w,4)+' × '+fmt(c.h,4)+' mm':'参数尚未一致：编辑任一 Sensor 参数后按方形像元统一联动。';$('sensorInfo'+suffix).classList.toggle('sensor-warning',!consistent);$('roiSensorInfo'+suffix).textContent='全幅像素：'+r.nx+' × '+r.ny+' px（由相机 Sensor 联动区设置）。';}

function modelControls(){for(const [c,suffix] of [[state.camera,''],[state.camera2,'2']]){if(!$('singleMag'+suffix))continue;$('singleMag'+suffix).hidden=c.model!=='magnification';$('originOffsetField'+suffix).hidden=c.model==='magnification';}updateSceneUI();}

$('roiFields').innerHTML=[['rw','开窗宽 / X (px)'],['rh','开窗高 / Y (px)']].map(([k,n])=>field('roi.'+k,n,'1')).join('');
$('cameraFields2').innerHTML=$('cameraFields').innerHTML.replaceAll('data-path="camera.','data-path="camera2.').replaceAll('data-path="roi.','data-path="roi2.').replace(/id="([^"]+)"/g,(_,id)=>'id="'+id+'2"');
const referenceWDInput=document.querySelector('[data-path="camera.wd"]');
const rightWDInput=document.querySelector('[data-path="camera2.wd"]');rightWDInput.readOnly=true;rightWDInput.title='根据安装高度差与右相机倾角自动计算参考距离';
function syncMountWD(){let z;if(isStereo()){const ref=FOV.stereoReference(state);z=ref.projectorH;state.camera2.wd=ref.rightWD;const e=document.querySelector('[data-path="camera2.wd"]');if(e)e.value=Number.isFinite(ref.rightWD)?displayNumber(ref.rightWD):'';}else z=FOV.height(state.camera,state.wdMode)+state.mountZ;const c=-FOV.basis(state.projector).axis[2];state.projector.wd=state.wdMode==='axis'?z/c:z;$('projectorNormalWD').value=Number.isFinite(z)?displayNumber(z):'';$('projectorAxisWD').value=Number.isFinite(z/c)?displayNumber(z/c):'';}

function syncNominalWD(force=false){const e=$('otherWD'),d=FOV.nominalDistance(state);if(force||e!==document.activeElement)e.value=Number.isFinite(d)?displayNumber(d):'';}
function syncWorkPlanes(errors={}){
 for(const [key,id] of endpointInputs){
  const input=$(id),error=errors[key];
  input.setAttribute('aria-invalid',String(Boolean(error)));
  if(input!==document.activeElement)input.value=state.depthRange[key];
 }
 $('depthError').textContent=Object.values(errors).join('。');
 $('depthError').hidden=!Object.keys(errors).length;
 for(const button of $('depthTabs').querySelectorAll('[data-depth]')){
  const key=button.dataset.depth,active=currentPlane?.key===key;
  button.disabled=!workPlanes.some(plane=>plane.key===key);
  button.classList.toggle('active',active);
  button.setAttribute('aria-pressed',String(active));
 }
 $('activeDepthLabel').textContent=currentPlane?planeLabel(currentPlane):'';
}
function planeLabel(plane){return plane.label+' · WD '+fmt(plane.wd)+' mm';}
function sync(){normalizeInputs(state);syncMountWD();document.querySelectorAll('[data-path]').forEach(e=>e.value=displayNumber(get(state,e.dataset.path),e.dataset.path));syncNominalWD(true);for(const [key,id] of endpointInputs)$(id).value=state.depthRange[key];sensorLastCounts={nx:state.roi.nx,ny:state.roi.ny};sensorLastCounts2={nx:state.roi2.nx,ny:state.roi2.ny};sensorInfo();sensorInfo(2);linkProjector('');modelControls();}
function toast(t){$('toast').textContent=t;}
function mergeKnown(input,template=FOV.defaults){if(!input||typeof input!=='object'||Array.isArray(input))throw Error('方案格式无效');const out=clone(template);for(const k of Object.keys(template)){if(!(k in input))continue;if(typeof template[k]==='object')out[k]=mergeKnown(input[k],template[k]);else{if(typeof input[k]!==typeof template[k])throw Error('方案参数类型无效：'+k);out[k]=input[k];}}return out;}

function migrateWorkPlane(s){
 if(s.plane!==0){
  const wd=FOV.workingDistance(s),key=s.plane>0?'near':'far';
  if(Number.isFinite(wd)&&wd>0&&s.depthRange[key]===''){
   s.depthRange[key]=String(wd);
   if(s.depthRange.selected==='middle')s.depthRange.selected=key;
  }
 }
 s.plane=0;
}
function loadState(raw){if(raw.product&&raw.product!=='structuredLight')throw Error('此方案属于线激光产品，请切换到线激光入口载入');if(![1,2,3,4,5,6,7,8,9,10].includes(raw.version))throw Error('不支持的方案版本');const next=normalizeInputs(mergeKnown(raw));if(raw.version===1){next.camera.model='pinhole';next.camera.originOffset=0;next.projector.link='f';next.projector.tr=next.projector.f/next.projector.w;}if(raw.camera?.model==='table'){const rows=FOV.parseTable(raw.camera.table);const d=next.camera,axisWD=next.wdMode==='axis'?d.wd:d.wd/(-FOV.basis(d).axis[2]);d.model='magnification';d.mag=FOV.interpolate(rows,axisWD);d.magWD=axisWD;d.originOffset=0;}if(next.projector.link==='tr')next.projector.f=next.projector.tr*next.projector.w;else next.projector.tr=next.projector.f/next.projector.w;next.version=10;if(!['mono','stereo'].includes(next.scene))throw Error('未知系统模式');for(const setup of [next,next.setups.mono,next.setups.stereo])migrateWorkPlane(setup);return next;}
// Upgrade the former sample crop once; later manual crops and loaded schemes retain their ROI.
function upgradeSampleROI(s){for(const setup of [s,s.setups?.mono,s.setups?.stereo])for(const r of [setup?.roi,setup?.roi2])if(r&&r.nx===2048&&r.ny===1200&&r.rw===1600&&r.rh===1200&&r.rx===224&&r.ry===0)Object.assign(r,{rw:r.nx,rh:r.ny,rx:0,ry:0});}
try{const stored=(localStorage.getItem('structured-light-fov-v10')||localStorage.getItem('structured-light-fov-v9')||localStorage.getItem('structured-light-fov-v8')||localStorage.getItem('structured-light-fov-v7')||localStorage.getItem('structured-light-fov-v6')||localStorage.getItem('structured-light-fov-v5')||localStorage.getItem('structured-light-fov-v4'));if(stored){const x=loadState(JSON.parse(stored));FOV.solve(x);state=x;toast('已恢复上次有效参数');}}catch(e){}
const depthMethods=[['① 标准几何','远距近似'],['② 超焦距','原脚本近似'],['③ 有限共轭','薄透镜']];
const depthMetrics=[['near','最近清晰距离'],['far','最远清晰距离'],['front','前景深'],['back','后景深']];
function depthControl(key,name,label){
 const p=key+'.dof.'+name;
 return `<label for="${p}">${label}</label><input id="${p}" data-path="${p}" type="number" step="any">`;
}
const depthGroups=['camera','camera2'].map((key,index)=>{
 const group=document.createElement('section');
 group.className='dof-group'+(index?' stereo-only':'');
 group.hidden=Boolean(index);
 group.innerHTML=`
  <div class="dof-group-head"><h3></h3></div>
  <div class="dof-controls">
   <div class="dof-input">${depthControl(key,'focalLength','镜头焦距 (mm)')}</div>
   <div class="dof-input">${depthControl(key,'focusDistance','轴向对焦物距 (mm)')}</div>
   <div class="dof-input">${depthControl(key,'fNumber','光圈 F 值')}</div>
   <div class="dof-input">${depthControl(key,'pixelPitch','像元尺寸 (μm)')}</div>
   <div class="dof-input">${depthControl(key,'wavelengthNm','波长 (nm)')}</div>
   <div class="dof-input-pair">
    ${depthControl(key,'cocPixels','容许弥散斑 (像元)')}
    ${depthControl(key,'cocUm','容许弥散斑直径 (μm)')}
    <select data-path="${key}.dof.cocMode" aria-label="容许弥散斑输入方式"><option value="pixel">按像元个数</option><option value="manual">按直径</option></select>
   </div>
  </div>
  <p class="small dof-datum"></p><p class="small dof-error" role="status" hidden></p>
  <div class="dof-results"></div>
  <div class="dof-diffraction">
   <h4>对焦处衍射斑 <span class="small">像方 · 艾里斑</span></h4>
   <dl><div><dt>艾里斑直径</dt><dd data-diffraction-diameter></dd></div>
    <div><dt>直径折合像元</dt><dd data-diffraction-pixels></dd></div>
    <div><dt>输入 F 值</dt><dd data-diffraction-fnumber></dd></div></dl>
   <p class="small dof-diffraction-note">直接按输入 F 值计算第一暗环直径。斑内光强从中心向外下降。</p>
   <p class="small dof-diffraction-error dof-error" role="status" hidden></p>
  </div>`;
 $('cameraDofGroups').append(group);
 return {key,group,pixelsInput:$(key+'.dof.cocPixels'),diameterInput:$(key+'.dof.cocUm')};
});
function depthValue(value){
 if(value===Infinity)return '∞';
 if(!Number.isFinite(value))return '—';
 return value>0&&value<.001?value.toPrecision(3):fmt(value,3);
}
function renderDiffraction(group,params){
 let spot,message='';
 try{spot=FOV.diffractionSpot(params.fNumber,params.wavelengthNm,params.pixelPitch);}
 catch(err){message=err.message;}
 group.querySelector('[data-diffraction-diameter]').textContent=spot?depthValue(spot.diameterUm)+' μm':'—';
 group.querySelector('[data-diffraction-pixels]').textContent=spot?depthValue(spot.pixels)+' 像元':'—';
 group.querySelector('[data-diffraction-fnumber]').textContent=spot?'F'+depthValue(params.fNumber):'—';
 const warning=group.querySelector('.dof-diffraction-error');
 warning.hidden=!message;
 warning.textContent=message;
}
function renderCameraDepth(){
 for(const [index,{key,group,pixelsInput,diameterInput}] of depthGroups.entries()){
  if(group.hidden)continue;
  const params=state[key].dof,byCount=params.cocMode!=='manual';
  pixelsInput.hidden=pixelsInput.labels[0].hidden=!byCount;
  diameterInput.hidden=diameterInput.labels[0].hidden=byCount;
  const blur=byCount?params.cocPixels*params.pixelPitch:params.cocUm;
  group.querySelector('h3').textContent=index?'右相机':isStereo()?'左相机':'2D 相机';
  group.querySelector('.dof-datum').textContent='容许弥散斑直径 '+depthValue(blur)+' μm。';
  let values=[],message='';
  try{
   if(byCount&&(!Number.isFinite(params.cocPixels)||params.cocPixels<=0))throw Error('弥散斑像元个数必须为正数');
   if(byCount&&(!Number.isFinite(params.pixelPitch)||params.pixelPitch<=0))throw Error('像元尺寸必须为正数');
   values=FOV.depthOfField(params.focalLength,params.fNumber,blur,params.focusDistance);
  }catch(err){message=err.message;}
  const warning=group.querySelector('.dof-error');
  warning.hidden=!message;
  warning.textContent=message;
  group.querySelector('.dof-results').innerHTML=depthMethods.map(([title,subtitle],i)=>{
   const value=values[i];
   return `<article class="dof-result"><h4>${title}</h4><div class="dof-method small">${subtitle}</div>
    <div class="dof-total"><span>总景深</span><strong data-dof-total>${depthValue(value?.total)}</strong></div>
    <dl>${depthMetrics.map(([name,label])=>`<div><dt>${label}</dt><dd data-dof-${name}>${depthValue(value?.[name])}</dd></div>`).join('')}</dl>
    ${i===1?`<div class="dof-hyperfocal small">超焦距 <span>${depthValue(value?.hyperfocal)}</span></div>`:''}</article>`;
  }).join('');
  renderDiffraction(group,params);
 }
}

document.querySelectorAll('[data-path]').forEach(e=>e.addEventListener('input',()=>{const p=e.dataset.path;const blank=p.includes('.dof.')?0:NaN;assign(p,['SELECT','TEXTAREA'].includes(e.tagName)?e.value:e.value===''?blank:Number(e.value));if(['camera.pixelPitch','camera.w','camera.h','roi.nx','roi.ny'].includes(e.dataset.path))linkSensor(e.dataset.path);if(['camera2.pixelPitch','camera2.w','camera2.h','roi2.nx','roi2.ny'].includes(e.dataset.path))linkSensor(e.dataset.path,2);if(e.dataset.path.startsWith('projector.'))linkProjector(e.dataset.path);modelControls();update();}));
$('sceneMode').addEventListener('change',e=>switchScene(e.target.value));
$('fullROI2').onclick=()=>{Object.assign(state.roi2,{rw:state.roi2.nx,rh:state.roi2.ny,rx:0,ry:0});sync();update();};
$('copyLeftCamera').onclick=()=>{state.camera2=clone(state.camera);state.camera2.yaw=-state.camera.yaw;state.camera2.ox=-state.camera.ox;state.roi2=clone(state.roi);sync();update();toast('已复制左相机镜头、Sensor 和 ROI，X–Z 倾角镜像');};
$('otherWD').addEventListener('input',e=>{
 const wd=e.target.valueAsNumber;
 state.camera.wd=state.wdMode==='axis'?wd:wd*(-FOV.basis(state.camera).axis[2]);
 referenceWDInput.value=displayNumber(state.camera.wd);
 update();
});
for(const [key,id] of endpointInputs)$(id).addEventListener('input',e=>{state.depthRange[key]=e.target.value;update();});
$('depthTabs').addEventListener('click',e=>{
 const button=e.target.closest('button[data-depth]');
 if(!button||button.disabled||button.dataset.depth===currentPlane?.key)return;
 state.depthRange.selected=button.dataset.depth;
 selectedRegionId=null;
 update();
});
$('reset').onclick=()=>{state=clone(FOV.defaults);sync();update();toast('已恢复示例参数');};
$('fullROI').onclick=()=>{Object.assign(state.roi,{rw:state.roi.nx,rh:state.roi.ny,rx:0,ry:0});sync();update();};
$('view3d').onclick=()=>{view='3d';if(isStereo())defaultLayoutView();drawLayout();};$('viewSide').onclick=()=>{view='side';drawLayout();};
function download(name,text,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('已导出 '+name);}
$('save').onclick=()=>{if(result)download('视野方案.json',JSON.stringify(state,null,2),'application/json');};
$('load').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>200000)throw Error('方案文件过大');const raw=JSON.parse(await f.text());const next=loadState(raw);FOV.solve(next);state=next;sync();update();toast(raw.camera?.model==='table'?'已载入：旧倍率表已按参考 WD 转为单点倍率；请核对结果':'已载入 '+f.name);}catch(err){toast('载入失败：'+err.message);}e.target.value='';};
$('print').onclick=()=>window.print();
const poly=(p,fill,stroke,dash='')=>`<polygon points="${p.map(v=>v.join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="1.8" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
const line=(a,b,c='#becbd8',dash='',width=1)=>`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${c}" stroke-width="${width}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
const text=(p,t,cls='',anchor='middle',color)=>`<text x="${p[0]}" y="${p[1]}" text-anchor="${anchor}" class="${cls}" ${color?`style="fill:${color}"`:''}>${escapeText(t)}</text>`;
function initSvg(id){const svg=$(id),W=svg.clientWidth||500,H=svg.clientHeight||370;svg.setAttribute('viewBox',`0 0 ${W} ${H}`);return {svg,W,H};}
function fit(points,W,H,pad=48){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);let loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys);const sx=Math.max(hiX-loX,1),sy=Math.max(hiY-loY,1),s=Math.min((W-2*pad)/sx,(H-2*pad)/sy);const cx=(loX+hiX)/2,cy=(loY+hiY)/2;return {p:q=>[W/2+(q[0]-cx)*s,H/2-(q[1]-cy)*s],s,loX,hiX,loY,hiY};}
function stepSize(span){const raw=span/5,k=10**Math.floor(Math.log10(Math.max(raw,1e-9)));return [1,2,5,10].map(v=>v*k).find(v=>v>=raw);}
function grid(t,W,H,xlabel,ylabel){let out='';const step=stepSize(Math.max(t.hiX-t.loX,t.hiY-t.loY));const limX=[(26-W/2)/t.s+(t.hiX+t.loX)/2,(W-18-W/2)/t.s+(t.hiX+t.loX)/2];const limY=[(H/2-(H-28))/t.s+(t.hiY+t.loY)/2,(H/2-24)/t.s+(t.hiY+t.loY)/2];for(let x=Math.ceil(limX[0]/step)*step;x<=limX[1];x+=step){const xx=t.p([x,0])[0];out+=line([xx,24],[xx,H-28],Math.abs(x)<1e-8?'#bdcbd6':'#eef2f5')+text([xx,H-12],fmt(x,Math.abs(step)<1?2:0),'tick');}for(let y=Math.ceil(limY[0]/step)*step;y<=limY[1];y+=step){const yy=t.p([0,y])[1];out+=line([26,yy],[W-18,yy],Math.abs(y)<1e-8?'#bdcbd6':'#eef2f5')+text([24,yy-4],fmt(y,Math.abs(step)<1?2:0),'tick','start');}return out+text([W-18,H-5],xlabel,'','end')+text([12,14],ylabel,'','start');}
function mark(p,c,r=3){return `<circle cx="${p[0]}" cy="${p[1]}" r="${r}" fill="white" stroke="${c}" stroke-width="1.8"/>`;}
function edgeAnnotation(d,index,name,color,t,W,H){
  const a=t.p(d.points[index]),b=t.p(d.points[(index+1)%4]),c=t.p(d.metrics.center);
  const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const dx=mid[0]-c[0],dy=mid[1]-c[1],length=Math.hypot(dx,dy)||1;
  const x=Math.max(46,Math.min(W-46,mid[0]+17*dx/length));
  const y=Math.max(28,Math.min(H-28,mid[1]+17*dy/length));
  return text([x,y],`${name} ${fmt(d.metrics.edges[index])} mm`,'annot','middle',color);
}
function frameSummary(d){
 const q=FOV.frameDimensions(d);
 if(q.rectangle)return '<div class="rect-size">'+fmt(q.width)+' × '+fmt(q.height)+' <small>mm</small></div><div class="frame-note">矩形 · X/Y 宽高；面积 '+fmt(d.metrics.area)+' mm²</div>';
 const values=[['左 · 侧边实长',q.left],['中 · 光轴竖长',q.middle],['右 · 侧边实长',q.right],['高 · 侧边间距',q.high]];
 return '<div class="measure-grid">'+values.map(([n,v])=>'<div class="measure-cell"><span>'+n+'</span><strong>'+fmt(v)+' <small>mm</small></strong></div>').join('')+'</div><div class="frame-note">'+q.kind+'；上 / 下斜边 '+fmt(q.upper)+' / '+fmt(q.lower)+' mm；面积 '+fmt(d.metrics.area)+' mm²'+(!q.sideParallel?'。左右侧边不平行，未定义单一梯形高。':'')+(q.middle===null?'。光轴未穿过该画幅。':'')+'</div>';
}
function frameTextRows(d){
 const q=FOV.frameDimensions(d);
 if(q.rectangle)return ['X/Y 宽高：'+fmt(q.width)+' × '+fmt(q.height)+' mm','面积：'+fmt(d.metrics.area)+' mm²'];
 return ['左 '+fmt(q.left)+' / 中（光轴）'+fmt(q.middle)+' / 右 '+fmt(q.right)+' mm',
  '高（侧边间垂距）'+fmt(q.high)+' mm；面积 '+fmt(d.metrics.area)+' mm²',
  '上 / 下斜边实长 '+fmt(q.upper)+' / '+fmt(q.lower)+' mm'+(!q.sideParallel?'；侧边不平行，梯形高未定义。':'')];
}
function segmentDraw(segment,t,color,dash=''){
 if(!segment)return '';
 const a=t.p(segment[0]),b=t.p(segment[1]);
 return line(a,b,color,dash,1.2)+mark(a,color,2)+mark(b,color,2);
}
let selectedRegionId=null;
const edgeLetter=i=>String.fromCharCode(65+i);
function regionMeasureText(r){return r.edges.map((e,i)=>edgeLetter(i)+' '+fmt(e.length)).join(' / ');}
function syncRegionChoice(){
 const all=result?result.regions.camera:[];
 const select=$('regionChoice');
 if(!all.some(r=>r.id===selectedRegionId))selectedRegionId=all[0]?.id||null;
 select.innerHTML=all.map(r=>'<option value="'+r.id+'">'+r.id+' · '+regionTitle(r)+' · '+r.location+' · '+r.kind+'</option>').join('');
 select.disabled=!all.length;select.value=selectedRegionId||'';
 updateRegionHighlight();
}
function updateRegionHighlight(){
 const all=result?result.regions.camera:[];
 const selected=all.find(r=>r.id===selectedRegionId);
 $('regionChoiceInfo').textContent=selected?'当前 '+selected.id+'；A、B、C…按该分区边界依次标注，每条均为实长。':'当前所有相机 ROI 均已被光机覆盖。';
 document.querySelectorAll('#overlapOutput tr[data-region]').forEach(row=>row.classList.toggle('selected-region',row.dataset.region===selectedRegionId));
}
function selectRegion(id){
 selectedRegionId=id;$('regionChoice').value=id;updateRegionHighlight();drawFootprint();
}
function missingTextRows(){
 if(!result)return [];
 return result.regions.camera.flatMap(r=>[
  r.id+' '+regionTitle(r)+' · '+r.location+' · '+r.kind+'；X/Y 跨度 '+fmt(r.metrics.width)+' × '+fmt(r.metrics.height)+' mm',
  '各边实长：'+regionMeasureText(r)+' mm'
 ]);
}
function overlapSummary(){
 const q=FOV.overlapDimensions(result.overlap);
 if(q.trapezoid)return '<div class="measure-grid overlap-measures">'+q.values.map(v=>'<div class="measure-cell"><span>'+v.label+'</span><strong>'+fmt(v.value)+' <small>mm</small></strong></div>').join('')+'</div><div class="frame-note">梯形 · 长度为两条平行边之间的垂直距离。</div>';
 return '<div class="rect-size">'+fmt(q.metrics.width)+' × '+fmt(q.metrics.height)+' <small>mm</small></div><div class="frame-note">'+q.kind+(q.kind!=='矩形'&&q.kind!=='无重合'?' · X/Y 外包络':'')+'</div>';
}
function overlapTextRows(){
 const q=FOV.overlapDimensions(result.overlap);
 return q.trapezoid?['重合视野 · 梯形：'+q.values.map(v=>v.label+' '+fmt(v.value)).join(' / ')+' mm','长度为两条平行边间的垂距。']:['重合视野 · '+q.kind+'：'+fmt(q.metrics.width)+' × '+fmt(q.metrics.height)+' mm'+(q.kind==='矩形'?'':'（X/Y 外包络）')];
}
function missingSummary(){
 const all=result.regions.camera;
 const cameraNote=result.regions.camera.length?'':'<div class="frame-note">无缺边：当前所有相机 ROI 均已被光机覆盖。</div>';
 if(!all.length)return cameraNote;
 return cameraNote+'<div class="cutout-title">2D 相机未覆盖区域 · 各边实长</div><div class="cutout-table"><table><thead><tr><th>选择分区</th><th>形状</th><th>各边长度 (mm)</th></tr></thead><tbody>'+
  all.map(r=>'<tr data-type="'+r.type+'" data-region="'+r.id+'"><td><button type="button" data-select-region="'+r.id+'">'+r.id+' · '+regionTitle(r)+' · '+r.location+'</button></td><td>'+r.kind+'</td><td class="region-measures">'+regionMeasureText(r)+'</td></tr>').join('')+
  '</tbody></table></div><div class="frame-note">点击分区，在原图上查看 A、B、C…对应边；长度按实际端点距离计算，包含斜边。T/C 为相机未被光机覆盖的部分；双目时 L/R 区分左右相机，各相机内的分区互不重叠。</div>';
}
function drawRegionEdges(regions,t,W,H){
 const r=regions.find(r=>r.id===selectedRegionId);if(!r)return '';
 const color=r.type==='camera'?'#a84e3b':'#a56f15',labels=[];
 let out='<g class="region-edge-labels" data-selected-region="'+r.id+'">'+poly(r.points.map(t.p),'none',color)+text([W-18,14],r.id+' · '+regionTitle(r)+' · '+r.kind,'','end',color);
 r.edges.forEach((e,i)=>{
  const mid=t.p(e.mid),dx=e.v[1]/e.length,dy=e.v[0]/e.length;
  let label;
  for(const offset of [18,32,46,60]){
   label=[Math.max(20,Math.min(W-20,mid[0]+dx*offset)),Math.max(23,Math.min(H-30,mid[1]+dy*offset))];
   if(labels.every(p=>Math.hypot(p[0]-label[0],p[1]-label[1])>=20))break;
  }
  labels.push(label);
  out+=line(mid,label,color,'2 3')+text([label[0],label[1]+4],edgeLetter(i),'annot','middle',color);
  out+=mark(t.p(e.a),color,2);
 });
 return out+'</g>';
}function drawRegions(regions,t,W,H,reference){
 let out='';
 for(const r of regions){
  const color=r.type==='camera'?'#bc6250':'#bd7b22',fill=r.type==='camera'?'#c6694c1f':'#dfaa4723';
  const p=t.p(r.metrics.center),b=r.metrics.bounds;
  out+='<g class="coverage-region '+r.type+'-region'+(r.type==='camera'&&r.points.length===3?' missing-triangle':'')+'" data-region="'+r.id+'">'+poly(r.points.map(t.p),fill,color,'3 3');
  const w=r.metrics.width*t.s,h=r.metrics.height*t.s;
  const label=[p[0],p[1]];
  if(w<34)label[0]+=r.metrics.center[0]<(r.ownerCenter||reference)[0]?-22:22;
  if(h<24)label[1]+=r.metrics.center[1]<reference[1]?20:-20;
  label[0]=Math.max(24,Math.min(W-24,label[0]));label[1]=Math.max(24,Math.min(H-30,label[1]));
  if(label[0]!==p[0]||label[1]!==p[1])out+=line(p,label,color,'2 3');
    if(r.id!==selectedRegionId)out+=text([label[0],label[1]+4],r.id,'annot','middle',color);
  out+='</g>';
 }
 return out;
}
function drawFootprint(){
 const merged=initSvg('combinedFootprint'),single=initSvg('footprint');
 if(!result){merged.svg.innerHTML='';single.svg.innerHTML='';syncRegionChoice();return;}
 const r=result,t=fit([...r.camera.points,...r.projector.points,...(isStereo()?r.camera2.points:[])],merged.W,merged.H,60);
 let out=grid(t,merged.W,merged.H,'X (mm)','Y (mm)');
 out+=poly(r.camera.points.map(t.p),'none','#6b9ad1','5 4');
 out+=poly(r.projector.points.map(t.p),'#ff95001b','#ff9500');
 out+=poly(r.active.points.map(t.p),'#007aff1a','#007aff');if(isStereo())out+=poly(r.camera2.points.map(t.p),'none','#a78bbf','5 4')+poly(r.active2.points.map(t.p),'#af52de1a','#af52de');
 out+=drawRegions(r.regions.camera,t,merged.W,merged.H,r.active.metrics.center);
 if(r.overlap.length)out+=poly(r.overlap.map(t.p),'#00a68a38','#00a68a');
 for(const [d,c,label] of [[r.active,'#007aff',isStereo()?'左相机光轴':'相机光轴'],[r.projector,'#bd6c0d','光机光轴'],...(isStereo()?[[r.active2,'#af52de','右相机光轴']]:[])]){
  const hit=t.p(d.axisHit);
  out+=line([hit[0]-5,hit[1]],[hit[0]+5,hit[1]],c)+line([hit[0],hit[1]-5],[hit[0],hit[1]+5],c);
  if(hit[0]>15&&hit[0]<merged.W-15&&hit[1]>20&&hit[1]<merged.H-20)
   out+=text([hit[0],hit[1]+(d===r.active?-18:d===r.projector?18:36)],label,'annot','middle',c);
 }
 out+=drawRegionEdges(r.regions.camera,t,merged.W,merged.H);
 merged.svg.innerHTML=out;
 const W=single.W,H=single.H,st=fit([...r.active.points,...r.overlap,...(isStereo()?r.active2.points:[])],W,H,78);
 out=grid(st,W,H,'X (mm)','Y (mm)');
 out+=poly(r.active.points.map(st.p),'none','#6b9ad1','5 4');if(isStereo())out+=poly(r.active2.points.map(st.p),'none','#a78bbf','5 4');
 out+=drawRegions(r.regions.camera,st,W,H,r.active.metrics.center);
 if(r.overlap.length){
  out+=poly(r.overlap.map(st.p),'#13917d44','#00a68a');
  r.overlap.forEach((v,i)=>{
   const p=st.p(v),c=st.p(r.metrics.center),dx=c[0]-p[0],dy=c[1]-p[1],length=Math.hypot(dx,dy)||1;
   out+=mark(p,'#00a68a',2.5)+text([p[0]+14*dx/length,p[1]+14*dy/length+4],i+1,'','middle');
  });
  const c=st.p(r.metrics.center),b=r.metrics.bounds,q=FOV.overlapDimensions(r.overlap);
  out+=text([c[0],c[1]-6],(isStereo()?'双目 3D 共同视野':'3D 重合视野')+(q.trapezoid?' · 梯形':''),'annot','middle','#00a68a');
  if(q.trapezoid){
   out+=text([c[0],c[1]+13],'长度 '+fmt(q.values[2].value)+' mm','annot','middle','#00a68a');
   q.sideSegments.forEach((segment,i)=>{
    const p=st.p([(segment[0][0]+segment[1][0])/2,(segment[0][1]+segment[1][1])/2]);
    const label=q.values[i].label+' '+fmt(q.values[i].value)+' mm';
    let point,anchor;
    if(q.vertical){
     const outside=i===0?p[0]>125:W-p[0]>125;
     point=[p[0]+(i===0?(outside?-12:9):(outside?12:-9)),p[1]+(W<620?(i===0?-38:42):-18)];
     anchor=i===0?(outside?'end':'start'):(outside?'start':'end');
    }else{point=[p[0],p[1]+(i===0?-16:20)];anchor='middle';}
    out+=text(point,label,'annot',anchor,'#00a68a');
   });
  }else{
   out+=text([c[0],c[1]+13],fmt(r.metrics.width)+' × '+fmt(r.metrics.height)+' mm'+(q.kind==='矩形'?'':' · 包络'),'annot','middle','#00a68a');
   const bottom=st.p([(b.xmin+b.xmax)/2,b.ymin]);
   out+=text([bottom[0],bottom[1]+28],'X 宽 '+fmt(r.metrics.width)+' mm','annot','middle','#00a68a');
  }
 }else out+=text([W/2,H/2-24],'当前平面没有重合视野','annot');
 out+=drawRegionEdges(r.regions.camera,st,W,H);
 single.svg.innerHTML=out;
}
function depthSectionSegment(points,z){
 const segment=FOV.sliceSegment(points,0,1);
 return segment?.map(([x])=>[x,z])||null;
}
function sectionDimension(a,b,color){
 const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
 if(length<1)return '';
 const ux=(b[0]-a[0])/length,uy=(b[1]-a[1])/length,tip=Math.min(6,length/3);
 let out=line(a,b,color);
 for(const [q,sign] of [[a,1],[b,-1]]){
  const base=[q[0]+sign*tip*ux,q[1]+sign*tip*uy];
  out+=line(q,[base[0]-uy*tip*.48,base[1]+ux*tip*.48],color)+line(q,[base[0]+uy*tip*.48,base[1]-ux*tip*.48],color);
 }
 return out;
}
function sectionTilt(origin,axis,radius,color){
 const angle=Math.atan2(axis[0],-axis[2]),degrees=angle*180/Math.PI;
 const normal=[origin[0],origin[1]+radius],tip=[origin[0]+radius*Math.sin(angle),origin[1]+radius*Math.cos(angle)];
 const labelRadius=radius+11,label=[origin[0]+labelRadius*Math.sin(angle/2)+(angle<0?-5:5),origin[1]+labelRadius*Math.cos(angle/2)+4];
 const isVertical=Math.abs(degrees)<.005;
 let out=line(origin,[normal[0],normal[1]+8],'#9caab7','2 3');
 if(!isVertical)out+='<path d="M '+normal.join(' ')+' A '+radius+' '+radius+' 0 0 '+(angle<0?1:0)+' '+tip.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="1.4"/>';
 return out+text(label,(isVertical?'0':fmt(degrees,1))+'°','annot',angle<0?'end':'start',color);
}
function drawDepthSection(depthSections){
 const {svg,W,H}=initSvg('layout');
 $('view3d').classList.remove('active');$('viewSide').classList.add('active');
 $('layoutCaption').textContent='X–Z 光路截面（Y=0）。实线为截面边界，彩色虚线为光轴投影。角度相对工作平面法线；WD 沿相机光轴自镜头前端量取'+(isStereo()?'（左相机）':'')+'。绿色为共同覆盖。';
 const sections=depthSections.filter(section=>section.result);
 if(!sections.length){svg.innerHTML='';return;}
 const near=sections[0],far=sections[sections.length-1];
 const nominal=sections.find(section=>section.key==='middle');
 const selected=sections.find(section=>section.active)||nominal;
 const r=far.result,farZ=far.z,side=q=>[q[0],q[2]];
 const devices=[
  {full:r.camera,roi:r.active,name:isStereo()?'左相机':'相机光心',color:'#007aff',fill:'#007aff12'},
  {full:r.projector,roi:r.projector,name:'光机',color:'#bd6c0d',fill:'#ff950014'},
  ...(isStereo()?[{full:r.camera2,roi:r.active2,name:'右相机',color:'#af52de',fill:'#af52de12'}]:[])
 ].map(device=>({
  ...device,origin:side(device.full.pos),fullEnds:depthSectionSegment(device.full.points,farZ),
  roiEnds:depthSectionSegment(device.roi.points,farZ),axisEnd:[device.full.axisHit[0],farZ]
 }));
 const cameraFront=r.camera.pos.map((v,i)=>v+r.camera.basis.axis[i]*r.optical.originOffset);
 const left=W<380?78:88,plotWidth=Math.max(80,W-left-34);
 const framePoints=devices.flatMap(device=>[device.origin,device.axisEnd,...(device.fullEnds||[])]);
 const t=fit([...framePoints,side(cameraFront)],plotWidth,H,Math.min(W<350?26:54,plotWidth*.24,H*.22));
 const p=q=>{const qPlot=t.p(q);return [qPlot[0]+left,qPlot[1]];};
 const selectedY=p([0,selected.z])[1],farY=p([0,farZ])[1],nominalY=p([0,nominal.z])[1],dimX=W-13;
 const neutral='#92a1af',dark='#52677c',green='#008b72',overlap=depthSectionSegment(selected.result.overlap,selected.z);
 let out='<g class="section-planes">';
 for(const section of sections.filter(section=>section!==selected).concat(selected)){
  const y=p([0,section.z])[1],active=section===selected;
  out+='<g data-work-plane="'+section.key+'" data-active="'+active+'">'+line([left-8,y],[dimX-5,y],active?dark:neutral,active?'':'4 4',active?1.4:1)+'</g>';
 }
 out+='</g><g class="section-cones">';
 for(const device of devices)if(device.fullEnds)out+=poly([device.origin,...device.fullEnds].map(p),device.fill,'none');
 // Each participating cone is triangular in Y=0. Clip their intersection to the working depth interval.
 const wedges=devices.map(device=>device.roiEnds?[device.origin,...device.roiEnds]:[]);
 if(wedges.every(wedge=>wedge.length)&&near.z>farZ){
  const strip=[[t.loX,farZ],[t.hiX,farZ],[t.hiX,near.z],[t.loX,near.z]];
  const common=wedges.reduce((area,wedge)=>FOV.intersect(area,wedge),strip);
  if(common.length)out+=poly(common.map(p),'#00a68a32','none');
 }
 for(const device of devices){
  const origin=p(device.origin);
  for(const ray of device.fullEnds||[])out+=line(origin,p(ray),device.color,'',1.45);
  if(device.roi!==device.full)for(const ray of device.roiEnds||[]){
   if(!device.fullEnds?.some(full=>Math.abs(full[0]-ray[0])<1e-7))out+=line(origin,p(ray),device.color,'2 3',1);
  }
  out+=line(origin,p(device.axisEnd),device.color,'6 4',1.3);
 }
 if(overlap){
  const [a,b]=overlap.map(p),width=overlap[1][0]-overlap[0][0];
  if(width>1e-8)out+=line(a,b,green,'',3)+text([(a[0]+b[0])/2,W<350?farY+19:selectedY+(farY-selectedY<19?17:-8)],'共同宽 '+fmt(width)+' mm','annot','middle',green);
 }
 out+='</g><g class="section-installation">';
 const origins=devices.map(device=>p(device.origin)),labelY=Math.min(...origins.map(origin=>origin[1]))-11;
 const baselines=isStereo()?[[0,1,'左 B',r.baselines.left],[1,2,'右 B',r.baselines.right]]:[[0,1,'B',r.baseline]];
 for(const [i,j,name,value] of baselines){
  const a=origins[i],b=origins[j],offset=isStereo()&&i===1?36:25,da=[a[0],a[1]-offset],db=[b[0],b[1]-offset];
  const x=Math.max(62,Math.min(W-62,(da[0]+db[0])/2));
  const y=Math.max(11,Math.min(da[1],db[1])-5);
  out+=line(a,da,neutral,'2 3')+line(b,db,neutral,'2 3')+sectionDimension(da,db,dark);
  out+=text([x,y],name+' '+fmt(value)+' mm','annot','middle',dark);
 }
 devices.forEach((device,i)=>{
  const q=origins[i],anchor=isStereo()?['end','middle','start'][i]:q[0]<=origins[1-i][0]?'end':'start';
  const x=anchor==='middle'?q[0]:anchor==='end'?Math.max(49,q[0]-8):Math.min(W-49,q[0]+8);
  const angleRadius=Math.min(38+i*18,Math.max(14,(farY-q[1])*.68));
  out+=mark(q,device.color,4.3)+text([x,Math.max(22,labelY)],device.name,'annot',anchor,device.color);
  out+=sectionTilt(q,device.full.basis.axis,angleRadius,device.color);
 });
 const front=p(side(cameraFront)),frontHeight=cameraFront[2]-nominal.z;
 out+=line([front[0],front[1]],[dimX,front[1]],neutral,'3 4')+line([dimX-6,nominalY],[dimX+3,nominalY],neutral);
 out+=sectionDimension([dimX,front[1]],[dimX,nominalY],dark);
 out+='<g transform="translate('+(dimX-6)+' '+((front[1]+nominalY)/2)+') rotate(-90)">'+text([0,0],'名义垂距 '+fmt(frontHeight)+' mm','annot','middle',dark)+'</g>';
 out+='</g><g class="section-plane-labels">';
 const labelYs=sections.map(section=>p([0,section.z])[1]+4);
 for(let i=1;i<labelYs.length;i++)labelYs[i]=Math.max(labelYs[i],labelYs[i-1]+17);
 for(let i=labelYs.length-1;i>=0;i--)labelYs[i]=Math.min(labelYs[i],i===labelYs.length-1?H-8:labelYs[i+1]-17);
 sections.forEach((section,i)=>{
  const y=p([0,section.z])[1],labelY=labelYs[i],color=section===selected?dark:'#728496';
  out+=line([left-8,y],[left-13,labelY-4],color);
  const label=section===nominal?section.label:section.label+' '+fmt(section.wd)+' mm';
  out+='<g><title>'+escapeText(planeLabel(section))+'</title>'+text([7,labelY],label,section===selected?'annot':'tick','start',color)+'</g>';
 });
 svg.innerHTML=out+'</g>';
}
function drawMonoLayout(){const {svg,W,H}=initSvg('layout');$('view3d').classList.toggle('active',view==='3d');$('viewSide').classList.toggle('active',view==='side');$('layoutCaption').textContent=view==='3d'?'拖动旋转视角；细线为边界光线，虚线为光轴；两个光心之间为直线基线。':'沿 Y 方向投影到 X–Z 的侧视图，全部角点光线均投影显示；不是 Y=0 截面。';if(!result){svg.innerHTML='';return;}const r=result,z=currentPlane.z;
const proj=q=>view==='side'?[q[0],q[2]]:[q[0]*Math.cos(az)-q[1]*Math.sin(az),(q[0]*Math.sin(az)+q[1]*Math.cos(az))*Math.sin(el)+q[2]*Math.cos(el)];
const all=[r.camera.pos,r.projector.pos,...r.camera.points.map(p=>[...p,z]),...r.projector.points.map(p=>[...p,z])];const t=fit(all.map(proj),W,H,60),p=q=>t.p(proj(q));let out=view==='side'?grid(t,W,H,'X (mm)','Z (mm)'):'';
const planeBounds=FOV.metrics([...r.camera.points,...r.projector.points]).bounds;
if(view==='side'){out+=line(p([planeBounds.xmin-10,0,z]),p([planeBounds.xmax+10,0,z]),'#aabac8','',2);}else{const b=planeBounds;out+=poly([[b.xmin,b.ymin,z],[b.xmax,b.ymin,z],[b.xmax,b.ymax,z],[b.xmin,b.ymax,z]].map(p),'#f8fafc','#dfe6ee');}
for(const [d,c,fill] of [[r.projector,'#ff9500','#ff950012'],[r.camera,'#007aff','#007aff0a']]){const corners=d.points.map(v=>[...v,z]);out+=poly(corners.map(p),fill,c);for(let i=0;i<4;i++)out+=line(p(d.pos),p(corners[i]),c,'',1);out+=line(p(d.pos),p([...d.axisHit,z]),c,'5 4',1.4);}
out+=poly(r.active.points.map(v=>p([...v,z])),'#007aff10','#007aff');if(r.overlap.length)out+=poly(r.overlap.map(v=>p([...v,z])),'#00a68a50','#00a68a');out+=line(p(r.camera.pos),p(r.projector.pos),'#5b6b80','3 3',1.5);
const a=p(r.camera.pos),b=p(r.projector.pos);out+=mark(a,'#007aff',6)+mark(b,'#ff9500',6)+text([a[0]-9,a[1]-14],'相机光心','annot','end','#007aff')+text([b[0]+9,b[1]-14],'光机','annot','start','#bd6c0d')+text([(a[0]+b[0])/2,(a[1]+b[1])/2+18],`B = ${fmt(r.baseline)} mm`,'annot');
if(Math.abs(r.optical.originOffset)>1e-8){const front=r.camera.pos.map((v,i)=>v+r.camera.basis.axis[i]*r.optical.originOffset),q=p(front),leader=[q[0]-44,q[1]+23];out+=mark(q,'#6b7888',3)+line(q,leader,'#96a4b4','2 2')+text([leader[0]-3,leader[1]+4],'镜头前端','annot','end','#617083');}
if(view==='3d'){const origin=[46,H-36],k=22;for(const [q,label,c] of [[[k,0,0],'X','#7994a5'],[[0,k,0],'Y','#7994a5'],[[0,0,k],'Z','#7994a5']]){let d=proj(q),end=[origin[0]+d[0],origin[1]-d[1]];out+=line(origin,end,c)+text([end[0],end[1]-5],label);}}svg.innerHTML=out;}

function drawLayout(depthSections=workPlanes){
 $('layout').style.touchAction=view==='3d'?'none':'pan-y';
 if(view==='side')return drawDepthSection(depthSections);
 if(!isStereo())return drawMonoLayout();
 const {svg,W,H}=initSvg('layout');$('view3d').classList.toggle('active',view==='3d');$('viewSide').classList.toggle('active',view==='side');$('layoutCaption').textContent=view==='3d'?'光机居中、左右各一台相机；每台设备四条实线连接全幅四个角点，虚线为光轴。拖动旋转；点击“空间示意”恢复视角。':'X–Z侧视投影；各设备四条角点连线均保留，前后角点的投影可能重叠。';if(!result){svg.innerHTML='';return;}
 const r=result,z=currentPlane.z,devices=[{d:r.projector,color:'#ff9500',fill:'#ff950012',name:'光机',key:'projector'},{d:r.camera,color:'#007aff',fill:'#007aff0a',name:'左相机',key:'left'},{d:r.camera2,color:'#af52de',fill:'#af52de0a',name:'右相机',key:'right'}];
 const project=q=>view==='side'?[q[0],q[2]]:[q[0]*Math.cos(az)-q[1]*Math.sin(az),(q[0]*Math.sin(az)+q[1]*Math.cos(az))*Math.sin(el)+q[2]*Math.cos(el)];
 const all=devices.flatMap(({d})=>[d.pos,...d.points.map(p=>[...p,z])]),t=fit(all.map(project),W,H,64),p=q=>t.p(project(q)),b=FOV.metrics(devices.flatMap(({d})=>d.points)).bounds;
 let out=view==='side'?grid(t,W,H,'X (mm)','Z (mm)'):poly([[b.xmin,b.ymin,z],[b.xmax,b.ymin,z],[b.xmax,b.ymax,z],[b.xmin,b.ymax,z]].map(p),'#f8fafc','#dfe6ee');
 if(view==='side')out+=line(p([b.xmin-10,0,z]),p([b.xmax+10,0,z]),'#aabac8','',2);
 // Draw all translucent footprint fills first so none can wash out a boundary ray.
 out+='<g class="layout-footprints">';
 for(const {d,color,fill} of devices)out+=poly(d.points.map(q=>p([...q,z])),fill,color);
 out+=poly(r.active.points.map(q=>p([...q,z])),'#007aff10','#007aff')+poly(r.active2.points.map(q=>p([...q,z])),'#af52de10','#af52de');if(r.overlap.length)out+=poly(r.overlap.map(q=>p([...q,z])),'#00a68a50','#00a68a');out+='</g>';
 // Every full sensor/DMD corner has its own unmodified 3D-to-2D boundary ray.
 out+='<g class="layout-boundary-rays">';
 for(const {d,color,name,key} of devices){const origin=p(d.pos);d.points.forEach((q,index)=>{const corner=p([...q,z]);out+='<g class="boundary-ray" data-device="'+key+'" data-corner="'+(index+1)+'"><title>'+name+' · 全幅角点 '+(index+1)+'</title>'+line(origin,corner,color,'',1.3)+mark(corner,color,2.4)+'</g>';});}
 out+='</g><g class="layout-axes">';
 for(const {d,color} of devices)out+=line(p(d.pos),p([...d.axisHit,z]),color,'5 4',1.2);
 out+='</g><g class="layout-installation">';
 const center=p(r.projector.pos);for(const [d,label,value] of [[r.camera,'左侧',r.baselines.left],[r.camera2,'右侧',r.baselines.right]]){const q=p(d.pos);out+=line(q,center,'#5b6b80','3 3',1.5)+text([(q[0]+center[0])/2,(q[1]+center[1])/2+22],label+' '+fmt(value)+' mm','annot');}
 for(const {d,color,name} of devices){const q=p(d.pos),dx=name==='左相机'?-9:name==='右相机'?9:0;out+=mark(q,color,6)+text([q[0]+dx,q[1]-15],name,'annot',name==='左相机'?'end':name==='右相机'?'start':'middle',color);}
 out+='</g>';svg.innerHTML=out;
}
let drag=null;$('layout').addEventListener('pointerdown',e=>{if(view!=='3d')return;drag={x:e.clientX,y:e.clientY,az,el};$('layout').setPointerCapture(e.pointerId);});$('layout').addEventListener('pointermove',e=>{if(!drag)return;az=drag.az+(e.clientX-drag.x)*.008;el=Math.max(-1.15,Math.min(1.25,drag.el+(e.clientY-drag.y)*.007));drawLayout();});for(const ev of ['pointerup','pointercancel'])$('layout').addEventListener(ev,()=>drag=null);
function metricRows(){if(!result)return [];const r=result;return [['相机完整 Sensor',r.camera.metrics,null],['相机 ROI',r.active.metrics,r.cameraCoverage],['光机投影',r.projector.metrics,r.projectorCoverage],['共同视野',r.metrics,null]];}
function cameraNote(d,opt){const names={pinhole:'针孔近似',thin:'有限共轭薄透镜',magnification:'已知参考倍率'};return names[opt.model]+'；参考前端轴向距离 '+fmt(opt.frontAxisWD)+' mm；等效投影尺度 '+fmt(opt.effectiveF,4)+' mm；光心后移 '+fmt(opt.originOffset)+' mm。'+(opt.model==='magnification'?'已知倍率 '+fmt(d.mag,6)+' @ '+fmt(d.magWD)+' mm，后移量不参与计算。':'');}
function fovNote(dev,f,roi){const d={...dev,f},full=FOV.fovAngles(d),a=roi?FOV.fovAngles(d,roi):null,cropped=a&&(Math.abs(a.x-full.x)>1e-6||Math.abs(a.y-full.y)>1e-6);return '视场角 X × Y：'+(cropped?'全幅 ':'')+fmt(full.x,1)+'° × '+fmt(full.y,1)+'°'+(cropped?'；ROI '+fmt(a.x,1)+'° × '+fmt(a.y,1)+'°':'');}
function overlapPixelSpans(){const r=result;if(!r||!r.overlap.length)return [];const stereo=isStereo(),proj=FOV.projectorOptics(state.projector),out=[{name:stereo?'左相机':'2D 相机',...FOV.pixelSpan({...state.camera,f:r.optical.effectiveF},r.camera.pos,currentPlane.z,r.overlap,state.roi.nx,state.roi.ny)}];if(stereo)out.push({name:'右相机',...FOV.pixelSpan({...r.rightDevice,f:r.optical2.effectiveF},r.camera2.pos,currentPlane.z,r.overlap,state.roi2.nx,state.roi2.ny)});out.push({name:'光机',...FOV.pixelSpan(proj,r.projector.pos,currentPlane.z,r.overlap,state.projector.nx,state.projector.ny)});return out;}
function overlapPixelNote(){const o=overlapPixelSpans();return o.length?'共同视野占用像素 X × Y：'+o.map(d=>d.name+' ≈ '+fmt(d.x,0)+' × '+fmt(d.y,0)+' px').join('；'):'';}
const clearanceOrder=[[3,'左上'],[2,'右上'],[0,'左下'],[1,'右下']];
function clearanceValue(c){return (c.inside?'':'−')+(c.distance>0&&c.distance<.005?'<0.01':fmt(c.distance));}
function clearanceSummary(key){
 const c=result?.clearance[key];if(!c)return '';
 const title='正值为投影内余量；负值为角点到投影边界的超出距离，沿当前工作平面测量';
 return '<div class="clearance-block" title="'+title+'"><div class="clearance-grid">'+clearanceOrder.map(([i,label])=>{const corner=c.corners[i];return '<div class="'+(corner.inside?'':'clearance-outside')+'"><span>'+label+(corner.inside?'':' · 超出')+'</span><strong>'+clearanceValue(corner)+'</strong></div>';}).join('')+'</div><div class="clearance-min '+(c.covered?'':'clearance-outside')+'"><span>'+(c.covered?'最小余量':'最大超出')+'</span><strong>'+fmt(c.covered?c.minimum:c.maxOverflow)+'</strong></div></div>';
}
let samplingResult=null;
function pixelTextRows(){if(!samplingResult)return [];return ['物方像素间距 · '+(samplingResult.mode==='normal'?'正视矩形估算':'考虑倾斜影响')+' · mm/像素',...samplingResult.devices.flatMap(d=>d.samples.map(p=>d.name+' · '+p.label+(p.column?'（全幅第 '+p.column+' 列）':'')+'：X '+fmt(p.x,6)+' / Y '+fmt(p.y,6)))];}
function renderPixelSampling(){
 const tilted=samplingResult.mode==='tilted';
 $('pixelOutput').innerHTML=samplingResult.devices.map(d=>'<div class="pixel-card '+d.key+'"><div class="pixel-heading"><strong>'+d.name+'</strong><span>'+ (d.key==='projector'?d.nx+' × '+d.ny+' px':'ROI '+d.bounds.rw+' × '+d.bounds.rh+' px')+'</span></div>'+(tilted?'<table><thead><tr><th>取样位置</th><th>X 间距</th><th>Y 间距</th></tr></thead><tbody>'+d.samples.map(p=>'<tr><td>'+p.label+' <small>第 '+p.column+' 列</small></td><td>'+fmt(p.x,6)+'</td><td>'+fmt(p.y,6)+'</td></tr>').join('')+'</tbody></table>':'<div class="pixel-values"><span>X '+fmt(d.samples[0].x,6)+'</span><span>Y '+fmt(d.samples[0].y,6)+'</span></div>')+'</div>').join('');
 $('pixelNote').textContent=tilted?'按像素两条边缘在当前工作平面上的间距计算，取平面内实长。X 在光轴行取样；Y 在对应列中心测一行像素。光轴超出 ROI 时采用 ROI 中线。列号按完整 Sensor / 投影画幅计数。':'正视矩形估算：按各设备当前沿光轴距离、有效焦距与像素尺寸计算；忽略工作平面倾斜造成的局部倍率变化。开启“考虑倾斜影响”可查看左侧、光轴列、右侧的实际间距。光机默认 1280 × 720 px，可在左侧修改。';
}
function update(){
 normalizeInputs(state);syncMountWD();syncNominalWD();modelControls();sensorInfo();sensorInfo(2);
 let planeErrors={};
 try{
  for(const [name,d] of [['左/单目相机',state.camera],...(isStereo()?[['右相机',state.camera2]]:[])])if(!Number.isFinite(d.pixelPitch)||d.pixelPitch<=0)throw Error(name+'像元大小必须为正数');
  const nominalWD=FOV.nominalDistance(state);
  if(!Number.isFinite(nominalWD)||nominalWD<=0)throw Error('名义工作距离必须为正数');
  const {planes,errors}=FOV.solveWorkPlanes(state);
  planeErrors=errors;
  currentPlane=planes.find(plane=>plane.key===state.depthRange.selected)||planes.find(plane=>plane.key==='middle');
  workPlanes=planes;
  currentPlane.active=true;
  result=currentPlane.result;
  samplingResult=FOV.pixelSampling({...state,plane:currentPlane.z},result);
  $('error').hidden=true;
 }catch(e){
  workPlanes=[];currentPlane=null;result=null;samplingResult=null;
  $('error').hidden=false;
  $('error').textContent=e.message+'。已清空计算结果。';
 }
 syncWorkPlanes(planeErrors);
 renderCameraDepth();
 $('modelInfo').hidden=!result;
 for(const id of ['save','csv','svgExport','print'])$(id).disabled=!result;document.querySelectorAll('.plot-export').forEach(b=>b.disabled=!result);
 if(!result){for(const suffix of ['','2']){$('clearanceColumn'+suffix).style.visibility='hidden';$('cameraClearance'+suffix).innerHTML='';}for(const id of ['cameraOutput','cameraOutput2','projectorOutput','overlapOutput','printParams','pixelOutput'])$(id).innerHTML='';for(const id of ['cameraModelInfo','cameraModelInfo2','projectorInfo','modelInfo','workingInfo','baselineInfo','pixelNote'])$(id).textContent='';$('status').textContent='请修改参数后继续计算。';$('status').classList.toggle('bad',true);drawFootprint();drawLayout();return;}
 renderPixelSampling();
 const r=result,m=r.metrics,stereo=isStereo(),leftName=stereo?'左相机':'2D 相机';
 $('cameraModelInfo').textContent=cameraNote(state.camera,r.optical);$('cameraModelInfo2').textContent=stereo?cameraNote(state.camera2,r.optical2):'';
 $('projectorInfo').textContent='TR = '+fmt(r.tr,5)+'；f投影 = TR × DMD宽。左侧两项距离取参考平面；当前投影沿光轴距离 '+fmt(r.projector.axisWD)+' mm。更换 DMD 保持焦距并更新 TR。';
 $('modelInfo').textContent=stereo?'双目：左相机 + 中置光机 + 右相机；3D 视野为两台相机 ROI 与光机投影的三者交集。':'单目：一台相机 + 一台光机；3D 视野为相机 ROI 与光机投影的交集。';
 const devices=[[leftName,state.camera,state.roi],...(stereo?[['右相机',state.camera2,state.roi2]]:[])];
 $('printParams').innerHTML='<strong>当前方案 · '+(stereo?'双目':'单目')+'</strong><br>'+planeLabel(currentPlane)+'（'+leftName+'镜头前端沿光轴）。<br>'+devices.map(([n,d,roi])=>n+'：焦距 '+fmt(d.f)+' mm；Sensor '+fmt(d.w)+' × '+fmt(d.h)+' mm；参考 WD '+fmt(d.wd)+' mm；X–Z倾角 '+fmt(d.yaw)+'°；ROI '+roi.rw+' × '+roi.rh+' px。').join('<br>')+'<br>光机焦距 '+fmt(state.projector.f)+' mm；TR '+fmt(r.tr,5)+'；X–Z倾角 '+fmt(state.projector.yaw)+'°。';
 const projOptics=FOV.projectorOptics(state.projector);
 const pxNote=overlapPixelNote();
 const cameraSummary=(d,roi,note)=>frameSummary(d)+'<div class="frame-note">ROI '+roi.rw+' × '+roi.rh+' px；完整 Sensor 包络 '+fmt(d.metrics.width)+' × '+fmt(d.metrics.height)+' mm。'+note+'</div>';
 $('cameraOutput').innerHTML=cameraSummary(r.active,state.roi,fovNote(state.camera,r.optical.effectiveF,state.roi));$('cameraOutput2').innerHTML=stereo?cameraSummary(r.active2,state.roi2,fovNote(r.rightDevice,r.optical2.effectiveF,state.roi2)):'';$('projectorOutput').innerHTML=frameSummary(r.projector)+'<div class="frame-note">'+fovNote(projOptics,projOptics.f,null)+'</div>';
 for(const [suffix,key] of [['','camera'],['2','camera2']]){const column=$('clearanceColumn'+suffix);column.style.visibility='visible';column.setAttribute('aria-hidden','false');$('cameraClearance'+suffix).innerHTML=clearanceSummary(key);}
 $('overlapOutput').innerHTML=overlapSummary()+'<div class="frame-note">面积 '+fmt(m.area)+' mm²；'+(stereo?'占左 / 右 ROI '+fmt(r.cameraCoverage*100,1)+'% / '+fmt(r.camera2Coverage*100,1)+'%':'占相机 ROI '+fmt(r.cameraCoverage*100,1)+'%')+'；占光机 '+fmt(r.projectorCoverage*100,1)+'%。'+(stereo?'仅单侧相机可见的部分不计入共同 3D 视野。':'')+(pxNote?pxNote+'（顶点按当前姿态反投影到完整画幅计数）。':'')+'</div>'+missingSummary();
 if(stereo){const sm=state.stereoMount;$('baselineInfo').textContent='光机 X=0；左 / 右相机 X='+fmt(-sm.leftGap)+' / '+fmt(sm.rightGap)+' mm；双目光心距离 '+fmt(r.baseline)+' mm。';$('workingInfo').textContent=currentPlane.label+' · 左相机镜头前端 '+fmt(currentPlane.wd)+' mm；右相机镜头前端 '+fmt(r.camera2.axisWD-r.optical2.originOffset)+' mm；光机沿光轴 '+fmt(r.projector.axisWD)+' mm。';}
 else{$('baselineInfo').textContent='实际光心距离 B = '+fmt(r.baseline)+' mm；X 分量 '+fmt(r.bx)+' mm，Z 高度差 '+fmt(r.dz)+' mm。';$('workingInfo').textContent=currentPlane.label+' · 相机镜头前端 '+fmt(currentPlane.wd)+' mm；光机沿光轴 '+fmt(r.projector.axisWD)+' mm（垂直距离 '+fmt(r.projector.normalWD)+' mm）。';}
 $('printParams').innerHTML+='<br>'+escapeText($('baselineInfo').textContent)+'<br>'+escapeText($('workingInfo').textContent)+'<br>'+pixelTextRows().map(escapeText).join('<br>');
 let message=m.area?(stereo?'三者共同覆盖：左 ROI '+fmt(r.cameraCoverage*100,1)+'%，右 ROI '+fmt(r.camera2Coverage*100,1)+'%，光机 '+fmt(r.projectorCoverage*100,1)+'%。':'共同覆盖相机 ROI 的 '+fmt(r.cameraCoverage*100,1)+'%，覆盖光机投影的 '+fmt(r.projectorCoverage*100,1)+'%。'):'当前没有共同 3D 视野，请调整间距、倾角或焦距。';if(r.baseline<1e-6)message+=' 相机光心重合，没有三角测量基线。';$('status').textContent=message;$('status').classList.toggle('bad',!m.area||r.baseline<1e-6);
 syncRegionChoice();state.setups[state.scene]=setupSnapshot();try{localStorage.setItem('structured-light-fov-v10',JSON.stringify(state));}catch(e){}drawFootprint();drawLayout();
}
function csvCell(x){return '"'+String(x===null?'':x).replace(/"/g,'""')+'"';}function csvDownload(name,rows){download(name,'\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');}
$('csv').onclick=()=>{
 if(!result)return;const r=result,stereo=isStereo(),rows=[['3D 视觉视野规划 v10.0'],['系统模式',stereo?'双目':'单目'],['3D视野定义',stereo?'左 ROI ∩ 右 ROI ∩ 光机投影':'相机 ROI ∩ 光机投影'],['参数','值']];
 function flatten(o,p=''){for(const [k,v] of Object.entries(o)){if(k==='setups')continue;const key=p?p+'.'+k:k;if(v&&typeof v==='object')flatten(v,key);else rows.push([key,v]);}}flatten(state);
 const frames=[[stereo?'左相机完整 Sensor':'相机完整 Sensor',r.camera],[stereo?'左相机 ROI':'相机 ROI',r.active],...(stereo?[['右相机完整 Sensor',r.camera2],['右相机 ROI',r.active2]]:[]),['光机投影',r.projector]];
 rows.push([],['当前截面',currentPlane.label],['当前截面 Z (mm)',currentPlane.z],['当前直线距离','mm'],['左/单目相机镜头前端',currentPlane.wd],...(stereo?[['右相机镜头前端',r.camera2.axisWD-r.optical2.originOffset]]:[]),['光机沿光轴',r.projector.axisWD],['光机垂直距离',r.projector.normalWD],[],['范围','X包络 mm','Y包络 mm','面积 mm²']);
 for(const [name,d] of frames)rows.push([name,d.metrics.width,d.metrics.height,d.metrics.area]);if(stereo){const pair=FOV.metrics(r.cameraOverlap);rows.push(['左右相机共同视野（未裁光机）',pair.width,pair.height,pair.area]);}rows.push(['3D共同视野',r.metrics.width,r.metrics.height,r.metrics.area]);
 rows.push([],['范围','形状','左侧实长 mm','中光轴截长 mm','右侧实长 mm','平行侧边间垂距 mm','上斜边 mm','下斜边 mm']);for(const [name,d] of frames){const q=FOV.frameDimensions(d);rows.push([name,q.kind,q.left,q.middle,q.right,q.high,q.upper,q.lower]);}
 rows.push([],['共同视野形状',FOV.overlapDimensions(r.overlap).kind]);for(const v of FOV.overlapDimensions(r.overlap).values)rows.push([v.label,v.value]);
 rows.push([],['未覆盖分区','类别','位置','形状','面积 mm²','各边实长 mm']);for(const q of r.regions.camera)rows.push([q.id,regionTitle(q),q.location,q.kind,q.metrics.area,regionMeasureText(q)]);
 rows.push([],['分区','边标号','起点X mm','起点Y mm','终点X mm','终点Y mm','实长 mm']);for(const q of r.regions.camera)q.edges.forEach((e,k)=>rows.push([q.id,edgeLetter(k),...e.a,...e.b,e.length]));
 rows.push([],['物方像素间距',samplingResult.mode==='normal'?'正视矩形估算':'考虑倾斜影响'],['设备','位置','全幅像素列','X mm/像素','Y mm/像素']);for(const d of samplingResult.devices)for(const p of d.samples)rows.push([d.name,p.label,p.column||'',p.x,p.y]);
 rows.push([],['视场角（镜头出射角，含偏心与开窗）','X °','Y °']);{const fovRows=[[stereo?'左相机':'2D 相机',state.camera,r.optical.effectiveF,state.roi],...(stereo?[['右相机',r.rightDevice,r.optical2.effectiveF,state.roi2]]:[]),['光机投影',FOV.projectorOptics(state.projector),null,null]];for(const [name,dev,f,roi] of fovRows){const pf=f===null?FOV.projectorOptics(state.projector).f:f;rows.push([name+' 完整画幅',Number(FOV.fovAngles({...dev,f:pf}).x.toFixed(4)),Number(FOV.fovAngles({...dev,f:pf}).y.toFixed(4))]);if(roi){const a=FOV.fovAngles({...dev,f:pf},roi);rows.push([name+' ROI',Number(a.x.toFixed(4)),Number(a.y.toFixed(4))]);}}}
 rows.push([],['共同视野占用像素（顶点反投影到完整画幅）','X px','Y px']);for(const d of overlapPixelSpans())rows.push([d.name,Number(d.x.toFixed(1)),Number(d.y.toFixed(1))]);
 rows.push([],['范围','顶点','X mm','Y mm','Z mm']);for(const [name,d] of frames.concat([['3D共同视野',{points:r.overlap}]]))d.points.forEach((v,k)=>rows.push([name,k+1,...v,currentPlane.z]));rows.push([],['相机四角到投影边界最短距离','mm；正值=余量，负值=超出'],['相机','状态','左上角','右上角','左下角','右下角','最小有符号余量','最大超出']);for(const [key,name] of [['camera',stereo?'左相机':'2D相机'],...(stereo?[['camera2','右相机']]:[])]){const c=r.clearance[key];rows.push([name,c.covered?'完整覆盖':c.outsideCount<4?'部分角点溢出':'四角均在投影外',...clearanceOrder.map(([i])=>c.corners[i].signedDistance),c.minimumSigned,c.maxOverflow]);}csvDownload('视野计算结果.csv',rows);
};
const exportStyle='text{font-family:Microsoft YaHei,Arial,sans-serif;font-size:11px;fill:#52677c}.annot{font-weight:600;paint-order:stroke;stroke:white;stroke-width:4px}.tick{font-size:10px;fill:#8291a2}';
function exportText(x,y,value,size=11,color='#62768a',weight=400){return '<text x="'+x+'" y="'+y+'" style="font-size:'+size+'px;fill:'+color+';font-weight:'+weight+'">'+escapeText(value)+'</text>';}
function wrapPlotRows(rows,width,size=11){
 const ctx=document.createElement('canvas').getContext('2d');ctx.font=size+'px "Microsoft YaHei",Arial,sans-serif';const lines=[];
 for(const row of rows){let line='';const tokens=String(row).match(/\d[\d,.]*(?:\s*(?:mm²?|px|%))?|[A-Za-z]+|./gu)||[];for(const token of tokens){if(line&&ctx.measureText(line+token).width>width){lines.push(line.trimEnd());line=token.trimStart();}else line+=token;}lines.push(line.trimEnd());}return lines;
}
function exportValue(x,y,value,width,size=22){
 const ctx=document.createElement('canvas').getContext('2d');ctx.font='650 '+size+'px "Microsoft YaHei",Arial,sans-serif';
 const fitted=Math.min(size,(width-26)/Math.max(1,ctx.measureText(value).width)*size);
 return '<text x="'+x+'" y="'+y+'" style="font-size:'+fitted+'px;fill:#253a50;font-weight:650">'+escapeText(value)+'<tspan style="font-size:11px;font-weight:400"> mm</tspan></text>';
}
function exportClearancePanel(frame,x,y,width,bottom){
 const c=FOV.coverageClearance(frame.points,result.projector.points);let out=exportText(x,y+20,'投影余量  mm',12,'#71717a',600);
 const cell=(width-20)/2;clearanceOrder.forEach(([i,label],n)=>{const corner=c.corners[i],color=corner.inside?'#3a3a3c':'#b66a27',xx=x+(n%2)*(cell+20),yy=y+34+Math.floor(n/2)*38;out+=exportText(xx,yy,label+(corner.inside?'':' · 超出'),10.5,corner.inside?'#8e8e93':color)+exportText(xx,yy+15,clearanceValue(corner),16,color,600);});
 out+=exportText(x,bottom,c.covered?'最小余量':'最大超出',10.5,'#8e8e93')+exportText(x+58,bottom,fmt(c.covered?c.minimum:c.maxOverflow),10.5,c.covered?'#298368':'#b66a27',600);return '<g class="export-clearance">'+out+'</g>';
}
function exportFrameBlock(name,d,roi,full,x,y,width,color){
 const q=FOV.frameDimensions(d),pad=12,inner=width-2*pad,marginW=roi?176:0,main=roi?inner-marginW-24:inner;let out=exportText(x+pad,y+20,name,12,color,650),cursor=y+49;
 if(q.rectangle){out+=exportValue(x+pad,cursor,fmt(q.width)+' × '+fmt(q.height),main,22);cursor+=27;}
 else{const values=[['左 · 侧边实长',q.left],['中 · 光轴竖长',q.middle],['右 · 侧边实长',q.right],['高 · 侧边间距',q.high]],cell=(main-14)/2;values.forEach(([label,value],i)=>{const xx=x+pad+(i%2)*(cell+14),yy=y+44+Math.floor(i/2)*48;out+=exportText(xx,yy,label,10.5)+exportValue(xx,yy+21,fmt(value),cell,18);});cursor=y+139;}
 const notes=q.rectangle?['矩形 · X/Y 宽高；面积 '+fmt(d.metrics.area)+' mm²']:[q.kind+'；上 / 下斜边 '+fmt(q.upper)+' / '+fmt(q.lower)+' mm；面积 '+fmt(d.metrics.area)+' mm²'+(!q.sideParallel?'；左右侧边不平行。':'')];for(const row of wrapPlotRows(notes,main,10)){out+=exportText(x+pad,cursor,row,10);cursor+=18;}
 if(roi){const rows=wrapPlotRows(['ROI '+roi.rw+' × '+roi.rh+' px；完整 Sensor 包络 '+fmt(full.metrics.width)+' × '+fmt(full.metrics.height)+' mm。'],main,10),bottom=Math.max(cursor+(rows.length-1)*18,y+134);rows.forEach((row,i)=>out+=exportText(x+pad,bottom-(rows.length-1-i)*18,row,10));out+=exportClearancePanel(d,x+width-pad-marginW,y,marginW,bottom);cursor=bottom+18;}
 return {content:'<g class="export-frame-summary" data-device="'+escapeText(name)+'">'+out+'</g>',height:cursor-y+5};
}
function exportCombinedSummary(W,y){
 const r=result,stereo=isStereo(),frames=[[stereo?'左相机视野':'2D 相机视野',r.active,state.roi,r.camera,'#007aff'],...(stereo?[['右相机视野',r.active2,state.roi2,r.camera2,'#af52de']]:[]),['光机视野',r.projector,null,null,'#bd6c0d']],columns=Math.min(frames.length,Math.max(1,Math.floor(W/440))),cell=W/columns;
 let content='',cursor=y,rowHeight=0;
 frames.forEach((f,i)=>{const col=i%columns;if(i&&col===0){cursor+=rowHeight+6;rowHeight=0;}const span=cell;const q=exportFrameBlock(...f.slice(0,4),col*cell,cursor,span,f[4]);content+=q.content;rowHeight=Math.max(rowHeight,q.height);});
 return {content,height:cursor+rowHeight-y};
}
function exportOverlapSummary(W,y){
 const q=FOV.overlapDimensions(result.overlap),r=result;let out=exportText(12,y+20,isStereo()?'双目 3D 共同视野':'3D 重合视野',12,'#00a68a',650),cursor=y+50;
 if(q.trapezoid){const cell=(W-36)/3;q.values.forEach((v,i)=>{out+=exportText(12+i*cell,y+44,v.label,10.5)+exportValue(12+i*cell,y+65,fmt(v.value),cell-12,18);});cursor=y+90;}
 else{out+=exportValue(12,cursor,fmt(q.metrics.width)+' × '+fmt(q.metrics.height),W-24);cursor+=26;}
 const notes=[q.kind+(q.kind!=='矩形'&&q.kind!=='梯形'?' · X/Y 外包络':'')+'；面积 '+fmt(r.metrics.area)+' mm²'];
 const region=r.regions.camera.find(a=>a.id===selectedRegionId);if(region)notes.push(region.id+' · '+region.kind+'：'+regionMeasureText(region)+' mm');
 for(const row of wrapPlotRows(notes,W-24,10.5)){out+=exportText(12,cursor,row,10.5);cursor+=19;}
 return {content:'<g class="export-overlap-summary">'+out+'</g>',height:cursor-y+4};
}
function buildPlotExport(id){
 const svg=$(id),W=svg.clientWidth,H=svg.clientHeight;
 const inset=id==='layout'?0:22;
 let content=(inset?exportText(12,15,planeLabel(currentPlane)):'')+'<g class="export-plot" data-plot="'+id+'" transform="translate(0,'+inset+')">'+svg.innerHTML+'</g>';
 let height=H+inset;
 if(id==='combinedFootprint'){const summary=exportCombinedSummary(W,height+4);content+=summary.content;height+=4+summary.height;}
 else if(id==='footprint'){const summary=exportOverlapSummary(W,height+4);content+=summary.content;height+=4+summary.height;}
 return {W,H:Math.ceil(height+8),content};
}
function exportDocument(W,H,content){return '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'"><style>'+exportStyle+'</style><rect width="100%" height="100%" fill="white"/>'+content+'</svg>';}
function encodeBMP(pixels,width,height){
 const stride=Math.ceil(width*3/4)*4,size=stride*height,bytes=new Uint8Array(54+size),v=new DataView(bytes.buffer);
 v.setUint16(0,0x4d42,true);v.setUint32(2,bytes.length,true);v.setUint32(10,54,true);v.setUint32(14,40,true);v.setInt32(18,width,true);v.setInt32(22,height,true);v.setUint16(26,1,true);v.setUint16(28,24,true);v.setUint32(34,size,true);v.setInt32(38,7559,true);v.setInt32(42,7559,true);
 for(let y=0;y<height;y++){let target=54+(height-1-y)*stride,source=y*width*4;for(let x=0;x<width;x++,source+=4){bytes[target++]=pixels[source+2];bytes[target++]=pixels[source+1];bytes[target++]=pixels[source];}}
 return bytes;
}
async function downloadPlotImage(name,W,H,content){
 const source=exportDocument(W,H,content);if($('imageFormat').value==='svg'){download(name+'.svg',source,'image/svg+xml');return;}
 let url;try{
  if(document.fonts)await document.fonts.ready;
  url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml;charset=utf-8'}));const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('图形载入失败'));image.src=url;});
  const canvas=document.createElement('canvas'),scale=2;canvas.width=Math.ceil(W*scale);canvas.height=Math.ceil(H*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const bmp=encodeBMP(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);canvas.width=canvas.height=1;download(name+'.bmp',bmp,'image/bmp');
 }catch(e){toast('图片导出失败：'+e.message);}finally{if(url)URL.revokeObjectURL(url);}
}
function exportPlot(id,title){if(!result)return;const q=buildPlotExport(id);return downloadPlotImage(title+'-示意图',q.W,q.H,q.content);}
$('regionChoice').addEventListener('change',e=>selectRegion(e.target.value));
$('overlapOutput').addEventListener('click',e=>{
 const button=e.target.closest('[data-select-region]');if(button)selectRegion(button.dataset.selectRegion);
});document.querySelectorAll('.plot-export').forEach(b=>b.onclick=()=>exportPlot(b.dataset.exportPlot,b.dataset.title));
$('svgExport').onclick=()=>{
 if(!result)return;const items=[['layout','光学系统布局'],['combinedFootprint','2D 相机与光机视野'],['footprint','3D 重合视野']],plots=items.map(([id,title])=>({...buildPlotExport(id),title})),W=Math.max(...plots.map(p=>p.W))+24;
 let content='',y=10;for(const q of plots){const x=(W-q.W)/2;content+=exportText(x+12,y+20,q.title,13,'#253a50',650)+'<g transform="translate('+x+','+(y+32)+')">'+q.content+'</g>';y+=q.H+58;}
 return downloadPlotImage('光学系统与视野缺边尺寸',W,y,content);
};
window.addEventListener('resize',()=>{drawFootprint();drawLayout();});defaultLayoutView();sync();update();
let layoutObservedSize='';
new ResizeObserver(entries=>{
 const b=entries[0].contentRect,key=b.width.toFixed(1)+','+b.height.toFixed(1);
 if(b.width>0&&b.height>0&&key!==layoutObservedSize){layoutObservedSize=key;drawLayout();}
}).observe($('layout'));