'use strict';
(function(){
const main=document.getElementById('structuredMain'),content=main.querySelector('.content'),plots=content.querySelector('.plots'),combined=plots.querySelector('.combined-panel'),overlap=plots.querySelector('.overlap-panel');
// The optical overview is the first result, before the detailed numerical reports.
plots.before(document.createComment('overview-first'));
overlap.remove();
document.getElementById('modelInfo').after(plots);
const measures=document.createElement('section');measures.id='overviewMeasures';measures.className='panel overview-measures';
const measureHead=document.createElement('div');measureHead.className='phead';measureHead.innerHTML='<h2>视野尺寸与投影余量</h2>';measureHead.append(content.querySelector('.legend'));const summaries=combined.querySelector('.combined-summaries');summaries.setAttribute('aria-live','polite');measures.append(measureHead,summaries);plots.after(overlap,measures);
// Keep the complete dimension and clearance block when the field view is expanded.
let measureSlot=null;combined.querySelector('.plot-zoom').addEventListener('click',()=>{if(combined.closest('#plotDialog')){measureSlot=document.createComment('overview-measure-position');measures.before(measureSlot);combined.append(measures);}});
document.getElementById('plotDialog').addEventListener('close',()=>{if(measureSlot){measureSlot.replaceWith(measures);measureSlot=null;}});
// Explanatory notes remain available from one compact help button per panel.
let noteIndex=0;for(const panel of main.querySelectorAll('.parameter-grid>.panel')){
 const details=[...panel.querySelectorAll('details.param-help')];if(!details.length)continue;
 const notes=document.createElement('div');notes.className='parameter-notes';notes.id='parameterNotes'+(++noteIndex);notes.hidden=true;
 for(const detail of details){const section=document.createElement('section'),heading=document.createElement('h4');heading.textContent=detail.querySelector('summary').textContent;section.append(heading);for(const child of [...detail.childNodes])if(child.nodeName!=='SUMMARY')section.append(child);notes.append(section);detail.remove();}
 const info=panel.querySelector('[id="sensorInfo"],[id="sensorInfo2"]');if(info)notes.firstElementChild.append(info);
 const hint=panel.querySelector('[id^="originOffsetField"]>.small');if(hint){const p=document.createElement('p');p.textContent='光心后移：'+hint.textContent;notes.append(p);hint.remove();}
 panel.querySelector('.body').append(notes);
 const button=document.createElement('button');button.type='button';button.className='parameter-help-trigger';button.textContent='?';button.title='查看参数与联动说明';button.setAttribute('aria-label','查看'+panel.querySelector('h2').textContent+'说明');button.setAttribute('aria-controls',notes.id);button.setAttribute('aria-expanded','false');button.onclick=()=>{notes.hidden=!notes.hidden;button.setAttribute('aria-expanded',String(!notes.hidden));};panel.querySelector('.phead').append(button);
}
for(const panel of plots.children){
 const head=panel.querySelector('.phead'),tools=document.createElement('div');tools.className='overview-plot-tools';for(const child of [...head.children])if(!child.matches('h2,.overview-plot-title'))tools.append(child);head.append(tools);
 const caption=panel.querySelector(':scope>.caption');if(caption){const help=document.createElement('details');help.className='diagram-help';const summary=document.createElement('summary');summary.textContent='图示说明';help.append(summary,caption);panel.append(help);}
}
// Readable display values do not round the underlying parameter or export data.
function inputValue(e){if(e.id==='otherWD')return FOV.nominalDistance(state);return get(state,e.dataset.path);}
main.addEventListener('focusin',e=>{const n=e.target;if(!n.matches('input[type="number"]')||n.readOnly||n.dataset.path?.includes('.dof.')||(!n.dataset.path&&n.id!=='otherWD'))return;const v=inputValue(n);if(Number.isFinite(v))n.value=String(v);});
main.addEventListener('focusout',e=>{const n=e.target;if(!n.matches('input[type="number"]')||n.readOnly||n.dataset.path?.includes('.dof.')||(!n.dataset.path&&n.id!=='otherWD'))return;n.value=displayNumber(inputValue(n),n.dataset.path||'');});
// Match the full illustration cards across product lines; keep measurements below them.
const laserMain=document.getElementById('lineMain'),laserPlots=laserMain.querySelector('.laser-plots'),laserMeasures=document.createElement('section');laserMeasures.id='lineOverviewMeasures';laserMeasures.className='panel line-overview-measures';laserMeasures.innerHTML='<div class="phead"><h2>安装与梯形视野尺寸</h2><span class="small">mm · °</span></div><div class="line-measure-columns"></div>';
let laserMeasureSlot=null,laserMeasureGroup=null;
for(const [id,title,caption] of [['lineLayoutInfo','安装关系','X–Z 侧视：实线为视锥边界，虚线为光轴；红线为激光光平面。'],['lineDimensions','梯形视野','尺寸按激光光平面内实长计，上高、下高从光轴交点分别量到上底、下底。']]){
 const info=document.getElementById(id),panel=info.closest('.laser-panel'),group=document.createElement('section'),h=document.createElement('h3');group.className='line-measure-group';h.textContent=title;group.append(h,info);laserMeasures.querySelector('.line-measure-columns').append(group);
 const help=document.createElement('details');help.className='diagram-help';help.innerHTML='<summary>图示说明</summary><p class="caption"></p>';help.querySelector('p').textContent=caption;panel.append(help);
 panel.querySelector('[data-line-zoom]').addEventListener('click',()=>{if(panel.closest('#lineDialog')){laserMeasureSlot=document.createComment('line-measure-position');group.before(laserMeasureSlot);laserMeasureGroup=group;panel.append(group);}});
}
laserPlots.after(laserMeasures);document.getElementById('lineDialog').addEventListener('close',()=>{if(laserMeasureSlot){laserMeasureSlot.replaceWith(laserMeasureGroup);laserMeasureSlot=laserMeasureGroup=null;}});
for(const status of [document.getElementById('modelInfo'),document.getElementById('lineStatus')]){const title=()=>status.title=status.textContent;title();new MutationObserver(title).observe(status,{childList:true,subtree:true,characterData:true});}

// Reuse the existing controls so their shortcuts, file handlers and export settings stay bound.
const header=document.querySelector('header'),headerRight=header.children[1],structuredActions=headerRight.querySelector(':scope>.actions'),lineActions=header.querySelector('.line-actions'),toolbarSlot=document.createElement('div');
header.classList.add('fov-toolbar');
header.insertBefore(header.querySelector('.product-selector'),headerRight);
structuredActions.classList.add('structured-actions');
toolbarSlot.className='header-toolbar-slot';
headerRight.insertBefore(toolbarSlot,structuredActions);
toolbarSlot.append(structuredActions,lineActions);

function arrangeActions(actions, {load,save,format,exportImage,more}){
 const loadLabel=document.getElementById(load).closest('label');
 const saveButton=document.getElementById(save);
 saveButton.before(loadLabel);
 loadLabel.tabIndex=0;
 loadLabel.setAttribute('role','button');
 loadLabel.addEventListener('keydown',event=>{
  if(event.key==='Enter'||event.key===' '){event.preventDefault();document.getElementById(load).click();}
 });
 const exportButton=document.getElementById(exportImage);
 const exportGroup=document.createElement('div');
 exportGroup.className='toolbar-export-group';
 exportButton.before(exportGroup);
 exportGroup.append(exportButton,document.getElementById(format));

 const menu=document.createElement('details');
 menu.className='toolbar-more';
 const trigger=document.createElement('summary');
 trigger.textContent='⋯';
 trigger.setAttribute('aria-label','更多操作');
 trigger.title='更多操作';
 const items=document.createElement('div');
 items.className='toolbar-more-items';
 for(const id of more)items.append(document.getElementById(id));
 menu.append(trigger,items);
 actions.append(menu);
 items.addEventListener('click',event=>{
  if(!event.target.closest('button'))return;
  menu.open=false;
  trigger.focus();
 });
 return menu;
}
const moreMenus=[
 arrangeActions(structuredActions,{load:'load',save:'save',format:'imageFormat',exportImage:'svgExport',more:['reset','csv','print']}),
 arrangeActions(lineActions,{load:'lineLoad',save:'lineSave',format:'lineFormat',exportImage:'lineExportAll',more:['lineReset','lineCSV']})
];
document.addEventListener('click',event=>{
 for(const menu of moreMenus)if(!menu.contains(event.target))menu.open=false;
});
document.addEventListener('keydown',event=>{
 if(event.key!=='Escape')return;
 const menu=moreMenus.find(item=>item.open);
 if(menu){menu.open=false;menu.querySelector('summary').focus();}
});
const toolbarNotice=document.getElementById('toast');
const updateNoticeTitle=()=>toolbarNotice.title=toolbarNotice.textContent;
updateNoticeTitle();
new MutationObserver(updateNoticeTitle).observe(toolbarNotice,{childList:true,characterData:true,subtree:true});
const style=document.createElement('style');style.id='overview-first-style';style.textContent=`
#structuredMain .content{gap:10px}
#structuredMain .content>#modelInfo{background:transparent;border:0;padding:0 3px;border-radius:0;color:#8e8e93;line-height:18px;font-size:11px}
#structuredMain .plots{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:stretch}
#structuredMain .plots>.panel>.phead{min-height:48px;padding:9px 12px;gap:6px;flex-wrap:wrap}#structuredMain .plots h2{font-size:13px;white-space:nowrap}
.overview-plot-tools{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex-wrap:wrap}.overview-plot-tools .tabs{padding:2px;gap:1px}.overview-plot-tools .tabs button{padding:4px 6px}.overview-plot-tools>.plot-zoom,.overview-plot-tools>.plot-export{padding:5px 7px;font-size:10px}
#structuredMain .plots .plot,#structuredMain .plots .layout-panel>#layout{height:var(--overview-plot-height);min-height:0;flex:none}
.diagram-help{margin:0;flex:none;border-top:1px solid #f3f3f6;border-radius:0}.diagram-help>summary{padding:5px 12px;font-size:10px;line-height:15px}.diagram-help>.caption{margin:0;padding:0 12px 10px;font-size:10px}.plots .layout-panel,.plots .combined-panel{justify-content:flex-start}.plots .diagram-help{margin-top:auto}
.overview-measures>.phead{padding:10px 14px;flex-wrap:wrap;gap:8px}.overview-measures h2{font-size:13px}.overview-measures .legend{font-size:10px;padding:0;gap:10px}.overview-measures>.combined-summaries,.stereo-mode .overview-measures>.combined-summaries{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:6px}.overview-measures>.combined-summaries>div:last-child{grid-column:auto}
#structuredMain .pixel-panel .phead{padding:10px 14px}
#structuredMain .parameter-grid .body{padding:9px 12px 11px}#structuredMain .parameter-grid .phead{gap:7px}#structuredMain .parameter-grid .phead h2{flex:1}
#structuredMain .parameter-grid .fields{row-gap:8px}.parameter-help-trigger{flex:none;width:20px;height:20px;padding:0;border:1px solid #e6e6ec;border-radius:50%;background:#f7f7fa;color:#8e8e93;font-size:11px;line-height:18px}.parameter-help-trigger[aria-expanded="true"]{color:#007aff;border-color:#b9d6ff;background:#f1f7ff}
.parameter-notes{margin-top:10px;border-top:1px solid #efeff4;padding-top:4px;font-size:11px;color:#8e8e93;line-height:1.7}.parameter-notes[hidden]{display:none!important}.parameter-notes h4{font-size:11px;font-weight:600;color:#6e6e78;margin:7px 0 3px}.parameter-notes p,.parameter-notes .small{font-size:11px;line-height:1.7;margin:4px 0}.parameter-notes .caption{padding:0}.parameter-notes>section+section{margin-top:8px}
.expanded-plot>.overview-measures{border:0;border-radius:0;box-shadow:none}.expanded-plot>.overview-measures>.combined-summaries{grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}
@media(min-width:761px) and (max-width:1100px){#structuredMain .plots>.panel>.phead{height:73px;min-height:73px;align-items:stretch;justify-content:center;flex-direction:column}#structuredMain .plots>.panel>.phead h2{flex:none}.overview-plot-tools{flex-wrap:nowrap}.overview-plot-tools .tabs{flex:none}}
@media(max-width:760px){#structuredMain .plots{grid-template-columns:1fr}#structuredMain .plots>.panel>.phead{min-height:48px}#structuredMain .overview-measures .camera-summary-row{grid-template-columns:minmax(0,1fr) 140px;gap:14px}#structuredMain .overview-measures .clearance-grid{gap:8px 10px}}
@media print{#structuredMain .plots .plot,#structuredMain .plots .layout-panel>#layout{height:300px}.diagram-help{display:none}.overview-measures{break-inside:avoid}.parameter-help-trigger{display:none}}
/* One overview canvas and card height, shared by both product lines. */
#structuredMain,#lineMain{--overview-plot-height:clamp(260px,44dvh,470px)}
#lineMain .content{gap:10px}#lineMain .laser-plots{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:stretch}
#structuredMain .content>#modelInfo,#lineMain .content>#lineStatus:not(.bad){height:18px;min-height:18px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:transparent;border:0;padding:0 3px;font-size:11px;color:#8e8e93;border-radius:0}
#lineMain .laser-panel{display:flex;flex-direction:column;min-width:0}#lineMain .laser-panel>.phead{height:48px;min-height:48px;padding:9px 12px;gap:6px;flex:none;flex-wrap:wrap}#lineMain .laser-panel h2{font-size:13px;white-space:nowrap;flex:1}
#lineMain .line-plot{height:var(--overview-plot-height);min-height:0;flex:none}#lineMain .laser-panel>.diagram-help{margin-top:auto}.line-plot-actions{gap:4px}.line-plot-actions button{padding:5px 7px;font-size:10px}
.line-overview-measures>.phead{padding:10px 14px}.line-overview-measures h2{font-size:13px}.line-measure-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.line-measure-group{min-width:0}.line-measure-group>h3{font-size:12px;line-height:16px;font-weight:600;color:#71717a;margin:10px 16px 0}.line-measure-group>.laser-info{gap:9px;padding:10px 16px 13px}.line-measure-group .laser-info strong{font-size:19px}
.line-expanded>.line-measure-group{width:100%;align-self:stretch}
@media(max-width:1100px){#lineMain .laser-panel>.phead{height:73px;min-height:73px;flex-direction:column;align-items:stretch;justify-content:center}#lineMain .laser-panel h2{flex:none}.line-plot-actions{justify-content:flex-end}#lineMain .laser-info{min-height:0}}
@media(max-width:760px){#structuredMain,#lineMain{--overview-plot-height:300px}#lineMain .laser-plots{grid-template-columns:1fr}.line-measure-columns{grid-template-columns:1fr}#structuredMain .plots>.panel>.phead{height:73px;min-height:73px;flex-direction:column;align-items:stretch;justify-content:center}#structuredMain .plots>.panel>.phead h2{flex:none}.line-measure-columns{gap:0}}
@media print{#structuredMain .plots .plot,#structuredMain .plots .layout-panel>#layout,#lineMain .line-plot{height:300px;min-height:0}.line-overview-measures{break-inside:avoid}}

`;document.head.append(style);
// Reserve the larger toolbar height using their actual shared width, independent of the active product.
let toolbarWidth=-1;
function sizeToolbars(){const width=toolbarSlot.getBoundingClientRect().width;if(width<1)return;header.classList.add('toolbar-measuring');const height=Math.ceil(Math.max(structuredActions.getBoundingClientRect().height,lineActions.getBoundingClientRect().height));header.classList.remove('toolbar-measuring');toolbarSlot.style.height=height+'px';toolbarWidth=width;}
sizeToolbars();new ResizeObserver(()=>{if(Math.abs(toolbarSlot.getBoundingClientRect().width-toolbarWidth)>.25)sizeToolbars();}).observe(toolbarSlot);
if(document.fonts?.ready)document.fonts.ready.then(sizeToolbars);
requestAnimationFrame(()=>{drawFootprint();drawLayout();});
})();