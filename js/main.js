/* main.js — Initialisation de l'application */

if(loadLocal()){
  render();
  showToast('Session précédente restaurée automatiquement');
  updateUndoRedoButtons();
}
