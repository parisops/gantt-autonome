/* excel-io.js — Import / export Excel, modele vierge, glisser-deposer */

document.getElementById('fileInput').addEventListener('change', e=>{ if(e.target.files[0]) loadFile(e.target.files[0]); });

function setupDropZone(){
  const dropZone = document.getElementById('dropZone');
  if(!dropZone) return;
  dropZone.addEventListener('dragover', e=>{e.preventDefault(); dropZone.classList.add('drag');});
  dropZone.addEventListener('dragleave', ()=>dropZone.classList.remove('drag'));
  dropZone.addEventListener('drop', e=>{ e.preventDefault(); dropZone.classList.remove('drag'); if(e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
}
setupDropZone();

function loadFile(file){
  const reader = new FileReader();
  reader.onload = ev=>{
    const wb = XLSX.read(ev.target.result, {type:'binary', cellDates:true});
    const shTasks = wb.Sheets['Taches'];
    const shComments = wb.Sheets['Commentaires'];
    tasks = []; comments = []; nextId = 1;
    if(shTasks){
      XLSX.utils.sheet_to_json(shTasks, {defval:''}).forEach(r=>{
        const id = Number(r.ID) || uid();
        nextId = Math.max(nextId, id+1);
        tasks.push({
          id, parentId: r.ParentID ? Number(r.ParentID) : null,
          name: r.Nom || 'Sans titre', start: toDate(r.DateDebut), end: toDate(r.DateFin),
          progress: Number(r.Avancement)||0, owner: r.Responsable || '', color: r.Couleur || '#579bfc',
          milestone: r.Jalon==1||r.Jalon==='1'||r.Jalon===true, deps: r.Predecesseurs? String(r.Predecesseurs).split(',').map(x=>Number(x.trim())).filter(Boolean):[]
        });
      });
    }
    if(shComments){
      XLSX.utils.sheet_to_json(shComments, {defval:''}).forEach(r=>{
        comments.push({ taskId: Number(r.ID_Tache), author: r.Auteur||'', date: toDate(r.Date)||new Date(), text: r.Commentaire||'' });
      });
    }
    history=[]; historyIndex=-1; pushHistory();
    render();
    showToast('Fichier importé avec succès');
  };
  reader.readAsBinaryString(file);
}

document.getElementById('btnTemplate').addEventListener('click', ()=>{
  const wb = XLSX.utils.book_new();
  const wsT = XLSX.utils.json_to_sheet([
    {ID:1, ParentID:'', Nom:'Phase 1 - Cadrage', DateDebut:new Date(), DateFin:addDays(new Date(),5), Avancement:20, Responsable:'Alex', Couleur:'#579bfc', Jalon:0, Predecesseurs:''},
    {ID:2, ParentID:1, Nom:'Rédaction du cahier des charges', DateDebut:new Date(), DateFin:addDays(new Date(),3), Avancement:50, Responsable:'Alex', Couleur:'#00c875', Jalon:0, Predecesseurs:''},
    {ID:3, ParentID:1, Nom:'Validation', DateDebut:addDays(new Date(),3), DateFin:addDays(new Date(),3), Avancement:0, Responsable:'Alex', Couleur:'#fdab3d', Jalon:1, Predecesseurs:'2'}
  ]);
  const wsC = XLSX.utils.json_to_sheet([{ID_Tache:2, Auteur:'Alex', Date:new Date(), Commentaire:'Premier jet envoyé pour relecture.'}]);
  XLSX.utils.book_append_sheet(wb, wsT, 'Taches');
  XLSX.utils.book_append_sheet(wb, wsC, 'Commentaires');
  XLSX.writeFile(wb, 'modele_gantt.xlsx');
});

document.getElementById('btnExport').addEventListener('click', ()=>{
  const wb = XLSX.utils.book_new();
  const tRows = tasks.map(t=>({ID:t.id, ParentID:t.parentId||'', Nom:t.name, DateDebut:t.start, DateFin:t.end, Avancement:t.progress, Responsable:t.owner, Statut:computeStatus(t), Couleur:t.color, Jalon:t.milestone?1:0, Predecesseurs:(t.deps||[]).join(',')}));
  const cRows = comments.map(c=>({ID_Tache:c.taskId, Auteur:c.author, Date:c.date, Commentaire:c.text}));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tRows), 'Taches');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cRows), 'Commentaires');
  XLSX.writeFile(wb, 'suivi_gantt_'+new Date().toISOString().slice(0,10)+'.xlsx');
  showToast('Excel exporté');
});
