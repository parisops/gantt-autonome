/* interactions.js — Boutons de la barre d'outils, filtres, drag & resize des barres, duplication */

document.getElementById('btnAddTask').addEventListener('click', ()=>{
  const id = uid();
  const today = new Date(); today.setHours(0,0,0,0);
  tasks.push({id, parentId:null, name:'Nouvelle tâche', start:today, end:addDays(today,5), progress:0, owner:'', color:'#579bfc', milestone:false, deps:[]});
  pushHistory(); render(); openTaskModal(id);
});

document.getElementById('zoomSelect').addEventListener('change', e=>{ zoom = e.target.value; render(); });
document.getElementById('searchInput').addEventListener('input', e=>{ filterText = e.target.value.toLowerCase(); render(); });
document.getElementById('filterStatus').addEventListener('change', e=>{ filterStatus = e.target.value; render(); });
document.getElementById('filterOwner').addEventListener('change', e=>{ filterOwner = e.target.value; render(); });
document.getElementById('btnExpandAll').addEventListener('click', ()=>{ collapsed.clear(); render(); });
document.getElementById('btnCollapseAll').addEventListener('click', ()=>{ tasks.forEach(t=>{ if(tasks.some(x=>x.parentId===t.id)) collapsed.add(t.id); }); render(); });
document.getElementById('btnGoToday').addEventListener('click', ()=>{
  const gs = document.getElementById('ganttScroll'); if(!gs) return;
  const dayWidth = zoom==='day'?36:zoom==='week'?14:5;
  const allDates = tasks.filter(t=>t.start&&t.end).flatMap(t=>[t.start,t.end]);
  if(!allDates.length) return;
  const minDate = addDays(new Date(Math.min(...allDates)), -3);
  gs.scrollLeft = Math.max(dayDiff(minDate,new Date())*dayWidth - 200, 0);
});

/* ---------- EVENEMENTS DES LIGNES ---------- */
function attachRowEvents(dayWidth, minDate){
  document.querySelectorAll('.task-name input').forEach(inp=>{
    inp.addEventListener('change', e=>{
      const id = Number(e.target.dataset.id);
      tasks.find(x=>x.id===id).name = e.target.value;
      pushHistory(); render();
    });
  });
  document.querySelectorAll('.expand-btn').forEach(btn=>{
    btn.addEventListener('click', e=>{
      const id = Number(e.target.dataset.id);
      if(collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
      render();
    });
  });
  document.querySelectorAll('.task-row').forEach(row=>{
    row.addEventListener('dblclick', e=>{
      if(e.target.tagName==='INPUT' || e.target.dataset.action) return;
      openTaskModal(Number(row.dataset.id));
    });
  });
  document.querySelectorAll('[data-action="add-sub"]').forEach(el=>{
    el.addEventListener('click', e=>{
      e.stopPropagation();
      const parentId = Number(el.dataset.id);
      const parent = tasks.find(x=>x.id===parentId);
      const id = uid();
      tasks.push({id, parentId, name:'Nouvelle sous-tâche', start:new Date(parent.start), end:addDays(new Date(parent.start),3), progress:0, owner:parent.owner, color:parent.color, milestone:false, deps:[]});
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
  document.querySelectorAll('.comment-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> openCommentModal(Number(btn.dataset.id)));
  });
  document.querySelectorAll('.milestone').forEach(m=>{
    m.addEventListener('click', ()=> openTaskModal(Number(m.dataset.id)));
  });

  document.querySelectorAll('.bar').forEach(bar=>{
    let dragging=false, dragMode='move', startX=0, origStart=null, origEnd=null, moved=false;
    const id = Number(bar.dataset.id);
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
      start:new Date(orig.start), end:new Date(orig.end), deps:[...(orig.deps||[])]});
  });
  pushHistory(); render();
  showToast('Tâche dupliquée');
}
