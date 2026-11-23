# Minuteur

Minuteur Windows (Tauri 2, HTML/CSS/JS vanilla), style verre dépoli noir et blanc.

## Fiche projet
- **Stack** : Tauri 2 + HTML/CSS/JS vanilla (`src/`), Rust minimal (`src-tauri/src/main.rs`)
- **Identifiant** : `fr.minuteur.app` (ne pas changer, sinon Windows le voit comme une autre app)
- **Workflow** : `.github/workflows/build-windows.yml` → Release `v<version>` avec l'installeur `Minuteur_<version>_x64-setup.exe` (lien direct), + artifact
- **Signature** : aucune (pas de certificat Authenticode) → avertissement SmartScreen à l'installation
- **Version** : `version` dans `package.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json` (semver, à incrémenter ensemble)
- **Données** : `localStorage` de la WebView2 (clé `minuteur.v1`)

## Raccourcis
- Molette sur heures / minutes / secondes, ou chiffres au clavier pour régler
- Espace / Entrée : démarrer, pause, reprendre — Échap : annuler
- Double-clic sur une durée prédéfinie : lancer directement
