# Memo — apprentissage de vocabulaire multilingue

Spécification issue de la séance de cadrage du 19/09/2026.
Ce document fait foi : toute décision d'implémentation doit s'y référer.

## 1. Intention

Une application personnelle pour apprendre du vocabulaire dans plusieurs langues.
Deux usages, volontairement séparés :

- **La bibliothèque** — j'y verse les mots et expressions au fil de mes rencontres.
- **La séance** — l'app me présente un mot, je clique pour révéler la traduction,
  puis je déclare si je le savais. Elle décide seule quoi me montrer et quand.

La langue source est le **français**. L'interface est en français.

## 2. Décisions actées

| Sujet | Décision |
|---|---|
| Plateforme | PWA web mobile-first, React + TypeScript + Vite |
| Stockage | 100 % local (IndexedDB), aucun serveur, aucun compte |
| Algorithme | SM-2 (SuperMemo/Anki), historique complet conservé pour migrer vers FSRS plus tard |
| Sens de révision | Deux cartes par mot : reconnaissance (cible → fr) et production (fr → cible), plannings indépendants |
| Fiche mot | terme, traduction, langue — plus un champ « lecture » affiché uniquement pour ja/zh/ko |
| Écritures | latin + CJK (polices et taille adaptées). Pas de RTL. |
| Bouton « Passer » | remet la carte en fin de séance, aucun effet sur le planning ni sur les stats |
| Rythme | quotas journaliers réglables : 20 nouvelles cartes, 150 révisions |
| Alimentation | formulaire d'ajout rapide + packs de vocabulaire pré-construits + recherche dictionnaire |
| Sauvegarde | export/import JSON, avec rappel si l'export date trop |
| Bonus retenus | statistiques et série de jours, mode écriture, thème clair/sombre |
| Images | recherche Openverse ou photo de l'appareil, une par mot, au verso, hors sauvegarde |
| Import Anki | paquets `.apkg` et exports texte, planning et images repris |
| Déploiement | GitHub Pages via GitHub Actions à chaque push |

Écartés pour l'instant : phrases d'exemple, tags/thèmes, prononciation audio,
traduction automatique par API, synchronisation multi-appareils.

### Images

Une image facultative par mot, cherchée dans **Openverse** (licences libres, pas de
clé d'API, CORS ouvert — Unsplash et Pexels sont écartés car leur clé ne peut pas
être cachée dans une page statique). Elle est téléchargée, réduite à 512 px et
réencodée en WebP avant stockage, puis affichée **au verso** de la carte avec le
crédit de son auteur.

Les images ne sont **pas** incluses dans l'export JSON, par choix assumé. En
contrepartie, une restauration ne les efface pas : elles sont rangées sous
l'identifiant du mot, donc elles se rattachent d'elles-mêmes sur le même appareil,
et seules les orphelines sont écartées. Une restauration sur un autre appareil
ramène les mots sans leurs images, et l'écran de sauvegarde le dit.

## 3. Modèle de données

```ts
type LangCode = 'en' | 'es' | 'it' | 'de' | 'zh' | 'ja' | string;

interface Word {
  id: string;
  lang: LangCode;          // la langue étrangère
  term: string;            // le mot dans la langue cible
  translation: string;     // en français
  reading?: string;        // kana / pinyin / romaja — seulement pour ja, zh, ko
  source: 'manual' | `pack:${string}` | 'dict';
  createdAt: number;
}

type Direction = 'recognition' | 'production'; // cible→fr | fr→cible
type CardState = 'new' | 'learning' | 'review' | 'relearning';

interface Card {
  id: string;
  wordId: string;
  direction: Direction;
  state: CardState;
  due: number;             // timestamp
  interval: number;        // en jours
  ease: number;            // facteur de facilité SM-2, plancher 1.3
  repetitions: number;
  lapses: number;
  step: number;            // index du prochain palier d'apprentissage à appliquer
  suspended: boolean;
  lastReviewedAt?: number; // sert à calculer le temps réellement écoulé (utile à FSRS)
}

interface ReviewLog {        // append-only, jamais modifié : c'est le socle FSRS
  id: string;
  cardId: string;
  reviewedAt: number;
  grade: 'known' | 'unknown'; // « passer » n'écrit rien
  mode: 'reveal' | 'typing';
  intervalBefore: number; intervalAfter: number;
  easeBefore: number;      easeAfter: number;
  elapsedDays: number;
}
```

