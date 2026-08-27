/* render.js — Dispatcher de vues + construction de la vue Gantt (en-tete, arborescence, timeline, dependances, chemin critique) */

function statusLabel(status){
  if(status === 'À venir') return 'En cours';
  return status;
}

function routeDependencyPath(x1,y1,x2,y2){
  const gap = 10;
  if(x2 >= x1 + gap*2){
    const midX = (x1+x2)/2;
    return `M${x1},${y1} L${midX},${y1} L${midX},${y2} L${x2},${y2}`;
  }
  const outX = x1 + gap;
  const inX = x2 - gap;
  const midY = (y1+y2)/2;
  return `M${x1},${y1} L${outX},${y1} L${outX},${midY} L${inX},${midY} L${inX},${y2} L${x2},${y2}`;
}

/* ---------- DISPATCHER PRINCIPAL ---------- */
function render(){
  const container = document.getElementById('mainContainer');
  const cpInfo = document.getElementById('cpInfo');

  if(tasks.length===0){
    container.innerHTML = '<div class="empty-state"><div class="drop-zone" id="dropZone"><h2>Aucune donnée chargée</h2><p>Importez votre fichier Excel, téléchargez le modèle, ou créez une nouvelle tâche.</p></div></div>';
    setupDropZone();
    if(cpInfo) cpInfo.style.display = 'none';
    updateUndoRedoButtons();
    return;
  }

  updateUndoRedoButtons();
  const ownerSel = document.getElementById('filterOwner');
  const owners = [...new Set(tasks.map(t=>t.owner).filter(Boolean))];
  ownerSel.innerHTML = '<option value="">Tous les responsables</option>' + owners.map(o=>`<option value="${escapeHtml(o)}" ${filterOwner===o?'selected':''}>${escapeHtml(o)}</option>`).join('');

  document.querySelectorAll('.nav-item').forEach(b=> b.classList.toggle('active', b.dataset.view===currentView));
  const zoomSelect = document.getElementById('zoomSelect');
  const isGanttView = currentView==='gantt';
  if(zoomSelect) zoomSelect.style.display = isGanttView ? '' : 'none';
  const settingsWrap = document.querySelector('.settings-wrap');
  if(settingsWrap) settingsWrap.style.display = isGanttView ? '' : 'none';
  if(cpInfo && !isGanttView) cpInfo.style.display = 'none';

  if(currentView==='table'){ renderTableView(container); return; }
  if(currentView==='workload'){ renderWorkloadView(container); return; }
  renderGanttView(container, cpInfo);
}

