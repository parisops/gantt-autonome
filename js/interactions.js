/* interactions.js — Boutons de la barre d'outils, filtres, drag & resize des barres, duplication, tooltips, reglages d'affichage */

document.getElementById('btnAddTask').addEventListener('click', ()=>{
  const id = uid();
  const today = new Date(); today.setHours(0,0,0,0);
  const end = addDays(today,5);
  tasks.push({id, parentId:null, name:'Nouvelle tâche', start:today, end, baselineEnd:new Date(end), actualEnd:null, progress:0, owner:'', color:'#579bfc', milestone:false, deps:[]});
  pushHistory(); render(); openTaskModal(id);
});

document.getElementById('zoomSelect').addEventListener('change', e=>{ zoom = e.target.value; render(); });
document.getElementById('searchInput').addEventListener('input', e=>{ filterText = e.target.value.toLowerCase(); render(); });
document.getElementById('filterStatus').addEventListener('change', e=>{ filterStatus = e.target.value; render(); });
document.getElementById('filterOwner').addEventListener('change', e=>{ filterOwner = e.target.value; render(); });
document.getElementById('btnExpandAll').addEventListener('click', ()=>{ collapsed.clear(); render(); });
document.getElementById('btnCollapseAll').addEventListener('click', ()=>{ tasks.forEach(t=>{ if(hasChildren(t.id)) collapsed.add(t.id); }); render(); });
document.getElementById('btnGoToday').addEventListener('click', ()=>{
  const gs = document.getElementById('ganttScroll'); if(!gs) return;
  const dayWidth = zoom==='day'?36:zoom==='week'?14:5;
  const allDates = tasks.filter(t=>t.start&&t.end).flatMap(t=>[t.start,t.end]);
  if(!allDates.length) return;
  const minDate = addDays(new Date(Math.min(...allDates)), -3);
  gs.scrollLeft = Math.max(dayDiff(minDate,new Date())*dayWidth - 200, 0);
});

/* ---------- PANNEAU DE REGLAGES D'AFFICHAGE ---------- */
const btnSettings = document.getElementById('btnSettings');
const settingsPanel = document.getElementById('settingsPanel');
const chkHideWeekends = document.getElementById('chkHideWeekends');
const chkHideNames = document.getElementById('chkHideNames');
const chkHideBarLabels = document.getElementById('chkHideBarLabels');
const chkCriticalPath = document.getElementById('chkCriticalPath');

chkHideWeekends.checked = hideWeekends;
chkHideNames.checked = hideTreeNames;
chkHideBarLabels.checked = hideBarLabels;
chkCriticalPath.checked = showCriticalPath;

btnSettings.addEventListener('click', e=>{ e.stopPropagation(); settingsPanel.classList.toggle('open'); });
document.addEventListener('click', e=>{
  if(!settingsPanel.contains(e.target) && e.target!==btnSettings){ settingsPanel.classList.remove('open'); }
});
chkHideWeekends.addEventListener('change', e=>{ hideWeekends = e.target.checked; saveDisplaySettings(); render(); });
chkHideNames.addEventListener('change', e=>{ hideTreeNames = e.target.checked; saveDisplaySettings(); render(); });
chkHideBarLabels.addEventListener('change', e=>{ hideBarLabels = e.target.checked; saveDisplaySettings(); render(); });
chkCriticalPath.addEventListener('change', e=>{ showCriticalPath = e.target.checked; saveDisplaySettings(); render(); });

/* ---------- INFOBULLE GLOBALE (portail) ---------- */
function showGlobalTooltip(target, html){
  const tip = document.getElementById('globalTooltip');
  tip.innerHTML = html;
  tip.style.display = 'block';
  const r = target.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let left = r.left + r.width/2;
  left = Math.max(tipRect.width/2 + 6, Math.min(window.innerWidth - tipRect.width/2 - 6, left));
  tip.style.left = left + 'px';
  tip.style.top = (r.top - 10) + 'px';
  tip.style.transform = 'translate(-50%, -100%)';
}
function hideGlobalTooltip(){ document.getElementById('globalTooltip').style.display = 'none'; }

