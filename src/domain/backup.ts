import type { Card, DailyCounts, ReviewLog, Settings, Word } from './types';

export const BACKUP_FORMAT = 'memo-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  /** Version du format de sauvegarde, pas celle de l'application. */
  version: number;
  /** Version de l'application ayant produit le fichier, utile au diagnostic. */
  appVersion?: string;
  exportedAt: number;
  words: Word[];
  cards: Card[];
  reviewLogs: ReviewLog[];
  daily: DailyCounts[];
  settings: Settings;
}

export class BackupError extends Error {}

function isArrayOfObjects(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null);
}

/**
 * Relit un fichier de sauvegarde. Volontairement strict : restaurer remplace tout,
 * mieux vaut refuser un fichier douteux que d'écraser une bibliothèque avec.
 */
export function parseBackup(raw: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new BackupError("Ce fichier n'est pas un JSON valide.");
  }

  if (typeof data !== 'object' || data === null) {
    throw new BackupError('Ce fichier ne contient pas de sauvegarde.');
  }

  const candidate = data as Record<string, unknown>;
  if (candidate.format !== BACKUP_FORMAT) {
    throw new BackupError("Ce fichier n'est pas une sauvegarde Memo.");
  }
  if (typeof candidate.version !== 'number' || candidate.version > BACKUP_VERSION) {
    throw new BackupError(
      `Sauvegarde en version ${String(candidate.version)}, trop récente pour cette application.`,
    );
  }
  for (const key of ['words', 'cards', 'reviewLogs', 'daily'] as const) {
    if (!isArrayOfObjects(candidate[key])) {
      throw new BackupError(`La sauvegarde est incomplète : « ${key} » est absent ou invalide.`);
    }
  }
  if (typeof candidate.settings !== 'object' || candidate.settings === null) {
    throw new BackupError('La sauvegarde est incomplète : les réglages sont absents.');
  }

  return {
    format: BACKUP_FORMAT,
    version: candidate.version,
    ...(typeof candidate.appVersion === 'string' ? { appVersion: candidate.appVersion } : {}),
    exportedAt: typeof candidate.exportedAt === 'number' ? candidate.exportedAt : Date.now(),
    words: candidate.words as unknown as Word[],
    cards: candidate.cards as unknown as Card[],
    reviewLogs: candidate.reviewLogs as unknown as ReviewLog[],
    daily: candidate.daily as unknown as DailyCounts[],
    settings: candidate.settings as unknown as Settings,
  };
}

/** Nom de fichier daté, pour que plusieurs sauvegardes ne s'écrasent pas. */
export function backupFileName(now: number): string {
  const date = new Date(now);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `memo-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}
