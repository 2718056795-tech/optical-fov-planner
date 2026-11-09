'use strict';
(function(){
const controls=document.createElement('div');controls.className='v10-history';controls.innerHTML='<button id="undoParameters" disabled title="撤销参数修改 · Ctrl+Z">撤销</button><button id="redoParameters" disabled title="重做参数修改 · Ctrl+Y">重做</button>';document.querySelector('.actions').prepend(controls);
const snapshots=[clone(state)];let historyIndex=0,historyGroup=null,replaying=false;
const signature=()=>JSON.stringify(state);
function historyButtons(){const dirty=signature()!==JSON.stringify(snapshots[historyIndex]);$('undoParameters').disabled=!dirty&&historyIndex===0;$('redoParameters').disabled=dirty||historyIndex>=snapshots.length-1;}
const forwardUpdate=update;
update=function(){forwardUpdate();if(!replaying&&result){const next=clone(state);if(JSON.stringify(next)!==JSON.stringify(snapshots[historyIndex])){const el=document.activeElement,group=el?.dataset.path||(el?.id==='otherWD'?'otherWD':null);snapshots.splice(historyIndex+1);if(group&&group===historyGroup&&historyIndex>0)snapshots[historyIndex]=next;else{snapshots.push(next);historyIndex++;if(snapshots.length>101){snapshots.shift();historyIndex--;}}historyGroup=group;}}historyButtons();};
function restoreHistory(next){replaying=true;historyGroup=null;state=clone(next);sync();update();replaying=false;historyButtons();}
$('undoParameters').onclick=()=>{if(signature()!==JSON.stringify(snapshots[historyIndex]))restoreHistory(snapshots[historyIndex]);else if(historyIndex>0)restoreHistory(snapshots[--historyIndex]);toast('已撤销参数修改');};
$('redoParameters').onclick=()=>{if(historyIndex<snapshots.length-1)restoreHistory(snapshots[++historyIndex]);toast('已重做参数修改');};
document.addEventListener('focusout',()=>historyGroup=null);
document.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||e.altKey)return;const el=e.target;if(el.matches('input,textarea')&&!el.dataset.path&&el.id!=='otherWD')return;const k=e.key.toLowerCase();if(k==='z'||k==='y'){e.preventDefault();if(k==='y'||e.shiftKey){if(!$('redoParameters').disabled)$('redoParameters').click();}else if(!$('undoParameters').disabled)$('undoParameters').click();}});
// Move the original panel into a modal, retaining controls and export handlers.
const dialog=document.createElement('dialog');dialog.id='plotDialog';dialog.innerHTML='<div class="plot-dialog-head"><strong id="plotDialogTitle"></strong><button id="closePlotDialog" autofocus>恢复视图 · Esc</button></div><div id="plotDialogBody"></div>';document.body.append(dialog);let expanded=null,placeholder=null,expandTrigger=null;
function redraw(){requestAnimationFrame(()=>{drawFootprint();drawLayout();});}
document.querySelectorAll('.plots>.panel').forEach(panel=>{const button=document.createElement('button');button.className='plot-zoom';button.type='button';button.textContent='放大';button.title='单独放大此图';panel.querySelector('.phead').append(button);button.onclick=()=>{if(expanded)return;expandTrigger=button;placeholder=document.createComment('plot-original-position');panel.before(placeholder);expanded=panel;panel.classList.add('expanded-plot');$('plotDialogTitle').textContent=panel.querySelector('h2').textContent;$('plotDialogBody').append(panel);button.hidden=true;dialog.showModal();redraw();};});
$('closePlotDialog').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{if(!expanded)return;expanded.classList.remove('expanded-plot');placeholder.replaceWith(expanded);expandTrigger.hidden=false;const trigger=expandTrigger;expanded=placeholder=expandTrigger=null;redraw();trigger.focus({preventScroll:true});});
historyButtons();
})();