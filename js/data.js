/* data.js — Etat global, modele de donnees, historique (undo/redo), sauvegarde locale */

let tasks = [];
let comments = [];
let nextId = 1;
let zoom = 'week';
let selectedTaskId = null;
let activeTaskForComment = null;
let collapsed = new Set();
let filterText = '';
let filterStatus = '';
let filterOwner = '';
let history = [];
let historyIndex = -1;
let suppressHistory = false;
let leftPanelWidth = 380;
let selectedColorInModal = '#579bfc';

let hideWeekends = false;
let hideTreeNames = false;
let hideBarLabels = false;
let showCriticalPath = false;

const AVATAR_COLORS = ['#579bfc','#00c875','#fdab3d','#e2445c','#a25ddc','#037f4c','#ff642e','#0086c0'];
const STATUS_COLORS = {'À venir':'#c4c4c4','En cours':'#579bfc','Terminé':'#00c875','En retard':'#e2445c'};
const COLOR_PALETTE = ['#579bfc','#00c875','#fdab3d','#e2445c','#a25ddc','#037f4c','#0086c0','#ff642e','#66ccff','#bb3354','#7f5347','#808080'];

function uid(){ return nextId++; }

function toDate(v){
  if(!v) return null;
  if(v instanceof Date) return v;
  if(typeof v === 'number'){ const d = XLSX.SSF.parse_date_code(v); return new Date(d.y, d.m-1, d.d); }
  const parts = String(v).split(/[\/\-]/);
  if(parts.length===3){
    if(parts[0].length===4) return new Date(+parts[0], +parts[1]-1, +parts[2]);
    return new Date(+parts[2], +parts[1]-1, +parts[0]);
  }
  const d = new Date(v); return isNaN(d) ? null : d;
}
function fmt(d){ if(!d) return ''; return d.toLocaleDateString('fr-FR'); }
function toInputDate(d){ if(!d) return ''; return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
function dayDiff(a,b){ return Math.round((b-a)/86400000); }
function addDays(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function showToast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
function levelClass(lvl){ return lvl===0?'lvl-0': lvl===1?'lvl-1': lvl===2?'lvl-2':'lvl-3plus'; }

/* Choisit une couleur de texte (blanc ou sombre) selon la luminosite du fond, pour garantir un contraste suffisant quelle que soit la couleur choisie */
function getContrastTextColor(hex){
  if(!hex) return '#ffffff';
  let h = hex.replace('#','');
  if(h.length===3) h = h.split('').map(c=>c+c).join('');
  if(h.length!==6) return '#ffffff';
  const r = parseInt(h.substr(0,2),16)/255;
  const g = parseInt(h.substr(2,2),16)/255;
  const b = parseInt(h.substr(4,2),16)/255;
  const lin = c => c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4);
  const L = 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
  return L > 0.52 ? '#1c1e22' : '#ffffff';
}

function computeStatus(t){
  if(t.progress>=100) return 'Terminé';
  const today = new Date(); today.setHours(0,0,0,0);
  if(t.end && today>t.end) return 'En retard';
  if(t.start && today>=t.start) return 'En cours';
  return 'À venir';
}
function ownerColor(name){
  if(!name) return '#c4c4c4';
  let h=0; for(let i=0;i<name.length;i++) h = name.charCodeAt(i)+((h<<5)-h);
  return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length];
}
function initials(name){
  if(!name) return '?';
  return name.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
}

/* ---------- HIERARCHIE : taches parentes = agregat des enfants ---------- */
function hasChildren(id){ return tasks.some(t=>t.parentId===id); }

function getEffectiveRange(id){
  const children = tasks.filter(t=>t.parentId===id);
  if(!children.length){
    const t = tasks.find(x=>x.id===id);
    return { start: t ? t.start : null, end: t ? t.end : null };
  }
  let mins=[], maxs=[];
  children.forEach(c=>{
    const r = getEffectiveRange(c.id);
    if(r.start) mins.push(r.start.getTime());
    if(r.end) maxs.push(r.end.getTime());
  });
  return {
    start: mins.length ? new Date(Math.min(...mins)) : null,
    end: maxs.length ? new Date(Math.max(...maxs)) : null
  };
}

function getEffectiveDateField(id, field){
  const children = tasks.filter(t=>t.parentId===id);
  if(!children.length){
    const t = tasks.find(x=>x.id===id);
    return t ? t[field] : null;
  }
  const vals = children.map(c=>getEffectiveDateField(c.id, field)).filter(Boolean).map(d=>d.getTime());
  return vals.length ? new Date(Math.max(...vals)) : null;
}

function displayProgressFlat(id){
  const children = tasks.filter(t=>t.parentId===id);
  if(!children.length){
    const t = tasks.find(x=>x.id===id);
    return t ? t.progress : 0;
  }
  const vals = children.map(c=>displayProgressFlat(c.id));
  return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
}

