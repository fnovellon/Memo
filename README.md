# Memo

Apprentissage de vocabulaire multilingue par répétition espacée. Application web
personnelle, installable sur téléphone, qui fonctionne hors-ligne et ne dépend
d'aucun serveur : mots et progression vivent dans le navigateur.

La spécification complète est dans [`docs/SPEC.md`](docs/SPEC.md).

## Comment ça marche

Chaque mot ajouté produit **deux cartes** au planning indépendant — une pour le
reconnaître (langue étrangère → français), une pour le produire (français → langue
étrangère). En séance, la carte se dévoile au clic et trois réponses sont possibles :

| Réponse | Effet |
|---|---|
| Je me suis rappelé | la carte avance : 1 j, puis 6 j, puis × facteur de facilité |
| Je ne savais pas | facilité −0,20, retour au premier palier, la carte revient dans la séance |
| Passer | rien n'est écrit : ni planning, ni statistiques |

L'ordonnancement suit **SM-2**, l'algorithme de SuperMemo repris par Anki. L'historique
complet des révisions est conservé pour permettre une bascule vers FSRS sans perte.

En option, le **mode écriture** demande de taper la réponse avant de la révéler : toute
variante listée dans la traduction est acceptée, et une faute d'accent est signalée
comme telle plutôt que comptée fausse.

## Images

Chaque mot peut porter une image, cherchée dans [Openverse](https://openverse.org)
(licences libres, sans clé d'API). Elle est réduite à 512 px et réencodée en WebP
avant d'être stockée localement — une photo de banque passe ainsi de plusieurs
mégaoctets à quelques kilo-octets. Elle apparaît au verso de la carte, avec le nom
de son auteur et sa licence.

## Sauvegarde

Les données ne vivent que dans le navigateur. Les réglages permettent d'exporter toute
la bibliothèque et sa progression dans un fichier JSON, et de la restaurer — la
restauration remplace le contenu existant, elle ne fusionne pas. Les images en sont
exclues pour garder le fichier léger ; elles survivent malgré tout à une restauration
sur le même appareil, étant rangées sous l'identifiant de leur mot. Passé dix mots, l'accueil
rappelle qu'une sauvegarde est nécessaire si le dernier export date de plus de deux semaines.

## Développement

```bash
npm install
npm run dev        # serveur de développement
npm test           # tests de l'ordonnancement et de la composition des séances
npm run build      # build de production
npm run preview    # sert le build
```

Les icônes PWA sont générées sans dépendance externe : `node scripts/generate-icons.mjs`.

## Version

Un bandeau présent sur tous les écrans affiche la version de l'application suivie du
commit qui l'a produite (`0.2.0 · 50f06aa`), injectés au build depuis `package.json`
et depuis git —
`GITHUB_SHA` dans une action, `git rev-parse` en local. On sait ainsi exactement ce
qui tourne dans le navigateur. Chaque sauvegarde exportée porte la même version.

## Déploiement

Chaque push sur `main` déclenche le workflow [`deploy.yml`](.github/workflows/deploy.yml) :
vérification des types, tests, build, publication sur GitHub Pages. Le `base` de Vite est
`/Memo/` et le routage passe par le fragment d'URL, ce qui rend les liens profonds
robustes sur Pages.

Pour activer la publication la première fois : **Settings → Pages → Source : GitHub Actions**.

## Structure

```
src/domain/     règles pures : types, ordonnancement SM-2, composition des séances (testé)
src/data/       persistance IndexedDB
src/app/        coquille React, contexte applicatif, thème
src/components/ graphiques
src/pages/      accueil, séance, bibliothèque, ajout, statistiques, réglages
```

Le dossier `src/domain` ne dépend ni de React ni du stockage : c'est le cœur du produit,
et il doit rester vérifiable en isolation.
