/* modals.js — Modales d'edition de tache et de commentaires, impression */

document.getElementById('btnPrint').addEventListener('click', ()=>window.print());

function openTaskModal(id){
  selectedTaskId = id;
  const t = tasks.find(x=>x.id===id);
  document.getElementById('m_title').textContent = 'Éditer : ' + t.name;
  document.getElementById('m_name').value = t.name;
  document.getElementById('m_start').value = toInputDate(t.start);
  document.getElementById('m_end').value = toInputDate(t.end);
  document.getElementById('m_progress').value = t.progress;
  document.getElementById('m_owner').value = t.owner;
  document.getElementById('m_color').value = t.color;
  document.getElementById('m_milestone').value = t.milestone? '1':'0';
  document.getElementById('m_deps').value = (t.deps||[]).join(',');
  const parentSel = document.getElementById('m_parent');
  parentSel.innerHTML = '<option value="">— Aucune (tâche racine) —</option>' +
    tasks.filter(x=>x.id!==id && !isDescendant(x,id)).map(x=>`<option value="${x.id}" ${t.parentId===x.id?'selected':''}>${escapeHtml(x.name)}</option>`).join('');
  document.getElementById('taskModal').classList.add('open');
}
document.getElementById('m_save').addEventListener('click', ()=>{
  const t = tasks.find(x=>x.id===selectedTaskId);
  t.name = document.getElementById('m_name').value;
  t.parentId = document.getElementById('m_parent').value ? Number(document.getElementById('m_parent').value) : null;
  t.start = new Date(document.getElementById('m_start').value);
  t.end = new Date(document.getElementById('m_end').value);
  t.progress = Number(document.getElementById('m_progress').value);
  t.owner = document.getElementById('m_owner').value;
  t.color = document.getElementById('m_color').value;
  t.milestone = document.getElementById('m_milestone').value==='1';
  if(t.milestone) t.end = new Date(t.start);
  t.deps = document.getElementById('m_deps').value.split(',').map(x=>Number(x.trim())).filter(Boolean).filter(x=>x!==t.id);
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
  `).join('') : '<p style="color:var(--text-light);font-size:13px;">Aucun commentaire pour cette tâche.</p>';
}
document.getElementById('c_add').addEventListener('click', ()=>{
  const text = document.getElementById('c_text').value.trim();
  if(!text) return;
  comments.push({taskId:activeTaskForComment, author:document.getElementById('c_author').value||'Anonyme', date:new Date(), text});
  document.getElementById('c_text').value='';
  pushHistory(); renderComments(); render();
});

function closeModal(id){ document.getElementById(id).classList.remove('open'); }