/* ---------- EVENEMENTS DES LIGNES ---------- */
function attachRowEvents(dayWidth, minDate){
  document.querySelectorAll('.expand-btn').forEach(btn=>{
    btn.addEventListener('click', e=>{
      const id = Number(e.target.dataset.id);
      if(collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
      render();
    });
  });
  document.querySelectorAll('.task-row').forEach(row=>{
    row.addEventListener('dblclick', e=>{
      if(e.target.dataset.action) return;
      openTaskModal(Number(row.dataset.id));
    });
  });
  document.querySelectorAll('[data-action="add-sub"]').forEach(el=>{
    el.addEventListener('click', e=>{
      e.stopPropagation();
      const parentId = Number(el.dataset.id);
      const parent = tasks.find(x=>x.id===parentId);
      const id = uid();
      const start = new Date(parent.start||new Date());
      const end = addDays(start,3);
      tasks.push({id, parentId, name:'Nouvelle sous-tâche', start, end, baselineEnd:new Date(end), actualEnd:null, progress:0, owner:parent.owner, color:parent.color, milestone:false, deps:[]});
      collapsed.delete(parentId);
      pushHistory(); render(); openTaskModal(id);
    });
  });
  document.querySelectorAll('[data-action="dup"]').forEach(el=>{
    el.addEventListener('click', e=>{
      e.stopPropagation();
      duplicateTask(Number(el.dataset.id));
    });
  });
  document.querySelectorAll('[data-action="comment"]').forEach(el=>{
    el.addEventListener('click', e=>{
      e.stopPropagation();
      openCommentModal(Number(el.dataset.id));
    });
  });
  document.querySelectorAll('.milestone').forEach(m=>{
    m.addEventListener('click', ()=> openTaskModal(Number(m.dataset.id)));
  });
  document.querySelectorAll('.comment-marker').forEach(m=>{
    m.addEventListener('click', e=>{ e.stopPropagation(); openCommentModal(Number(m.dataset.id)); });
    m.addEventListener('mouseenter', ()=> showGlobalTooltip(m, m.dataset.tooltip));
    m.addEventListener('mouseleave', hideGlobalTooltip);
  });

  document.querySelectorAll('.bar').forEach(bar=>{
    const id = Number(bar.dataset.id);
    if(hasChildren(id)){
      bar.addEventListener('click', ()=> openTaskModal(id));
      return;
    }
    let dragging=false, dragMode='move', startX=0, origStart=null, origEnd=null, moved=false;
    bar.addEventListener('mousedown', e=>{
      if(e.target.classList.contains('resize-handle')) return;
      dragging=true; moved=false; dragMode='move'; startX=e.clientX;
      const t = tasks.find(x=>x.id===id); origStart=new Date(t.start); origEnd=new Date(t.end);
      e.preventDefault();
    });
    bar.querySelectorAll('.resize-handle').forEach(h=>{
      h.addEventListener('mousedown', e=>{
        dragging=true; moved=false; dragMode=h.dataset.edge; startX=e.clientX;
        const t = tasks.find(x=>x.id===id); origStart=new Date(t.start); origEnd=new Date(t.end);
        e.stopPropagation(); e.preventDefault();
      });
    });
    window.addEventListener('mousemove', e=>{
      if(!dragging) return;
      const dx = e.clientX-startX;
      const dayDelta = Math.round(dx/dayWidth);
      if(dayDelta!==0) moved=true;
      const t = tasks.find(x=>x.id===id);
      if(dragMode==='move'){ t.start=addDays(origStart,dayDelta); t.end=addDays(origEnd,dayDelta); }
      else if(dragMode==='left'){ const ns=addDays(origStart,dayDelta); if(ns<t.end) t.start=ns; }
      else if(dragMode==='right'){ const ne=addDays(origEnd,dayDelta); if(ne>t.start) t.end=ne; }
      render();
    });
    window.addEventListener('mouseup', ()=>{
      if(dragging && moved) pushHistory();
      dragging=false;
    });
    bar.addEventListener('click', ()=>{ if(!moved) openTaskModal(id); });
  });
}

function duplicateTask(id){
  const t = tasks.find(x=>x.id===id);
  const idMap = {};
  const toClone = [t, ...tasks.filter(x=>isDescendant(x, id))];
  toClone.forEach(orig=>{ idMap[orig.id] = uid(); });
  toClone.forEach(orig=>{
    tasks.push({...orig, id: idMap[orig.id], name: orig.id===id? orig.name+' (copie)': orig.name,
      parentId: orig.parentId && idMap[orig.parentId] ? idMap[orig.parentId] : (orig.id===id? orig.parentId : orig.parentId),
      start:new Date(orig.start), end:new Date(orig.end),
      baselineEnd: orig.baselineEnd? new Date(orig.baselineEnd) : new Date(orig.end),
      actualEnd: orig.actualEnd? new Date(orig.actualEnd) : null,
      deps:[...(orig.deps||[])]});
  });
  pushHistory(); render();
  showToast('Tâche dupliquée');
}
