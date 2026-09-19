import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { Card, DailyCounts, ReviewLog, Settings, Word } from '../domain/types';

export const DB_NAME = 'memo';
export const DB_VERSION = 1;

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
}

export type MemoDB = IDBPDatabase<MemoSchema>;

let connection: Promise<MemoDB> | null = null;

export function getDB(): Promise<MemoDB> {
  connection ??= openDB<MemoSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
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
    },
  });
  return connection;
}
