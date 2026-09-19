import { applyGrade } from '../domain/scheduler';
import { createCard } from '../domain/scheduler';
import { DEFAULT_SETTINGS } from '../domain/types';
import type {
  Card,
  DailyCounts,
  Direction,
  Grade,
  LangCode,
  ReviewLog,
  ReviewMode,
  Settings,
  Word,
} from '../domain/types';
import { getDB } from './db';

const SETTINGS_KEY = 'app';
const DIRECTIONS: Direction[] = ['recognition', 'production'];

function newId(): string {
  return crypto.randomUUID();
}

/** Clé de journée locale : une révision faite à 23 h 50 compte pour ce jour-là. */
export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export async function loadSettings(): Promise<Settings> {
  const db = await getDB();
  const stored = await db.get('settings', SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDB();
  await db.put('settings', { ...settings, key: SETTINGS_KEY });
}

export async function listWords(): Promise<Word[]> {
  const db = await getDB();
  return db.getAll('words');
}

export async function listCards(): Promise<Card[]> {
  const db = await getDB();
  return db.getAll('cards');
}

export interface WordInput {
  lang: LangCode;
  term: string;
  translation: string;
  reading?: string;
  source?: Word['source'];
}

/** Ajoute un mot et crée ses deux cartes — reconnaissance et production. */
export async function addWord(input: WordInput, now = Date.now()): Promise<Word> {
  const word: Word = {
    id: newId(),
    lang: input.lang,
    term: input.term.trim(),
    translation: input.translation.trim(),
    source: input.source ?? 'manual',
    createdAt: now,
    ...(input.reading?.trim() ? { reading: input.reading.trim() } : {}),
  };

  const db = await getDB();
  const tx = db.transaction(['words', 'cards'], 'readwrite');
  await tx.objectStore('words').put(word);
  const cards = tx.objectStore('cards');
  for (const direction of DIRECTIONS) {
    await cards.put(createCard(word.id, direction, now, newId()));
  }
  await tx.done;
  return word;
}

export async function updateWord(word: Word): Promise<void> {
  const db = await getDB();
  await db.put('words', {
    ...word,
    term: word.term.trim(),
    translation: word.translation.trim(),
  });
}

/**
 * Supprime un mot et ses cartes. Le journal de révision est conservé : c'est une
 * trace historique, l'effacer trouerait les statistiques.
 */
export async function deleteWord(wordId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['words', 'cards'], 'readwrite');
  await tx.objectStore('words').delete(wordId);
  const cards = tx.objectStore('cards');
  const doomed = await cards.index('by-word').getAllKeys(wordId);
  for (const key of doomed) await cards.delete(key);
  await tx.done;
}

export async function setWordSuspended(wordId: string, suspended: boolean): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('cards', 'readwrite');
  const store = tx.objectStore('cards');
  const cards = await store.index('by-word').getAll(wordId);
  for (const card of cards) await store.put({ ...card, suspended });
  await tx.done;
}

export async function findDuplicate(lang: LangCode, term: string): Promise<Word | undefined> {
  const db = await getDB();
  const candidates = await db.getAllFromIndex('words', 'by-lang', lang);
  const needle = term.trim().toLocaleLowerCase();
  return candidates.find((word) => word.term.toLocaleLowerCase() === needle);
}

export async function getDailyCounts(now = Date.now()): Promise<DailyCounts> {
  const db = await getDB();
  const date = dayKey(now);
  return (await db.get('daily', date)) ?? { date, newIntroduced: 0, reviewsDone: 0 };
}

export interface AnswerResult {
  card: Card;
  log: ReviewLog;
  counts: DailyCounts;
}

/**
 * Enregistre une réponse : nouvelle version de la carte, ligne de journal et
 * compteurs du jour, le tout dans une seule transaction.
 *
 * « Passer » n'appelle pas cette fonction — ce choix ne laisse aucune trace.
 */
export async function recordAnswer(
  card: Card,
  grade: Grade,
  mode: ReviewMode = 'reveal',
  now = Date.now(),
): Promise<AnswerResult> {
  const { card: updated, log } = applyGrade(card, grade, now, { mode });
  const entry: ReviewLog = { ...log, id: newId() };

  const db = await getDB();
  const tx = db.transaction(['cards', 'reviewLogs', 'daily'], 'readwrite');
  await tx.objectStore('cards').put(updated);
  await tx.objectStore('reviewLogs').put(entry);

  const daily = tx.objectStore('daily');
  const date = dayKey(now);
  const current = (await daily.get(date)) ?? { date, newIntroduced: 0, reviewsDone: 0 };
  const counts: DailyCounts = {
    date,
    newIntroduced: current.newIntroduced + (card.state === 'new' ? 1 : 0),
    reviewsDone: current.reviewsDone + (card.state === 'review' ? 1 : 0),
  };
  await daily.put(counts);
  await tx.done;

  return { card: updated, log: entry, counts };
}
