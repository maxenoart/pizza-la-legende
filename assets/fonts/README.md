# Polices — Messina Sans & Calm Serif

Le design system utilise **Messina Sans** (texte) et **Calm Serif** (accents /
titres). Ce sont des polices sous licence : leurs fichiers ne sont pas inclus.

Tant qu'elles sont absentes, le site utilise automatiquement un repli soigné via
Google Fonts (**Manrope** pour le sans, **Fraunces** pour le serif) — le rendu
reste propre et cohérent.

## Ajouter les polices sous licence

1. Déposez ici les fichiers `.woff2`, nommés exactement :
   - `MessinaSans-Regular.woff2`
   - `MessinaSans-SemiBold.woff2`
   - `MessinaSans-Bold.woff2`
   - `CalmSerif-Regular.woff2`
   - `CalmSerif-Medium.woff2`
2. C'est tout : `assets/css/site.css` déclare déjà les `@font-face` correspondants
   et Messina/Calm prennent automatiquement le dessus sur le repli.

> Vérifiez que votre licence autorise l'hébergement web (webfont).