/* ---------- HISTORIQUE (Undo/Redo) ---------- */
function serialize(){
  return JSON.stringify({
    tasks: tasks.map(t=>({...t,
      start:t.start?t.start.getTime():null,
      end:t.end?t.end.getTime():null,
      baselineEnd:t.baselineEnd?t.baselineEnd.getTime():null,
      actualEnd:t.actualEnd?t.actualEnd.getTime():null
    })),
    comments: comments.map(c=>({...c, date:c.date?c.date.getTime():null})),
    nextId
  });
}
function deserialize(str){
  const d = JSON.parse(str);
  tasks = d.tasks.map(t=>({...t,
    start:t.start?new Date(t.start):null,
    end:t.end?new Date(t.end):null,
    baselineEnd:t.baselineEnd?new Date(t.baselineEnd):null,
    actualEnd:t.actualEnd?new Date(t.actualEnd):null
  }));
  comments = d.comments.map(c=>({...c, date:c.date?new Date(c.date):null}));
  nextId = d.nextId;
}
function pushHistory(){
  if(suppressHistory) return;
  history = history.slice(0, historyIndex+1);
  history.push(serialize());
  if(history.length>60) history.shift();
  historyIndex = history.length-1;
  saveLocal();
  updateUndoRedoButtons();
}
function undo(){
  if(historyIndex<=0) return;
  historyIndex--;
  suppressHistory = true;
  deserialize(history[historyIndex]);
  suppressHistory = false;
  render(); saveLocal(); updateUndoRedoButtons();
}
function redo(){
  if(historyIndex>=history.length-1) return;
  historyIndex++;
  suppressHistory = true;
  deserialize(history[historyIndex]);
  suppressHistory = false;
  render(); saveLocal(); updateUndoRedoButtons();
}
function updateUndoRedoButtons(){
  document.getElementById('btnUndo').disabled = historyIndex<=0;
  document.getElementById('btnRedo').disabled = historyIndex>=history.length-1;
}
document.getElementById('btnUndo').addEventListener('click', undo);
document.getElementById('btnRedo').addEventListener('click', redo);
document.addEventListener('keydown', e=>{
  if((e.ctrlKey||e.metaKey) && e.key==='z' && !e.shiftKey){ e.preventDefault(); undo(); }
  if((e.ctrlKey||e.metaKey) && (e.key==='y' || (e.key==='z'&&e.shiftKey))){ e.preventDefault(); redo(); }
});

/* ---------- SAUVEGARDE LOCALE (donnees + preferences d'affichage) ---------- */
function saveLocal(){ try{ localStorage.setItem('ganttAppData', serialize()); }catch(e){} }
function loadLocal(){
  const raw = localStorage.getItem('ganttAppData');
  if(raw){
    try{ deserialize(raw); history=[raw]; historyIndex=0; return true; }catch(e){ return false; }
  }
  return false;
}
function saveDisplaySettings(){ try{ localStorage.setItem('ganttDisplaySettings', JSON.stringify({hideWeekends, hideTreeNames, hideBarLabels, showCriticalPath})); }catch(e){} }
function loadDisplaySettings(){
  try{
    const raw = localStorage.getItem('ganttDisplaySettings');
    if(!raw) return;
    const d = JSON.parse(raw);
    hideWeekends = !!d.hideWeekends;
    hideTreeNames = !!d.hideTreeNames;
    hideBarLabels = !!d.hideBarLabels;
    showCriticalPath = !!d.showCriticalPath;
  }catch(e){}
}

/* ---------- ARBRE / FILTRES ---------- */
function buildTree(){
  const byId = {}; tasks.forEach(t=> byId[t.id]=Object.assign({children:[], level:0}, t));
  const roots = [];
  tasks.forEach(t=>{
    if(t.parentId && byId[t.parentId]) byId[t.parentId].children.push(byId[t.id]);
    else roots.push(byId[t.id]);
  });
  function setLevel(node, lvl){ node.level=lvl; node.children.forEach(c=>setLevel(c, lvl+1)); }
  roots.forEach(r=>setLevel(r,0));
  return roots;
}
function matchesFilter(node){
  const eff = getEffectiveRange(node.id);
  const status = computeStatus({start:eff.start, end:eff.end, progress: hasChildren(node.id)?displayProgressFlat(node.id):node.progress});
  const textOk = !filterText || node.name.toLowerCase().includes(filterText) || (node.owner||'').toLowerCase().includes(filterText);
  const statusOk = !filterStatus || status===filterStatus;
  const ownerOk = !filterOwner || node.owner===filterOwner;
  return textOk && statusOk && ownerOk;
}
function subtreeMatches(node){
  if(matchesFilter(node)) return true;
  return (node.children||[]).some(subtreeMatches);
}
function isDescendant(node, ancestorId){
  let p = node.parentId;
  const visited = new Set();
  while(p){ if(p===ancestorId) return true; if(visited.has(p)) break; visited.add(p); const parent=tasks.find(x=>x.id===p); p = parent? parent.parentId: null; }
  return false;
}
