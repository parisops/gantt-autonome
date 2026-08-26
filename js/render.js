/* render.js — Construction du DOM: en-tete, arborescence figee, timeline, dependances */

function render(){
  updateUndoRedoButtons();
  const ownerSel = document.getElementById('filterOwner');
  const owners = [...new Set(tasks.map(t=>t.owner).filter(Boolean))];
  ownerSel.innerHTML = '<option value="">Tous les responsables</option>' + owners.map(o=>`<option value="${escapeHtml(o)}" ${filterOwner===o?'selected':''}>${escapeHtml(o)}</option>`).join('');

  const container = document.getElementById('mainContainer');
  if(tasks.length===0){
    container.innerHTML = '<div class="empty-state"><div class="drop-zone" id="dropZone"><h2>Aucune donnée chargée</h2><p>Importez votre fichier Excel, téléchargez le modèle, ou créez une nouvelle tâche.</p></div></div>';
    setupDropZone();
    return;
  }
  const roots = buildTree();
  const flat = [];
  const hasActiveFilter = filterText || filterStatus || filterOwner;
  function walk(node){
    if(hasActiveFilter && !subtreeMatches(node)) return;
    flat.push(node);
    if(!collapsed.has(node.id)) node.children.forEach(walk);
  }
  roots.forEach(walk);

  const dayWidth = zoom==='day'?36:zoom==='week'?14:5;
  const allDates = tasks.filter(t=>t.start&&t.end).flatMap(t=>[t.start,t.end]);
  const minDate = addDays(new Date(Math.min(...allDates)), -3);
  const maxDate = addDays(new Date(Math.max(...allDates)), 12);
  const totalDays = Math.max(dayDiff(minDate,maxDate),30);
  const totalWidth = totalDays*dayWidth;
  const rowsHeight = flat.length*44;
  const fullWidth = leftPanelWidth + totalWidth;
  const fullHeight = 42 + rowsHeight;

  let headerTimelineInner = '';
  if(zoom==='month'){
    let cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while(cursor < maxDate){
      const next = new Date(cursor.getFullYear(), cursor.getMonth()+1, 1);
      const w = dayDiff(cursor<minDate?minDate:cursor, next>maxDate?maxDate:next)*dayWidth;
      headerTimelineInner += `<div class="cell" style="width:${w}px">${cursor.toLocaleDateString('fr-FR',{month:'short',year:'2-digit'})}</div>`;
      cursor = next;
    }
  } else if(zoom==='week'){
    let cursor = new Date(minDate);
    while(cursor < maxDate){
      headerTimelineInner += `<div class="cell" style="width:${7*dayWidth}px">Sem. ${getWeekNumber(cursor)}</div>`;
      cursor = addDays(cursor,7);
    }
  } else {
    let cursor = new Date(minDate);
    while(cursor < maxDate){
      headerTimelineInner += `<div class="cell" style="width:${dayWidth}px">${cursor.getDate()}</div>`;
      cursor = addDays(cursor,1);
    }
  }

  const headerRowHtml = `<div class="header-row" style="width:${fullWidth}px;">
    <div class="row-header" style="width:${leftPanelWidth}px;"><div></div><div>Nom de la tâche</div><div>Échéance</div><div>Statut</div><div></div></div>
    <div class="timeline-header" style="width:${totalWidth}px;">${headerTimelineInner}</div>
  </div>`;

  let gridInner = '';
  for(let i=0;i<totalDays;i++){
    const d = addDays(minDate,i);
    const isWeekend = d.getDay()===0 || d.getDay()===6;
    gridInner += `<div class="grid-col ${isWeekend?'weekend':''}" style="left:${i*dayWidth}px;width:${dayWidth}px;height:${rowsHeight}px;"></div>`;
  }
  const todayOffset = dayDiff(minDate, new Date());
  if(todayOffset>=0 && todayOffset<=totalDays){
    gridInner += `<div class="today-line" style="left:${todayOffset*dayWidth}px;height:${rowsHeight}px;"></div><div class="today-flag" style="left:${todayOffset*dayWidth}px;">Aujourd'hui</div>`;
  }
  const bgGridHtml = `<div class="bg-grid" style="left:${leftPanelWidth}px;width:${totalWidth}px;height:${rowsHeight}px;">${gridInner}</div>`;

  const rects = {};
  let rowsHtml = '';
  flat.forEach((t, idx)=>{
    const status = computeStatus(t);
    const commentCount = comments.filter(c=>c.taskId===t.id).length;
    const hasChildren = t.children.length>0;
    const isCollapsed = collapsed.has(t.id);
    const prog = displayProgress(t);
    const lc = levelClass(t.level);

    let barLeft=0, barWidth=dayWidth*3;
    if(t.start && t.end){
      barLeft = dayDiff(minDate,t.start)*dayWidth;
      barWidth = Math.max(dayDiff(t.start,t.end)*dayWidth, 6);
    }
    rects[t.id] = {left:barLeft, width:barWidth, top:idx*44, milestone: t.milestone};

    const taskRowHtml = `<div class="task-row ${lc} ${t.id===selectedTaskId?'selected':''} ${t.milestone?'milestone-row':''}" data-id="${t.id}" style="width:${leftPanelWidth}px;border-left-color:${t.color};">
      <div class="expand-btn" data-id="${t.id}">${hasChildren?(isCollapsed?'▶':'▼'):''}</div>
      <div class="task-name" style="padding-left:${t.level*14}px;">
        <span class="avatar" style="background:${ownerColor(t.owner)}" title="${escapeHtml(t.owner||'')}">${initials(t.owner)}</span>
        <input type="text" value="${escapeHtml(t.name)}" data-field="name" data-id="${t.id}">
      </div>
      <div style="font-size:11px;color:var(--text-light)">${fmt(t.start)} → ${fmt(t.end)}</div>
      <div><span class="status-badge" style="background:${STATUS_COLORS[status]}">${t.milestone?'Jalon':status+(hasChildren?' ('+prog+'%)':'')}</span></div>
      <div class="comment-btn" data-id="${t.id}" title="Commentaires">💬${commentCount>0?`<span class="comment-badge">${commentCount}</span>`:''}</div>
      <div class="row-actions">
        <span data-action="add-sub" data-id="${t.id}" title="Ajouter sous-tâche">➕</span>
        <span data-action="dup" data-id="${t.id}" title="Dupliquer">⎘</span>
      </div>
    </div>`;

    let timelineCellInner = '';
    if(t.milestone){
      timelineCellInner = `<div class="milestone" data-id="${t.id}" style="left:${barLeft-10}px;background:${t.color};" title="${escapeHtml(t.name)}"></div>`;
    } else {
      timelineCellInner = `<div class="bar" data-id="${t.id}" style="left:${barLeft}px;width:${barWidth}px;background:${t.color};">
          <div class="bar-progress" style="width:${prog}%;"></div>
          <span class="bar-label">${escapeHtml(t.name)} · ${prog}%</span>
          <div class="resize-handle left" data-id="${t.id}" data-edge="left"></div>
          <div class="resize-handle right" data-id="${t.id}" data-edge="right"></div>
        </div>`;
    }
    const timelineCellHtml = `<div class="timeline-row-cell ${lc} ${t.milestone?'milestone-row':''}" style="width:${totalWidth}px;">${timelineCellInner}</div>`;

    rowsHtml += `<div class="row" style="width:${fullWidth}px;">${taskRowHtml}${timelineCellHtml}</div>`;
  });

  let svgHtml = `<svg class="dep-svg" style="left:${leftPanelWidth}px;" width="${totalWidth}" height="${rowsHeight}"><defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#9699a6"/></marker>
  </defs>`;
  flat.forEach(t=>{
    (t.deps||[]).forEach(depId=>{
      const from = rects[depId], to = rects[t.id];
      if(!from || !to) return;
      const x1 = from.left+from.width, y1 = from.top+22, x2 = to.left+(to.milestone?0:0), y2 = to.top+22;
      const midX = x1+12;
      svgHtml += `<path d="M${x1},${y1} L${midX},${y1} L${midX},${y2} L${x2},${y2}" stroke="#9699a6" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>`;
    });
  });
  svgHtml += `</svg>`;

  const rowsWrapperHtml = `<div class="rows-wrapper" style="width:${fullWidth}px;height:${rowsHeight}px;">${bgGridHtml}${rowsHtml}${svgHtml}</div>`;

  container.innerHTML = `<div class="gantt-scroll" id="ganttScroll">
    <div class="gantt-inner" id="ganttInner" style="width:${fullWidth}px;height:${fullHeight}px;">
      ${headerRowHtml}
      ${rowsWrapperHtml}
      <div class="resizer" id="resizer" style="left:${leftPanelWidth}px;height:${fullHeight}px;"></div>
    </div>
  </div>`;

  attachRowEvents(dayWidth, minDate);
  attachResizer();
}

function attachResizer(){
  const resizer = document.getElementById('resizer');
  const scroller = document.getElementById('ganttScroll');
  if(!resizer || !scroller) return;
  let dragging = false;

  scroller.addEventListener('scroll', ()=>{
    resizer.style.left = (leftPanelWidth + scroller.scrollLeft) + 'px';
  });

  resizer.addEventListener('mousedown', e=>{ dragging=true; resizer.classList.add('active'); e.preventDefault(); });
  window.addEventListener('mousemove', e=>{
    if(!dragging) return;
    const rect = scroller.getBoundingClientRect();
    let w = e.clientX - rect.left + scroller.scrollLeft;
    w = Math.max(220, Math.min(900, w));
    leftPanelWidth = w;
    render();
  });
  window.addEventListener('mouseup', ()=>{ dragging=false; const r=document.getElementById('resizer'); if(r) r.classList.remove('active'); });
}

function getWeekNumber(d){
  const date = new Date(d.getTime()); date.setHours(0,0,0,0);
  date.setDate(date.getDate()+3-(date.getDay()+6)%7);
  const week1 = new Date(date.getFullYear(),0,4);
  return 1+Math.round(((date-week1)/86400000-3+(week1.getDay()+6)%7)/7);
}
