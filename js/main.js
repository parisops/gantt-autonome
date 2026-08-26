/* main.js — Initialisation de l'application */

loadDisplaySettings();

if(loadLocal()){
  render();
  showToast('Session précédente restaurée automatiquement');
  updateUndoRedoButtons();
}
