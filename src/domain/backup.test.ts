import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, BackupError, backupFileName, parseBackup } from './backup';
import { DEFAULT_SETTINGS } from './types';

const VALID = {
  format: BACKUP_FORMAT,
  version: 1,
  exportedAt: 1_700_000_000_000,
  words: [],
  cards: [],
  reviewLogs: [],
  daily: [],
  settings: DEFAULT_SETTINGS,
};

describe('lecture d’une sauvegarde', () => {
  it('relit un fichier valide', () => {
    const backup = parseBackup(JSON.stringify(VALID));
    expect(backup.exportedAt).toBe(1_700_000_000_000);
    expect(backup.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('conserve la version de l’application quand elle est présente', () => {
    expect(parseBackup(JSON.stringify({ ...VALID, appVersion: '0.2.0' })).appVersion).toBe('0.2.0');
  });

  it('accepte une sauvegarde antérieure, sans version d’application', () => {
    expect(parseBackup(JSON.stringify(VALID)).appVersion).toBeUndefined();
  });

  it('refuse un JSON invalide', () => {
    expect(() => parseBackup('{')).toThrow(BackupError);
  });

  it('refuse un fichier étranger à l’application', () => {
    expect(() => parseBackup(JSON.stringify({ format: 'autre-chose' }))).toThrow(
      /pas une sauvegarde Memo/,
    );
  });

  it('refuse une sauvegarde issue d’une version plus récente', () => {
    expect(() => parseBackup(JSON.stringify({ ...VALID, version: 99 }))).toThrow(/trop récente/);
  });

  it('refuse une sauvegarde amputée', () => {
    const { cards: _omitted, ...withoutCards } = VALID;
    expect(() => parseBackup(JSON.stringify(withoutCards))).toThrow(/incomplète/);
  });
});

describe('nom de fichier', () => {
  it('porte la date du jour', () => {
    expect(backupFileName(new Date(2026, 8, 19, 12).getTime())).toBe('memo-2026-09-19.json');
  });
});
