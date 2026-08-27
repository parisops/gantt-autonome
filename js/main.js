/* main.js — Initialisation de l'application */

loadDisplaySettings();
if(typeof applySidebarState === 'function') applySidebarState();

if(loadLocal()){
  render();
  showToast('Session précédente restaurée automatiquement');
  updateUndoRedoButtons();
}
