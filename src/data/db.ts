import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { ImageSource } from '../domain/images';
import type { Card, DailyCounts, ReviewLog, Settings, Word } from '../domain/types';

/** Une image est rangée sous l'identifiant de son mot : au plus une par mot. */
export interface StoredImage {
  wordId: string;
  blob: Blob;
  width: number;
  height: number;
  source: ImageSource;
  attribution: string;
  addedAt: number;
}

export const DB_NAME = 'memo';
export const DB_VERSION = 2;

interface MemoSchema extends DBSchema {
  words: {
    key: string;
    value: Word;
    indexes: { 'by-lang': string; 'by-created': number };
  };
  cards: {
    key: string;
    value: Card;
    indexes: { 'by-word': string; 'by-due': number };
  };
  reviewLogs: {
    key: string;
    value: ReviewLog;
    indexes: { 'by-card': string; 'by-date': number };
  };
  settings: {
    key: string;
    value: Settings & { key: string };
  };
  daily: {
    key: string;
    value: DailyCounts;
  };
  images: {
    key: string;
    value: StoredImage;
  };
}

export type MemoDB = IDBPDatabase<MemoSchema>;

let connection: Promise<MemoDB> | null = null;

export function getDB(): Promise<MemoDB> {
  connection ??= openDB<MemoSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) createInitialStores(db);
      // Les images arrivent en v2 : une base déjà installée ne doit pas être recréée.
      if (oldVersion < 2) db.createObjectStore('images', { keyPath: 'wordId' });
    },
  });
  return connection;
}

function createInitialStores(db: IDBPDatabase<MemoSchema>): void {
  const words = db.createObjectStore('words', { keyPath: 'id' });
  words.createIndex('by-lang', 'lang');
  words.createIndex('by-created', 'createdAt');

  const cards = db.createObjectStore('cards', { keyPath: 'id' });
  cards.createIndex('by-word', 'wordId');
  cards.createIndex('by-due', 'due');

  const logs = db.createObjectStore('reviewLogs', { keyPath: 'id' });
  logs.createIndex('by-card', 'cardId');
  logs.createIndex('by-date', 'reviewedAt');

  db.createObjectStore('settings', { keyPath: 'key' });
  db.createObjectStore('daily', { keyPath: 'date' });
}
