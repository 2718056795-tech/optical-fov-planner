/* V10 回归自测：面阵结构光 + 线激光。运行：node test-geometry.cjs */
'use strict';
const FOV=require('./geometry.js'),G=require('./laser-geometry.js');
let passed=0,failed=0;
function ok(cond,name){if(cond){passed++;console.log('  ✓ '+name);}else{failed++;console.error('  ✗ '+name);}}
function near(a,b,tol,name){ok(Number.isFinite(a)&&Math.abs(a-b)<=tol,name+'（'+a+' ≈ '+b+'）');}
function throws(fn,name){try{fn();failed++;console.error('  ✗ 应报错但未报错：'+name);}catch(e){passed++;console.log('  ✓ '+name);}}
const clone=x=>JSON.parse(JSON.stringify(x));

console.log('== 面阵结构光 ==');
{
 const s=clone(FOV.defaults),r=FOV.solve(s);
 near(r.metrics.area,1536,1e-6,'单目默认重合面积 51.2×30');
 near(r.cameraCoverage,1,1e-12,'单目默认 ROI 全覆盖');
 const eff={...s.camera,f:r.optical.effectiveF};
 // 视场角独立公式（含偏心），与 fovAngles / footprint.angles 双口径一致
 const dev={...eff,ox:1,oy:-.5};
 const deg=x=>x*180/Math.PI,ex=deg(Math.atan((dev.w/2+dev.ox)/dev.f)+Math.atan((dev.w/2-dev.ox)/dev.f));
 const fa=FOV.fovAngles(dev);
 near(fa.x,ex,1e-9,'fovAngles 含偏心独立公式');
 const fr=FOV.footprint(dev,[0,0,115],0);
 near(fr.angles[0],fa.x,1e-12,'footprint.angles 与 fovAngles 已统一');
 const roi={...s.roi,rw:1024,rh:600,rx:512,ry:300};
 const ar=FOV.fovAngles(eff,roi);
 ok(ar.x<fa.x&&ar.y<fa.y,'ROI 视场角小于全幅');
 const ps=FOV.pixelSpan(eff,r.camera.pos,s.plane,r.overlap,s.roi.nx,s.roi.ny);
 near(ps.x,2048,1e-6,'共同视野占用像素 X=全幅');
 near(ps.y,1200,1e-6,'共同视野占用像素 Y=全幅');
 const st=clone(FOV.defaults);st.scene='stereo';Object.assign(st,clone(st.setups.stereo));
 const rs=FOV.solve(st);
 ok(rs.overlap.length>=3&&rs.metrics.area>0,'双目默认存在共同视野');
 const pl=FOV.pixelSpan({...st.camera,f:rs.optical.effectiveF},rs.camera.pos,st.plane,rs.overlap,st.roi.nx,st.roi.ny);
 const pr=FOV.pixelSpan({...rs.rightDevice,f:rs.optical2.effectiveF},rs.camera2.pos,st.plane,rs.overlap,st.roi2.nx,st.roi2.ny);
 near(pl.x,pr.x,1e-6,'双目对称方案左右占用像素一致');
 near(pl.y,pr.y,1e-6,'双目对称方案左右占用像素 Y 一致');
 ok(FOV.pixelSpan(eff,r.camera.pos,s.plane,[],2048,1200).x===0,'空重合返回 0');
}

