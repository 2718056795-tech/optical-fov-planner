/* X=0 is the laser sheet. Y follows the line, Z is height. Sensor axes can be swapped. */
(function(root){
'use strict';
const F=typeof module!=='undefined'&&module.exports?require('./geometry.js'):root.FOV;
const copy=x=>JSON.parse(JSON.stringify(x)),rad=x=>x*Math.PI/180;
function originOffset(s){return s.camera.model==='magnification'?0:s.camera.originOffset;}
const defaults={version:10,product:'lineLaser',heightAxis:'short',theta:30,baseline:200,camera:{f:16,model:'pinhole',mag:.04,magWD:400,wd:400,originOffset:0,pixelPitch:4.8,w:12.288,h:6.48},roi:{nx:2560,ny:1350,rw:2560,rh:1350}};
function num(v,name,min,max){if(!Number.isFinite(v)||v<min||v>max)throw Error(name+'超出有效范围');}
function baseline(s){return (s.camera.wd+originOffset(s))*Math.sin(rad(s.theta));}
function distanceFromBaseline(s,b){num(b,'X 光心基线',.000001,1e7);num(s.theta,'相机倾角',.000001,90);return b/Math.sin(rad(s.theta))-originOffset(s);}
function solve(s){
 if(s.product!=='lineLaser')throw Error('此方案不属于线激光产品');const c=s.camera,r=s.roi;
 for(const k of ['f','wd','w','h','pixelPitch'])if(k!=='f'||c.model!=='magnification')num(c[k],'镜头 / Sensor '+k,.000001,1e7);if(c.model!=='magnification')num(c.originOffset,'光心后移量',-1e5,1e5);num(s.theta,'相机倾角',.000001,90);
 for(const k of ['nx','ny','rw','rh']){num(r[k],'ROI '+k,1,1e7);if(!Number.isInteger(r[k]))throw Error('像素数必须为整数');}if(r.rw>r.nx||r.rh>r.ny)throw Error('ROI 开窗超出 Sensor 像素范围');
 const mode=s.heightAxis||'short';if(!['short','long'].includes(mode))throw Error('请选择测高使用 Sensor 短边或长边');const shortAxis=c.w<c.h?'X':'Y',heightSensorAxis=mode==='short'?shortAxis:shortAxis==='X'?'Y':'X',lineSensorAxis=heightSensorAxis==='X'?'Y':'X';
 const verticalIsX=heightSensorAxis==='X',sensorHeight=verticalIsX?c.w:c.h,sensorWidth=verticalIsX?c.h:c.w,nHeight=verticalIsX?r.nx:r.ny,nLine=verticalIsX?r.ny:r.nx,roiHeight=verticalIsX?r.rw:r.rh,roiLine=verticalIsX?r.rh:r.rw;
 const optical=F.cameraOptics({...c,model:c.model||'pinhole',yaw:s.theta,pitch:0,roll:0},'axis'),f=optical.effectiveF,U=optical.axisWD;if(U<=0)throw Error('光心至激光光平面的轴向距离必须为正数');const theta=rad(s.theta),sn=Math.sin(theta),cs=Math.cos(theta),B=U*sn,H=U*cs,startLine=Math.floor((nLine-roiLine)/2),startHeight=Math.floor((nHeight-roiHeight)/2);
 const x0=sensorWidth*(startLine/nLine-.5),x1=sensorWidth*((startLine+roiLine)/nLine-.5),top=sensorHeight*(.5-startHeight/nHeight),bottom=sensorHeight*(.5-(startHeight+roiHeight)/nHeight);
 function trace(x,y){const ray=[-sn-cs*y/f,x/f,-cs+sn*y/f];if(ray[0]>=-1e-8)throw Error('倾角过小，视场边缘无法与激光光平面形成有限视野；请增大倾角或减小 Sensor 测高尺寸');const t=-B/ray[0],Y=t*ray[1],Z=H+t*ray[2];if(t<=0||!Number.isFinite(Y)||!Number.isFinite(Z))throw Error('视野光线无法到达前方激光光平面');return [Y,Z];}
 const points=[trace(x0,bottom),trace(x1,bottom),trace(x1,top),trace(x0,top)],zTop=points[2][1],zBottom=points[0][1],upper=zTop,lower=-zBottom;if(upper< -1e-7||lower< -1e-7)throw Error('光轴交点不在当前 ROI 测高范围内');
 // Axis sampling is centred on the optical axis, independent of the pixel grid parity.
 const heightPixel=sensorHeight/nHeight,centre=nHeight/2;
 const intervals=[{label:'上底端',start:startHeight,end:startHeight+1,row:startHeight+1,axisCentered:false},{label:'光轴处',start:centre-.5,end:centre+.5,row:null,axisCentered:true},{label:'下底端',start:startHeight+roiHeight-1,end:startHeight+roiHeight,row:startHeight+roiHeight,axisCentered:false}];
 const samples=intervals.map(q=>{const upperSensor=q.axisCentered?heightPixel/2:sensorHeight*(.5-q.start/nHeight),lowerSensor=q.axisCentered?-heightPixel/2:sensorHeight*(.5-q.end/nHeight),upperEdge=trace(0,upperSensor),lowerEdge=trace(0,lowerSensor);return{label:q.label,row:q.row,axisCentered:q.axisCentered,pixelBounds:[q.start,q.end],sensorEdges:[upperSensor,lowerSensor],withinROI:q.start>=startHeight-1e-9&&q.end<=startHeight+roiHeight+1e-9,heightPitch:Math.abs(lowerEdge[1]-upperEdge[1]),heightEdges:[upperEdge,lowerEdge]};});
 const axisLeft=trace(x0,0),axisRight=trace(x1,0),axisWidth=axisRight[0]-axisLeft[0],upperBase=points[2][0]-points[3][0],lowerBase=points[1][0]-points[0][0],height=zTop-zBottom,front=[c.wd*sn,0,c.wd*cs];
 return {optical,axisWidth,axisLeft,axisRight,points,worldPoints:points.map(p=>[0,p[0],p[1]]),camera:[B,0,H],front,laserFront:[0,0,front[2]],laserReachesTop:zTop<=front[2]+1e-7,axis:[-sn,0,-cs],axisHit:[0,0,0],baseline:B,frontBaseline:front[0],axisDistance:U,frontDistance:c.wd,normalHeight:H,theta:s.theta,upperBase,lowerBase,height,upperHeight:Math.max(0,upper),lowerHeight:Math.max(0,lower),zTop,zBottom,roi:{...r,rx:Math.floor((r.nx-r.rw)/2),ry:Math.floor((r.ny-r.rh)/2)},rectangle:Math.abs(upperBase-lowerBase)<1e-7*Math.max(1,upperBase,lowerBase),sensor:{heightSensorAxis,lineSensorAxis,sensorHeight,sensorWidth,nHeight,nLine,roiHeight,roiLine,startHeight,startLine,heightMode:mode},sampling:{unit:'mm/pixel',samples}};
}
function load(raw){if(!raw||raw.product!=='lineLaser'||raw.version!==10)throw Error('请选择 V10 线激光方案；面阵结构光方案请在对应入口载入');const s=copy(defaults);for(const k of ['theta','heightAxis'])if(k in raw)s[k]=raw[k];for(const [key,template] of [['camera',s.camera],['roi',s.roi]]){if(!raw[key]||typeof raw[key]!=='object')throw Error('线激光方案参数不完整');for(const k of Object.keys(template))if(k in raw[key])template[k]=raw[key][k];}const q=solve(s);s.baseline=q.baseline;return s;}
const api={originOffset,defaults,solve,load,baseline,distanceFromBaseline};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.LaserFOV=api;
})(typeof globalThis!=='undefined'?globalThis:this);