/* ---------- VUE GANTT ---------- */
function renderGanttView(container, cpInfo){
  let cp = null;
  if(showCriticalPath){
    try{
      if(typeof computeCriticalPath === 'function'){
        cp = computeCriticalPath();
      } else {
        console.error('computeCriticalPath indisponible — js/critical-path.js ne semble pas chargé.');
        showToast("Chemin critique indisponible (fichier non chargé) — recharge la page (Ctrl+Maj+R).");
      }
    }catch(err){
      console.error('Erreur lors du calcul du chemin critique :', err);
      showToast('Erreur lors du calcul du chemin critique (voir console).');
      cp = null;
    }
  }
  if(cp && cpInfo){
    cpInfo.style.display = 'inline-block';
    cpInfo.textContent = `🎯 Chemin critique : ${cp.totalDays} j · ${cp.count} tâche(s)`;
  } else if(cpInfo){
    cpInfo.style.display = 'none';
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

  const parentIds = new Set(tasks.filter(t=>t.parentId).map(t=>t.parentId));
  const leafDates = tasks.filter(t=>!parentIds.has(t.id) && t.start && t.end).flatMap(t=>[t.start,t.end]);
  const allDates = leafDates.length ? leafDates : tasks.filter(t=>t.start&&t.end).flatMap(t=>[t.start,t.end]);
  const minDate = addDays(new Date(Math.min(...allDates)), -3);
  const maxDate = addDays(new Date(Math.max(...allDates)), 12);
  const totalDays = Math.max(dayDiff(minDate,maxDate),30);

  /* Nombre de jours visibles (sans les weekends si masques), independant de la largeur de colonne */
  const visibleCumDays = [0];
  for(let i=0;i<totalDays;i++){
    const d = addDays(minDate,i);
    const isWeekend = d.getDay()===0 || d.getDay()===6;
    visibleCumDays.push(visibleCumDays[i] + ((hideWeekends && isWeekend) ? 0 : 1));
  }
  const totalVisibleDays = Math.max(visibleCumDays[totalDays], 1);

  /* La timeline s'etire pour occuper toute la largeur disponible, quel que soit le zoom choisi ;
     en dessous d'une certaine largeur de colonne (minDayWidth), elle redevient scrollable plutot que de s'ecraser. */
  const minDayWidth = zoom==='day'?36:zoom==='week'?14:5;
  const containerWidth = container.clientWidth || window.innerWidth || 1200;
  const availableForTimeline = Math.max(containerWidth - leftPanelWidth, 200);
  const dayWidth = Math.max(minDayWidth, availableForTimeline / totalVisibleDays);

  function xForIndex(i){ const idx = Math.max(0, Math.min(totalDays, i)); return visibleCumDays[idx]*dayWidth; }
  function xForDate(d){ if(!d) return 0; return xForIndex(dayDiff(minDate, d)); }

  const totalWidth = visibleCumDays[totalDays]*dayWidth;
  const rowsHeight = flat.length*34;
  const fullWidth = leftPanelWidth + totalWidth;
  const fullHeight = 34 + rowsHeight;

  let headerTimelineInner = '';
  if(zoom==='month'){
    let cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while(cursor < maxDate){
      const next = new Date(cursor.getFullYear(), cursor.getMonth()+1, 1);
      const from = cursor<minDate?minDate:cursor, to = next>maxDate?maxDate:next;
      const w = xForDate(to) - xForDate(from);
      if(w>0) headerTimelineInner += `<div class="cell" style="width:${w}px">${cursor.toLocaleDateString('fr-FR',{month:'short',year:'2-digit'})}</div>`;
      cursor = next;
    }
  } else if(zoom==='week'){
    let cursor = new Date(minDate);
    while(cursor < maxDate){
      const w = xForDate(addDays(cursor,7)) - xForDate(cursor);
      if(w>0) headerTimelineInner += `<div class="cell" style="width:${w}px">Sem. ${getWeekNumber(cursor)}</div>`;
      cursor = addDays(cursor,7);
    }
  } else {
    let cursor = new Date(minDate);
    while(cursor < maxDate){
      const isWeekend = cursor.getDay()===0 || cursor.getDay()===6;
      if(!(hideWeekends && isWeekend)) headerTimelineInner += `<div class="cell" style="width:${dayWidth}px">${cursor.getDate()}</div>`;
      cursor = addDays(cursor,1);
    }
  }

  const headerRowHtml = `<div class="header-row" style="width:${fullWidth}px;">
    <div class="row-header" style="width:${leftPanelWidth}px;"><div></div><div>Nom de la tâche</div><div>Statut</div></div>
    <div class="timeline-header" style="width:${totalWidth}px;">${headerTimelineInner}</div>
  </div>`;

  let gridInner = '';
  for(let i=0;i<totalDays;i++){
    const d = addDays(minDate,i);
    const isWeekend = d.getDay()===0 || d.getDay()===6;
    if(hideWeekends && isWeekend) continue;
    gridInner += `<div class="grid-col ${isWeekend?'weekend':''}" style="left:${xForIndex(i)}px;width:${dayWidth}px;height:${rowsHeight}px;"></div>`;
  }
  const today = new Date();
  const todayX = xForDate(today);
  if(todayX>=0 && todayX<=totalWidth){
    gridInner += `<div class="today-line" style="left:${todayX}px;height:${rowsHeight}px;"></div><div class="today-flag" style="left:${todayX}px;">Aujourd'hui</div>`;
  }
  const bgGridHtml = `<div class="bg-grid" style="left:${leftPanelWidth}px;width:${totalWidth}px;height:${rowsHeight}px;">${gridInner}</div>`;

  const rects = {};
  let rowsHtml = '';
  flat.forEach((t, idx)=>{
    const isParent = t.children.length>0;
    const eff = isParent ? getEffectiveRange(t.id) : {start:t.start, end:t.end};
    const prog = isParent ? displayProgressFlat(t.id) : t.progress;
    const status = computeStatus({start:eff.start, end:eff.end, progress:prog});
    const commentList = comments.filter(c=>c.taskId===t.id);
    const isCollapsed = collapsed.has(t.id);
    const lc = levelClass(t.level);
    const isCritical = !!(cp && !isParent && cp.criticalIds.has(t.id));
    const isConflict = !!(cp && !isParent && cp.conflictIds.has(t.id));

    let barLeft=0, barWidth=dayWidth*3;
    if(eff.start && eff.end){
      barLeft = xForDate(eff.start);
      barWidth = Math.max(xForDate(eff.end) - barLeft, 6);
    }
    rects[t.id] = {left:barLeft, width:barWidth, top:idx*34, milestone: t.milestone};

    let treeLines = '';
    for(let l=1; l<=t.level; l++){
      treeLines += `<span class="tree-line" style="left:${l*12-6}px;"></span>`;
    }

    const taskRowHtml = `<div class="task-row ${lc} ${t.id===selectedTaskId?'selected':''} ${t.milestone?'milestone-row':''} ${isCritical?'critical-row':''}" data-id="${t.id}" style="width:${leftPanelWidth}px;border-left-color:${isCritical?'#e2445c':t.color};">
      <div class="expand-btn" data-id="${t.id}">${isParent?(isCollapsed?'▶':'▼'):''}</div>
      <div class="task-name" style="padding-left:${t.level*12}px;">
        ${treeLines}
        <span class="avatar" style="background:${ownerColor(t.owner)}" title="${escapeHtml(t.owner||'')}">${initials(t.owner)}</span>
        <span class="name-text" title="${escapeHtml(t.name)}">${isCritical?'🎯 ':''}${escapeHtml(t.name)}</span>
      </div>
      <div><span class="status-badge" style="background:${STATUS_COLORS[status]}">${t.milestone?'Jalon':statusLabel(status)}</span></div>
      <div class="row-actions">
        <span data-action="add-sub" data-id="${t.id}" title="Ajouter sous-tâche">➕</span>
        <span data-action="comment" data-id="${t.id}" title="Commentaires" class="${commentList.length?'has-comments':''}">💬</span>
        <span data-action="dup" data-id="${t.id}" title="Dupliquer">⎘</span>
      </div>
    </div>`;

    const effBaselineEnd = isParent ? getEffectiveDateField(t.id, 'baselineEnd') : t.baselineEnd;
    let overrunHtml = '';
    if(!t.milestone && effBaselineEnd && eff.end && eff.end.getTime() > effBaselineEnd.getTime()){
      const baselineX = xForDate(effBaselineEnd);
      const stripeLeft = Math.max(0, baselineX - barLeft);
      const stripeWidth = Math.max(0, (barLeft+barWidth) - Math.max(baselineX, barLeft));
      if(stripeWidth>0){
        const lateDays = dayDiff(effBaselineEnd, eff.end);
        overrunHtml = `<div class="overrun-stripe" style="left:${stripeLeft}px;width:${stripeWidth}px;" title="Échéance initiale dépassée de ${lateDays} jour(s) (prévue le ${fmt(effBaselineEnd)})"></div>`;
      }
    }

    let timelineCellInner = '';
    if(t.milestone){
      timelineCellInner = `<div class="milestone ${isCritical?'critical':''}" data-id="${t.id}" style="left:${barLeft-7}px;background:${t.color};" title="${escapeHtml(t.name)}${isCritical?' (chemin critique)':''}"></div>`;
    } else if(isParent){
      timelineCellInner = `<div class="bar bar-summary" data-id="${t.id}" style="left:${barLeft}px;width:${barWidth}px;--bar-color:${t.color};" title="${escapeHtml(t.name)} · ${prog}%">${overrunHtml}</div>`;
    } else {
      const critClass = isCritical ? 'critical' : (isConflict ? 'conflict' : '');
      const critTitle = isCritical ? ' [Chemin critique : aucune marge]' : (isConflict ? ' [Conflit : commence avant la fin d\'une dépendance]' : '');
      const textColor = getContrastTextColor(t.color);
      timelineCellInner = `<div class="bar ${critClass}" data-id="${t.id}" style="left:${barLeft}px;width:${barWidth}px;background:${t.color};color:${textColor};" title="${escapeHtml(t.name)}${critTitle}">
          <div class="bar-progress" style="width:${prog}%;"></div>
          <span class="bar-label">${isCritical?'🎯 ':''}${escapeHtml(t.name)} · ${prog}%</span>
          ${overrunHtml}
          <div class="resize-handle left" data-id="${t.id}" data-edge="left"></div>
          <div class="resize-handle right" data-id="${t.id}" data-edge="right"></div>
        </div>`;
    }

    commentList.forEach(c=>{
      if(!c.date) return;
      const cx = xForDate(c.date);
      const tipHtml = `<div class="meta">${escapeHtml(c.author||'Anonyme')} · ${fmt(c.date)}</div>${escapeHtml(c.text)}`;
      timelineCellInner += `<div class="comment-marker" data-id="${t.id}" data-tooltip="${escapeHtml(tipHtml).replace(/"/g,'&quot;')}" style="left:${cx}px;"></div>`;
    });

    const timelineCellHtml = `<div class="timeline-row-cell ${lc} ${t.milestone?'milestone-row':''}" style="width:${totalWidth}px;">${timelineCellInner}</div>`;

    rowsHtml += `<div class="row" style="width:${fullWidth}px;">${taskRowHtml}${timelineCellHtml}</div>`;
  });

  let svgHtml = `<svg class="dep-svg" style="left:${leftPanelWidth}px;" width="${totalWidth}" height="${rowsHeight}"><defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#9699a6"/></marker>
    <marker id="arrow-critical" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#e2445c"/></marker>
  </defs>`;
  flat.forEach(t=>{
    (t.deps||[]).forEach(depId=>{
      const from = rects[depId], to = rects[t.id];
      if(!from || !to) return;
      const x1 = from.left+from.width, y1 = from.top+17, x2 = to.left+(to.milestone?0:0), y2 = to.top+17;
      const isCriticalEdge = !!(cp && cp.criticalIds.has(depId) && cp.criticalIds.has(t.id));
      const isConflictEdge = !!(cp && cp.conflictIds.has(t.id));
      const cls = isCriticalEdge ? 'critical-edge' : (isConflictEdge ? 'conflict-edge' : '');
      const marker = isCriticalEdge ? 'arrow-critical' : 'arrow';
      const d = routeDependencyPath(x1,y1,x2,y2);
      svgHtml += `<path class="${cls}" d="${d}" stroke="#9699a6" stroke-width="1.5" fill="none" marker-end="url(#${marker})"/>`;
    });
  });
  svgHtml += `</svg>`;

  const rowsWrapperHtml = `<div class="rows-wrapper" style="width:${fullWidth}px;height:${rowsHeight}px;">${bgGridHtml}${rowsHtml}${svgHtml}</div>`;

  const scrollClasses = ['gantt-scroll', hideTreeNames?'hide-names':'', hideBarLabels?'hide-bar-labels':''].filter(Boolean).join(' ');
  container.innerHTML = `<div class="${scrollClasses}" id="ganttScroll">
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
    w = Math.max(180, Math.min(800, w));
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

/* Recalcule la mise en page (utile quand la fenetre change de taille, la timeline doit rester pleine largeur) */
let _resizeTimer = null;
window.addEventListener('resize', ()=>{
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(()=>{ if(tasks.length) render(); }, 150);
});
