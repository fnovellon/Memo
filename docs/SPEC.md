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
| Déploiement | GitHub Pages via GitHub Actions à chaque push |

Écartés pour l'instant : phrases d'exemple, tags/thèmes, prononciation audio,
traduction automatique par API, synchronisation multi-appareils.

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
- **Jalon 2 — filet et motivation.** Export/import JSON et rappel de sauvegarde,
  statistiques et série, mode écriture.
- **Jalon 3 — les packs.** Script de génération, écran Packs, pack anglais puis
  espagnol/italien/allemand puis chinois.
- **Jalon 4 — la recherche dictionnaire** intégrée au formulaire d'ajout.

## 8. Hypothèses à corriger si besoin

- L'interface est en français et la langue source est toujours le français.
- Le pack chinois exige une relecture des traductions (gloses d'origine en anglais).
- Le mode écriture est une option activable par séance, pas le comportement par défaut.
- Les quotas sont globaux, pas par langue.
