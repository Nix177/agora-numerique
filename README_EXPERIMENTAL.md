# 🧪 Guide des Nouveautés (Branche Experimental)

Ce fichier récapitule les nouvelles fonctionnalités ajoutées pour dynamiser l'expérience en classe.

## 1. 🎵 Musique d'Ambiance

Le moteur supporte désormais la musique de fond qui boucle automatiquement.

### Comment l'utiliser ?
1.  **Déposez vos fichiers MP3** dans les dossiers créés à cet effet :
    *   `scenarios/shogun/assets/audio/`
    *   `scenarios/eoliennes/assets/audio/`
2.  **Assignez la musique** dans le fichier `scenario.json` de chaque scénario. Ajoutez la propriété `"music"` à n'importe quelle scène :

```json
"intro_guerre": {
  "id": "intro_guerre",
  "type": "story",
  "background": "assets/bg_guerre.png",
  "music": "assets/audio/theme_bataille.mp3",  <-- AJOUTEZ CECI
  "content": { ... }
}
```
*Si une scène n'a pas de propriété `music`, la musique précédente continue.*

## 2. ⏳ Minuteur "Sablier" (Pour le Prof)

Un outil visuel pour gérer le temps de débat sans stress.

### Comment l'utiliser ?
*   Dans l'interface principale (pendant le jeu), regardez le **Panneau Professeur** (souvent en bas ou à droite).
*   Cliquez sur les icônes :
    *   **⏳1** : Lance un décompte de 1 minute.
    *   **⏳2** : Lance un décompte de 2 minutes.
    *   **⏳5** : Lance un décompte de 5 minutes.
    *   **🛑** : Arrête le minuteur.
*   **Effet** : Une barre/sablier apparaît en haut de l'écran pour tous. À la fin, un son de Gong retentit (si `assets/sfx_gong.mp3` existe) et le timer clignote en rouge.

## 3. 🃏 Cartes Factions (À Imprimer)

Des fiches rôles prêtes à l'emploi pour distribuer aux élèves.

### Comment l'utiliser ?
Ouvrez simplement ces fichiers dans votre navigateur (double-clic) :
*   `scenarios/shogun/cards.html` (Style Japonais)
*   `scenarios/eoliennes/cards.html` (Style Moderne)

Cliquez sur le bouton **"🖨 Imprimer"** en haut de la page.
*   *Astuce* : Dans les réglages d'impression, cochez **"Imprimer les arrière-plans"** (Background graphics) pour avoir les couleurs et textures.
