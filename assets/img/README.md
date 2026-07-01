# Images — La Légende

Actuellement, le site charge les **photos d'origine du client** (hébergées sur Wix)
via des URLs centralisées dans `assets/js/config.js` → objet `media`. Un repli
automatique (`onerror`) masque proprement toute image qui ne se chargerait pas —
aucune image cassée n'apparaît jamais.

## Passer aux images auto-hébergées (recommandé)

1. Exportez vos photos (JPG/WebP, largeur ≥ 1600 px pour le hero).
2. Déposez-les ici, par ex. :
   - `hero.jpg` — grande image d'ambiance (accueil / louer)
   - `pizza-legende.jpg` — pizza signature
   - `truck.jpg` — le food truck
   - `camions.jpg` — camions / événements
   - `tiramisu.jpg`
3. Dans `assets/js/config.js`, remplacez les URLs Wix de `media` par les chemins
   locaux, par ex. `hero: "assets/img/hero.jpg"`.

Astuce performance : compressez les images (TinyPNG / Squoosh) et privilégiez le
format WebP. Gardez le hero < 300 Ko si possible.

## Favicon

`favicon.svg` est fourni (part de pizza aux couleurs de la marque). Pour un
favicon PNG/ICO classique, exportez-le depuis le SVG si besoin.
