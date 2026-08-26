/* modals.js — Modales d'edition de tache et de commentaires, palette de couleurs, baseline, impression */

document.getElementById('btnPrint').addEventListener('click', ()=>window.print());

function renderColorPalette(selected){
  const wrap = document.getElementById('m_color_palette');
  wrap.innerHTML = COLOR_PALETTE.map(c=>`<div class="color-swatch ${c===selected?'active':''}" data-color="${c}" style="background:${c};">${c===selected?'✓':''}</div>`).join('');
  wrap.querySelectorAll('.color-swatch').forEach(sw=>{
    sw.addEventListener('click', ()=>{
      selectedColorInModal = sw.dataset.color;
      wrap.querySelectorAll('.color-swatch').forEach(s=>{ s.classList.remove('active'); s.textContent=''; });
      sw.classList.add('active'); sw.textContent='✓';
    });
  });
}

function openTaskModal(id){
  selectedTaskId = id;
  const t = tasks.find(x=>x.id===id);
  const isParent = hasChildren(id);
  const eff = isParent ? getEffectiveRange(id) : {start:t.start, end:t.end};
  const prog = isParent ? displayProgressFlat(id) : t.progress;
  const effBaseline = isParent ? getEffectiveDateField(id,'baselineEnd') : t.baselineEnd;
  const effActual = isParent ? getEffectiveDateField(id,'actualEnd') : t.actualEnd;

  document.getElementById('m_title').textContent = 'Éditer : ' + t.name;
  document.getElementById('m_name').value = t.name;
  document.getElementById('m_start').value = toInputDate(eff.start);
  document.getElementById('m_end').value = toInputDate(eff.end);
  document.getElementById('m_baseline').value = toInputDate(effBaseline);
  document.getElementById('m_actual').value = toInputDate(effActual);
  document.getElementById('m_progress').value = prog;
  document.getElementById('m_owner').value = t.owner;
  document.getElementById('m_milestone').value = t.milestone? '1':'0';
  document.getElementById('m_deps').value = (t.deps||[]).join(',');

  selectedColorInModal = t.color;
  renderColorPalette(t.color);

  document.getElementById('m_start').disabled = isParent;
  document.getElementById('m_end').disabled = isParent;
  document.getElementById('m_actual').disabled = isParent;
  document.getElementById('m_progress').disabled = isParent;
  document.getElementById('m_milestone').disabled = isParent;
  document.getElementById('m_reset_baseline').disabled = isParent;
  document.getElementById('m_auto_note').style.display = isParent ? 'block' : 'none';

  const parentSel = document.getElementById('m_parent');
  parentSel.innerHTML = '<option value="">— Aucune (tâche racine) —</option>' +
    tasks.filter(x=>x.id!==id && !isDescendant(x,id)).map(x=>`<option value="${x.id}" ${t.parentId===x.id?'selected':''}>${escapeHtml(x.name)}</option>`).join('');
  document.getElementById('taskModal').classList.add('open');
}

document.getElementById('m_reset_baseline').addEventListener('click', ()=>{
  const t = tasks.find(x=>x.id===selectedTaskId);
  if(hasChildren(selectedTaskId)) return;
  const endVal = document.getElementById('m_end').value;
  const newEnd = endVal ? new Date(endVal) : t.end;
  t.baselineEnd = new Date(newEnd);
  document.getElementById('m_baseline').value = toInputDate(t.baselineEnd);
  pushHistory(); render();
  showToast('Baseline réinitialisée sur la date de fin actuelle');
});

document.getElementById('m_save').addEventListener('click', ()=>{
  const t = tasks.find(x=>x.id===selectedTaskId);
  const isParent = hasChildren(selectedTaskId);
  t.name = document.getElementById('m_name').value;
  t.parentId = document.getElementById('m_parent').value ? Number(document.getElementById('m_parent').value) : null;
  t.color = selectedColorInModal;
  t.owner = document.getElementById('m_owner').value;
  t.deps = document.getElementById('m_deps').value.split(',').map(x=>Number(x.trim())).filter(Boolean).filter(x=>x!==t.id);
  if(!isParent){
    t.start = new Date(document.getElementById('m_start').value);
    t.end = new Date(document.getElementById('m_end').value);
    if(!t.baselineEnd) t.baselineEnd = new Date(t.end);
    const actualVal = document.getElementById('m_actual').value;
    t.actualEnd = actualVal ? new Date(actualVal) : null;
    t.progress = Number(document.getElementById('m_progress').value);
    t.milestone = document.getElementById('m_milestone').value==='1';
    if(t.milestone) t.end = new Date(t.start);
  }
  pushHistory(); closeModal('taskModal'); render();
});
document.getElementById('m_delete').addEventListener('click', ()=>{
  const idsToRemove = new Set([selectedTaskId]);
  let changed=true;
  while(changed){ changed=false; tasks.forEach(t=>{ if(t.parentId && idsToRemove.has(t.parentId) && !idsToRemove.has(t.id)){ idsToRemove.add(t.id); changed=true; } }); }
  tasks = tasks.filter(x=>!idsToRemove.has(x.id));
  tasks.forEach(t=>{ t.deps = (t.deps||[]).filter(d=>!idsToRemove.has(d)); });
  comments = comments.filter(c=>!idsToRemove.has(c.taskId));
  pushHistory(); closeModal('taskModal'); render();
});
document.getElementById('m_duplicate').addEventListener('click', ()=>{ closeModal('taskModal'); duplicateTask(selectedTaskId); });

function openCommentModal(taskId){
  activeTaskForComment = taskId;
  const t = tasks.find(x=>x.id===taskId);
  document.getElementById('c_title').textContent = 'Commentaires — ' + t.name;
  renderComments();
  document.getElementById('commentModal').classList.add('open');
}
function renderComments(){
  const list = comments.filter(c=>c.taskId===activeTaskForComment);
  document.getElementById('c_list').innerHTML = list.length ? list.map(c=>`
    <div class="comment-item"><div class="meta">${escapeHtml(c.author||'Anonyme')} · ${fmt(c.date)}</div><div class="txt">${escapeHtml(c.text)}</div></div>
  `).join('') : '<p style="color:var(--text-light);font-size:12.5px;">Aucun commentaire pour cette tâche.</p>';
}
document.getElementById('c_add').addEventListener('click', ()=>{
  const text = document.getElementById('c_text').value.trim();
  if(!text) return;
  comments.push({taskId:activeTaskForComment, author:document.getElementById('c_author').value||'Anonyme', date:new Date(), text});
  document.getElementById('c_text').value='';
  pushHistory(); renderComments(); render();
});

function closeModal(id){ document.getElementById(id).classList.remove('open'); }