Ajouter un mot crée **deux** cartes. Supprimer un mot supprime ses cartes ;
les `ReviewLog` sont conservés (anonymisés par `cardId`) pour ne pas trouer les stats.

## 4. Ordonnancement (SM-2)

**Paliers d'apprentissage** d'une carte neuve : 1 min, puis 10 min, dans la séance.
Diplômée à 1 jour.

**« Je savais »**
- carte en apprentissage : passe au palier suivant, puis sort à 1 jour ;
- carte en révision : `repetitions++` ; intervalle = 1 j (1ʳᵉ), 6 j (2ᵉ), puis `intervalle × ease` ;
  `ease` inchangé (équivaut à la note 4 de SM-2).

**« Je ne savais pas »**
- `lapses++`, `ease -= 0.20` (plancher 1.3), retour au premier palier,
  prochaine échéance à 1 jour, état `relearning`. La carte est **revue dans la séance**.

**« Passer »**
- aucune écriture, aucune conséquence. La carte est remise en fin de file,
  au plus une fois par séance.

**Fuzz** : ±5 % sur tout intervalle ≥ 2 jours, pour éviter que les cartes ajoutées
le même jour ne reviennent toutes ensemble à vie.

**Composition d'une séance** : d'abord les cartes en retard, puis les cartes dues du jour,
puis les nouvelles dans la limite du quota. Mélange des nouvelles parmi les révisions
plutôt qu'en bloc. Les deux cartes d'un même mot ne se suivent jamais.

