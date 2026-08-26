# Gantt Autonome

Application HTML autonome de suivi de projet en mode Gantt, inspirée des outils type Monday, mais **sans backend, sans compte et sans abonnement**. Toutes les données sont stockées dans un simple fichier Excel (`.xlsx`) que chacun peut importer, éditer dans l'app, puis réexporter.

👉 Démo en ligne : `https://parisops.github.io/gantt-autonome/` (une fois GitHub Pages activé sur ce repo, branche `main`, dossier racine).

## Fonctionnalités

- Timeline visuelle moderne (zoom jour / semaine / mois), avec ligne "aujourd'hui"
- Hiérarchie de tâches pliable/dépliable, avec avancement calculé automatiquement pour les tâches parentes
- Édition inline, glisser-déposer et redimensionnement des barres directement sur la timeline
- Jalons (losanges) et dépendances entre tâches (flèches)
- Commentaires par tâche
- Recherche et filtres (statut, responsable)
- Annuler / rétablir (Ctrl+Z / Ctrl+Y), sauvegarde automatique locale (navigateur)
- Import / export Excel, avec modèle vierge téléchargeable
- Vue impression / export PDF via le navigateur
- Colonne de tâches redimensionnable, figée pendant le défilement horizontal de la timeline

## Structure du projet

```
index.html        Squelette de la page
style.css          Toute l'apparence visuelle
js/data.js         Modèle de données, historique (undo/redo), sauvegarde locale
js/excel-io.js     Import / export Excel, modèle vierge
js/render.js       Construction du DOM (arborescence + timeline)
js/interactions.js Boutons, filtres, drag & drop, redimensionnement des barres
js/modals.js       Modales d'édition de tâche et de commentaires
js/main.js         Point d'entrée / initialisation
```

Ce découpage limite les régressions : une demande d'évolution touche en général un seul fichier, sans risque d'impacter les autres.

## Format du fichier Excel

**Onglet `Taches`** : `ID`, `ParentID`, `Nom`, `DateDebut`, `DateFin`, `Avancement`, `Responsable`, `Couleur`, `Jalon` (0/1), `Predecesseurs` (IDs séparés par virgule)

**Onglet `Commentaires`** : `ID_Tache`, `Auteur`, `Date`, `Commentaire`

## Utilisation

1. Ouvrir `index.html` dans un navigateur (ou l'URL GitHub Pages ci-dessus).
2. Importer un fichier Excel existant, télécharger le modèle vierge, ou créer une nouvelle tâche.
3. Éditer directement dans l'interface (double-clic sur une tâche, glisser les barres, ajouter des commentaires).
4. Exporter en Excel pour sauvegarder ou partager l'état du projet.

## Déploiement

Ce projet est 100% statique : aucun build, aucune dépendance serveur. Pour l'héberger :
- **GitHub Pages** : Settings → Pages → Deploy from branch → `main` / `/ (root)`.
- Ou glisser le dossier sur n'importe quel hébergeur statique (Netlify, Vercel, etc.).