console.log('== 线激光 ==');
{
 // 独立参考：相机光心 (B,0,H)，光线与 X=0 激光平面求交
 const ref=(B,H,sn,cs,f,x,y)=>{const r0=-sn-cs*y/f,t=-B/r0;return [t*x/f,H+t*(-cs+sn*y/f)];};
 const s=clone(G.defaults),r=G.solve(s),rad=x=>x*Math.PI/180;
 const sn=Math.sin(rad(s.theta)),cs=Math.cos(rad(s.theta)),U=s.camera.wd,B=U*sn,H=U*cs,f=s.camera.f;
 near(r.baseline,B,1e-9,'基线 B=(WD+后移)·sinθ');
 near(r.normalHeight,H,1e-9,'光心垂直高度 H');
 near(r.front[2],s.camera.wd*cs,1e-9,'镜头前端高度=WD·cosθ');
 const axis=ref(B,H,sn,cs,f,0,0);
 near(axis[0],0,1e-9,'光轴交点 Y=0');
 near(axis[1],0,1e-9,'光轴交点 Z=0（零高）');
 const top=s.camera.h/2,bot=-s.camera.h/2,x0=-s.camera.w/2,x1=s.camera.w/2;
 near(r.zTop,ref(B,H,sn,cs,f,x1,top)[1],1e-7,'上底 Z 独立光线求交');
 near(r.zBottom,ref(B,H,sn,cs,f,x0,bot)[1],1e-7,'下底 Z 独立光线求交');
 near(r.upperBase,ref(B,H,sn,cs,f,x1,top)[0]-ref(B,H,sn,cs,f,x0,top)[0],1e-7,'上底实长');
 near(r.lowerBase,ref(B,H,sn,cs,f,x1,bot)[0]-ref(B,H,sn,cs,f,x0,bot)[0],1e-7,'下底实长');
 near(r.height,r.zTop-r.zBottom,1e-12,'总高=上高下高之和');
 near(r.axisWidth,ref(B,H,sn,cs,f,x1,0)[0]-ref(B,H,sn,cs,f,x0,0)[0],1e-7,'光轴处横向视野');
 const p=s.camera.h/s.roi.ny,mid=r.sampling.samples[1];
 near(mid.sensorEdges[0],p/2,1e-12,'光轴取样上点=+p/2');
 near(mid.sensorEdges[1],-p/2,1e-12,'光轴取样下点=-p/2');
 near(mid.heightPitch,Math.abs(ref(B,H,sn,cs,f,0,p/2)[1]-ref(B,H,sn,cs,f,0,-p/2)[1]),1e-7,'光轴处测高间距独立对照');
 near(G.distanceFromBaseline(s,G.baseline(s)),s.camera.wd,1e-9,'基线→WD 往返一致');
 const mg=clone(s);mg.camera.model='magnification';mg.camera.mag=.04;mg.camera.magWD=400;mg.camera.originOffset=25;
 const rm=G.solve(mg);
 near(rm.optical.effectiveF,16,1e-12,'已知倍率等效焦距=倍率×参考WD');
 near(rm.upperBase,r.upperBase,1e-9,'倍率模型与针孔同有效焦距结果一致');
 near(rm.height,r.height,1e-9,'倍率模型总高一致（忽略后移量）');
 const th=clone(s);th.camera.model='thin';
 const rt=G.solve(th);
 near(rt.optical.effectiveF,16/384*400,1e-9,'薄透镜有效焦距=f·u/(u-f)');
 const lg=clone(s);lg.heightAxis='long';
 const rl=G.solve(lg);
 ok(rl.sensor.heightSensorAxis==='X'&&rl.sensor.lineSensorAxis==='Y','长边测高切换 Sensor 轴');
 ok(rl.sensor.nHeight===s.roi.nx,'长边测高使用 nx');
 const crop=clone(s);crop.roi.rh=100;
 const rc=G.solve(crop);
 ok(rc.roi.ry===Math.floor((s.roi.ny-100)/2),'ROI 测高方向自动居中');
 ok(rc.sampling.samples[1].withinROI,'光轴取样在 ROI 内');
 throws(()=>{const q=clone(s);q.roi.rw=q.roi.nx+1;G.solve(q);},'ROI 超出 Sensor 报错');
 throws(()=>{const q=clone(s);q.roi.nx=2560.5;G.solve(q);},'非整数像素数报错');
 throws(()=>{const q=clone(s);q.theta=1;G.solve(q);},'倾角过小无有限视野报错');
 ok(G.solve(s).laserReachesTop===true,'默认前端同高可覆盖上缘');
 const wide=clone(s);wide.theta=80;
 ok(G.solve(wide).laserReachesTop===false,'大倾角视野上缘超出前端高度时提示');
 throws(()=>G.load({version:10,product:'structuredLight'}),'拒绝面阵方案载入线激光');
 throws(()=>G.load({version:9,product:'lineLaser'}),'拒绝旧版本线激光方案');
 const saved=G.solve(s)&&G.load(JSON.parse(JSON.stringify(s)));
 near(saved.baseline,r.baseline,1e-9,'方案保存/载入基线一致');
}

console.log('\n结果：'+passed+' 通过，'+failed+' 失败');
process.exit(failed?1:0);
