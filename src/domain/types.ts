/** Code ISO 639-1 de la langue étrangère. Le français est toujours la langue source. */
export type LangCode = string;

export interface Word {
  id: string;
  lang: LangCode;
  /** Le mot ou l'expression dans la langue étrangère. */
  term: string;
  /** Sa traduction en français. */
  translation: string;
  /** Kana, pinyin ou romaja — renseigné seulement pour les écritures non latines. */
  reading?: string;
  source: 'manual' | `pack:${string}` | 'dict';
  createdAt: number;
}

/** `recognition` : cible → français. `production` : français → cible. */
export type Direction = 'recognition' | 'production';

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export interface Card {
  id: string;
  wordId: string;
  direction: Direction;
  state: CardState;
  /** Prochaine échéance (timestamp ms). */
  due: number;
  /** Intervalle en jours utilisé en état `review`. */
  interval: number;
  /** Facteur de facilité SM-2. */
  ease: number;
  repetitions: number;
  lapses: number;
  /** Index du prochain palier d'apprentissage à appliquer. */
  step: number;
  suspended: boolean;
  lastReviewedAt?: number;
}

export type Grade = 'known' | 'unknown';

export type ReviewMode = 'reveal' | 'typing';

/**
 * Journal append-only : jamais modifié, jamais supprimé. C'est lui qui permettra
 * de rejouer l'historique dans FSRS le jour où l'on change d'algorithme.
 */
export interface ReviewLog {
  id: string;
  cardId: string;
  wordId: string;
  reviewedAt: number;
  grade: Grade;
  mode: ReviewMode;
  intervalBefore: number;
  intervalAfter: number;
  easeBefore: number;
  easeAfter: number;
  elapsedDays: number;
}

export interface Settings {
  newPerDay: number;
  reviewsPerDay: number;
  theme: 'system' | 'light' | 'dark';
  /** Langue pré-sélectionnée dans le formulaire d'ajout. */
  lastLang: LangCode;
  /** Taper la réponse avant de la révéler. */
  typingMode: boolean;
  /** Date du dernier export, qui déclenche le rappel de sauvegarde. */
  lastExportAt: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 20,
  reviewsPerDay: 150,
  theme: 'system',
  lastLang: 'en',
  typingMode: false,
  lastExportAt: null,
};

/** Compteurs du jour, utilisés pour appliquer les quotas. Clé : `YYYY-MM-DD`. */
export interface DailyCounts {
  date: string;
  newIntroduced: number;
  reviewsDone: number;
}
