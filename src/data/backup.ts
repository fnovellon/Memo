import { BACKUP_FORMAT, BACKUP_VERSION, type Backup, backupFileName } from '../domain/backup';
import { APP_VERSION } from '../app/version';
import { readSnapshot, replaceAll } from './repository';

export async function createBackup(now = Date.now()): Promise<Backup> {
  const snapshot = await readSnapshot();
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion: APP_VERSION,
    exportedAt: now,
    ...snapshot,
  };
}

/** Déclenche le téléchargement du fichier de sauvegarde. */
export function downloadBackup(backup: Backup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFileName(backup.exportedAt);
  link.click();
  URL.revokeObjectURL(url);
}

export async function restoreBackup(backup: Backup): Promise<void> {
  await replaceAll({
    words: backup.words,
    cards: backup.cards,
    reviewLogs: backup.reviewLogs,
    daily: backup.daily,
    settings: backup.settings,
  });
}