Ces règles sont implémentées dans un module pur, sans dépendance au stockage ni à React,
et **couvertes par des tests unitaires** (c'est le cœur du produit : il doit être vérifiable).

## 5. Banques de vocabulaire

Sources retenues, toutes ouvertes et vérifiées accessibles :

| Source | Contenu | Licence |
|---|---|---|
| [FreeDict](https://github.com/freedict/fd-dictionaries) | `fra-eng` (8 505 entrées), `jpn-fra`, `fra-nld`, `fra-bre` — TEI XML | GPL v2+ |
| [jmdict-simplified](https://github.com/scriptin/jmdict-simplified) | JMdict JSON, gloses françaises, lectures kana | CC BY-SA 4.0 (EDRDG) |
| [open-dsl-dict](https://github.com/open-dsl-dict/wiktionary-dict) | dictionnaires Wiktionary bilingues (fr↔en, en↔es/it/de/zh…) | CC BY-SA 3.0 + GFDL |
| [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) | chinois↔anglais avec pinyin | CC BY-SA 4.0 |
| [FrequencyWords](https://github.com/hermitdave/FrequencyWords) | fréquences OpenSubtitles (fr, en, es, it, de…) | CC BY-SA 4.0 |
| [Tatoeba](https://tatoeba.org/en/downloads) | phrases d'exemple bilingues (réserve pour plus tard) | CC BY 2.0 FR |

Écarté : les decks partagés d'AnkiWeb — pas de licence uniforme, beaucoup de contenu
sous copyright, inutilisable dans un dépôt public.

**Méthode.** Un script hors-ligne (`scripts/build-packs.ts`) croise dictionnaire et liste
de fréquence, puis produit des packs JSON versionnés et légers, du type
« Anglais — les 1 000 mots les plus fréquents ». La fréquence sert à **ordonner**
l'apprentissage : les mots utiles d'abord, au lieu d'un dictionnaire dans l'ordre alphabétique.
Chaque pack embarque sa provenance et sa licence ; `docs/ATTRIBUTIONS.md` les récapitule.

Ordre de production : **anglais** (données les plus propres), puis **espagnol / italien /
allemand** (via Wiktionary), puis **chinois** (CC-CEDICT est glosé en anglais : les
traductions françaises devront être relues avant publication — je ne livrerai pas un pack
dont je ne peux pas garantir la qualité sans te le dire).

L'app propose en plus une **recherche dans le dictionnaire** pour pré-remplir un ajout
manuel : je tape un mot, l'app suggère des traductions, je choisis. Le dictionnaire de
recherche est chargé à la demande, pas au démarrage.

## 6. Écrans

1. **Accueil** — cartes dues aujourd'hui, série en cours, bouton « Réviser ».
2. **Séance** — le mot, clic pour révéler, trois boutons. Mode écriture en option.
3. **Bibliothèque** — recherche et filtre par langue, édition, suppression, suspension.
4. **Ajouter** — formulaire court, le focus revient au premier champ pour enchaîner.
5. **Packs** — catalogue, aperçu, import dans la bibliothèque.
6. **Statistiques** — mots appris, taux de réussite, série, prévision des révisions à venir.
7. **Réglages** — quotas, thème, export/import JSON.

## 7. Jalons

- **Jalon 1 — le cœur utilisable. ✅ livré.** Projet Vite/React/TS, IndexedDB, bibliothèque,
  ajout rapide, séance SM-2 complète avec les trois boutons et les quotas, thème
  clair/sombre, PWA installable, déploiement GitHub Pages, tests de l'algorithme.
- **Jalon 2 — filet et motivation. ✅ livré.** Export/import JSON et rappel de sauvegarde,
  statistiques et série, mode écriture.
- **Jalon 3 — les packs.** Script de génération, écran Packs, pack anglais puis
  espagnol/italien/allemand puis chinois.
- **Jalon 4 — la recherche dictionnaire** intégrée au formulaire d'ajout.

### Photo de l'appareil

À côté de la recherche Openverse, un bouton **Photo** ouvre le sélecteur natif.
L'attribut `capture` est volontairement omis : le téléphone propose alors l'appareil
photo *et* la galerie, là où `capture` imposerait la prise de vue et interdirait de
reprendre une photo existante.

L'orientation EXIF est appliquée au décodage (`imageOrientation: 'from-image'`) :
sans cela, une photo prise en portrait serait stockée couchée. Le fichier est
contrôlé avant décodage — type et taille — car une photo brute peut dépasser ce que
l'onglet sait traiter, et un format que le navigateur ne lit pas doit être refusé
avec un motif plutôt qu'échouer en silence.

### Import Anki

Deux entrées : le **paquet `.apkg`** (archive ZIP contenant une base SQLite et les
médias) et l'**export texte** d'Anki. Les deux formats de paquet sont gérés :
l'ancien (SQLite en clair, index média JSON) et le récent (SQLite et médias
compressés en zstd, index média en protobuf).

Le moteur SQLite (658 Ko) n'est chargé qu'au moment d'un import, exclu du
pré-cache du service worker puis mis en cache au premier usage : l'installation
reste à 388 Ko.

Conversion du planning Anki vers SM-2 : l'intervalle est repris tel quel, la
facilité passe des millièmes d'Anki à notre échelle avec le plancher à 1,3, et
l'échéance est recalculée depuis la date de création de la collection. Les cartes
d'Anki correspondent à nos deux sens dans leur ordre : la première à la
reconnaissance, la seconde à la production. **Les cartes encore en apprentissage
repartent à neuf** — leur état interne n'a pas d'équivalent ici, et elles sont de
toute façon à revoir immédiatement.

Ce qui est écarté est compté et annoncé : notes vides, notes à trous (elles ne se
ramènent pas à un couple mot/traduction) et doublons. Un seul type de note est
importé à la fois, pour que la correspondance des champs reste explicite.

### Réserve sur les images

L'appel réel à Openverse n'a **pas** pu être vérifié : le réseau de l'environnement
de développement bloque ce domaine. Tout le reste de la chaîne est testé contre une
banque simulée — filtrage des résultats incomplets, téléchargement, réduction,
stockage, affichage, crédits, messages d'erreur et limite de débit. Si l'API refuse
les appels anonymes, seule la recherche est en cause : le reste fonctionne, et un
import de fichier local serait le repli naturel.

### Décisions prises en cours de route

- La restauration d'une sauvegarde **remplace** tout le contenu, elle ne fusionne pas :
  fusionner deux plannings de révision sans règle claire produirait des doublons et
  des échéances incohérentes. Une fusion pourra être ajoutée, mais comme une
  fonctionnalité à part entière.
- Les couleurs des graphiques sont validées séparément pour chaque fond
  (`#5b5bd6` en clair, `#8383ea` en sombre) : la nuance d'interface du mode sombre
  sortait de la bande de luminosité lisible sur fond foncé.
- La série de jours ne se casse pas tant que la journée en cours n'est pas entamée,
  sinon elle tomberait à zéro chaque matin.

## 8. Hypothèses à corriger si besoin

- L'interface est en français et la langue source est toujours le français.
- Le pack chinois exige une relecture des traductions (gloses d'origine en anglais).
- Le mode écriture est un réglage désactivé par défaut, basculable depuis l'accueil
  juste avant de lancer une séance comme depuis les réglages.
- Les quotas sont globaux, pas par langue.
