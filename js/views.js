/* views.js — Vue Table (liste triable) et Vue Charge (repartition par responsable, detection de surallocation) */

function statusOfTask(t){
  const isParent = hasChildren(t.id);
  const eff = isParent ? getEffectiveRange(t.id) : {start:t.start, end:t.end};
  const prog = isParent ? displayProgressFlat(t.id) : t.progress;
  return computeStatus({start:eff.start, end:eff.end, progress:prog});
}

function renderTableView(container){
  let list = tasks.slice();
  list = list.filter(t=>{
    const st = statusOfTask(t);
    const textOk = !filterText || t.name.toLowerCase().includes(filterText) || (t.owner||'').toLowerCase().includes(filterText);
    const statusOk = !filterStatus || st===filterStatus;
    const ownerOk = !filterOwner || t.owner===filterOwner;
    return textOk && statusOk && ownerOk;
  });

  let useHierarchy = !tableSortField;
  let displayList = [];
  if(useHierarchy){
    const roots = buildTree();
    const keepIds = new Set(list.map(t=>t.id));
    function walk(n){ if(keepIds.has(n.id)) displayList.push(n); n.children.forEach(walk); }
    roots.forEach(walk);
  } else {
    displayList = list.map(t=>({...t, level:0}));
    displayList.sort((a,b)=>{
      let va,vb;
      const effA = hasChildren(a.id) ? getEffectiveRange(a.id) : {start:a.start,end:a.end};
      const effB = hasChildren(b.id) ? getEffectiveRange(b.id) : {start:b.start,end:b.end};
      switch(tableSortField){
        case 'name': va=a.name.toLowerCase(); vb=b.name.toLowerCase(); break;
        case 'owner': va=(a.owner||'').toLowerCase(); vb=(b.owner||'').toLowerCase(); break;
        case 'start': va=effA.start?effA.start.getTime():0; vb=effB.start?effB.start.getTime():0; break;
        case 'end': va=effA.end?effA.end.getTime():0; vb=effB.end?effB.end.getTime():0; break;
        case 'progress': va=hasChildren(a.id)?displayProgressFlat(a.id):a.progress; vb=hasChildren(b.id)?displayProgressFlat(b.id):b.progress; break;
        case 'status': va=statusOfTask(a); vb=statusOfTask(b); break;
        default: va=0; vb=0;
      }
      if(va<vb) return tableSortDir==='asc'?-1:1;
      if(va>vb) return tableSortDir==='asc'?1:-1;
      return 0;
    });
  }

  function th(field,label){
    const active = tableSortField===field;
    const arrow = active ? (tableSortDir==='asc'?' ▲':' ▼') : '';
    return `<th data-field="${field}">${label}${arrow}</th>`;
  }

  const rowsHtml = displayList.map(t=>{
    const isParent = hasChildren(t.id);
    const eff = isParent ? getEffectiveRange(t.id) : {start:t.start, end:t.end};
    const prog = isParent ? displayProgressFlat(t.id) : t.progress;
    const st = statusOfTask(t);
    const level = t.level||0;
    const commentCount = comments.filter(c=>c.taskId===t.id).length;
    const depsNames = (t.deps||[]).map(id=>{ const d=tasks.find(x=>x.id===id); return d?d.name:''; }).filter(Boolean).join(', ');
    return `<tr data-id="${t.id}" class="${isParent?'is-parent':''}">
      <td style="padding-left:${10+level*18}px;"><span class="avatar-sm" style="background:${ownerColor(t.owner)}">${initials(t.owner)}</span> ${t.milestone?'◆ ':''}${escapeHtml(t.name)}</td>
      <td>${escapeHtml(t.owner||'—')}</td>
      <td>${fmt(eff.start)}</td>
      <td>${fmt(eff.end)}</td>
      <td><div class="table-progress"><div class="table-progress-fill" style="width:${prog}%;background:${t.color};"></div></div><span class="table-progress-label">${prog}%</span></td>
      <td><span class="status-badge" style="background:${STATUS_COLORS[st]}">${statusLabel(st)}</span></td>
      <td style="text-align:center;">${commentCount || ''}</td>
      <td class="deps-cell">${escapeHtml(depsNames)}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `<div class="table-view-wrap">
    <table class="task-table">
      <thead><tr>
        ${th('name','Tâche')}${th('owner','Responsable')}${th('start','Début')}${th('end','Fin')}${th('progress','Avancement')}${th('status','Statut')}<th>💬</th><th>Dépendances</th>
      </tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="8" class="table-empty">Aucune tâche ne correspond aux filtres.</td></tr>'}</tbody>
    </table>
  </div>`;

  container.querySelectorAll('thead th[data-field]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const f = el.dataset.field;
      if(tableSortField===f){ tableSortDir = tableSortDir==='asc'?'desc':'asc'; }
      else { tableSortField=f; tableSortDir='asc'; }
      render();
    });
  });
  container.querySelectorAll('tbody tr[data-id]').forEach(tr=>{
    tr.addEventListener('click', ()=> openTaskModal(Number(tr.dataset.id)));
  });
}

function renderWorkloadView(container){
  const leafTasks = tasks.filter(t=>!hasChildren(t.id) && t.start && t.end && !t.milestone);
  const filtered = leafTasks.filter(t=>{
    const st = statusOfTask(t);
    const textOk = !filterText || t.name.toLowerCase().includes(filterText) || (t.owner||'').toLowerCase().includes(filterText);
    const statusOk = !filterStatus || st===filterStatus;
    const ownerOk = !filterOwner || t.owner===filterOwner;
    return textOk && statusOk && ownerOk;
  });
  const owners = [...new Set(filtered.map(t=>t.owner || 'Non assigné'))].sort();

  let html = '<div class="workload-wrap">';
  if(!owners.length){
    html += '<div class="table-empty" style="padding:40px;">Aucune tâche assignée à afficher pour ces filtres.</div>';
  }
  owners.forEach(owner=>{
    const ownerTasks = filtered.filter(t=>(t.owner||'Non assigné')===owner).sort((a,b)=>a.start-b.start);
    const overlapIds = new Set();
    for(let i=0;i<ownerTasks.length;i++){
      for(let j=i+1;j<ownerTasks.length;j++){
        const a=ownerTasks[i], b=ownerTasks[j];
        if(a.start < b.end && b.start < a.end){ overlapIds.add(a.id); overlapIds.add(b.id); }
      }
    }
    const totalDays = ownerTasks.reduce((s,t)=>s+Math.max(dayDiff(t.start,t.end),1),0);
    html += `<div class="owner-card">
      <div class="owner-card-header">
        <span class="avatar" style="background:${ownerColor(owner==='Non assigné'?'':owner)}">${initials(owner)}</span>
        <div>
          <div class="owner-name">${escapeHtml(owner)}</div>
          <div class="owner-meta">${ownerTasks.length} tâche(s) · ${totalDays} jour(s) cumulé(s)${overlapIds.size ? ` · <span class="overalloc-tag">⚠️ ${overlapIds.size} tâche(s) en chevauchement</span>` : ''}</div>
        </div>
      </div>
      <div class="owner-tasks">
        ${ownerTasks.map(t=>{
          const inOverlap = overlapIds.has(t.id);
          const prog = t.progress;
          return `<div class="owner-task-pill ${inOverlap?'overalloc':''}" data-id="${t.id}" style="border-left-color:${t.color};">
            <span class="pill-name">${escapeHtml(t.name)}</span>
            <span class="pill-dates">${fmt(t.start)} → ${fmt(t.end)} · ${prog}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
  container.querySelectorAll('.owner-task-pill').forEach(p=>{
    p.addEventListener('click', ()=> openTaskModal(Number(p.dataset.id)));
  });
}
