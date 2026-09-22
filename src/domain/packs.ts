import type { LangCode } from './types';
import { parseCsv } from './csv';

export type GlossLang = 'fr' | 'en';

export interface PackColumns {
  term: number;
  translation: number;
  reading?: number;
}

/** Fiche d'un pack telle que le catalogue la décrit. */
export interface PackSummary {
  id: string;
  title: string;
  lang: LangCode;
  /** Langue dans laquelle le pack traduit : tous ne traduisent pas vers le français. */
  glossLang: GlossLang;
  theme: string;
  count?: number;
  license: string;
  attribution: string;
  /** Pack servi par l'application elle-même. */
  file?: string;
  /** Pack téléchargé depuis son dépôt d'origine. */
  remote?: string;
  format?: 'csv';
  columns?: PackColumns;
  skipHeader?: boolean;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Retient les fiches complètes ; une fiche bancale est ignorée plutôt qu'affichée. */
export function parsePackIndex(payload: unknown): PackSummary[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const packs = (payload as Record<string, unknown>).packs;
  if (!Array.isArray(packs)) return [];

  return packs.flatMap((raw): PackSummary[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const item = raw as Record<string, unknown>;

    const id = asString(item.id);
    const title = asString(item.title);
    const lang = asString(item.lang);
    const file = asString(item.file);
    const remote = asString(item.remote);
    if (!id || !title || !lang || (!file && !remote)) return [];
    if (remote && !remote.startsWith('https://')) return [];

    const glossLang: GlossLang = item.glossLang === 'en' ? 'en' : 'fr';
    const columns = item.columns as PackColumns | undefined;

    return [{
      id,
      title,
      lang,
      glossLang,
      theme: asString(item.theme),
      license: asString(item.license),
      attribution: asString(item.attribution),
      ...(typeof item.count === 'number' ? { count: item.count } : {}),
      ...(file ? { file } : {}),
      ...(remote ? { remote } : {}),
      ...(item.format === 'csv' ? { format: 'csv' as const } : {}),
      ...(columns && typeof columns.term === 'number' && typeof columns.translation === 'number'
        ? { columns }
        : {}),
      ...(item.skipHeader === true ? { skipHeader: true } : {}),
    }];
  });
}

export interface PackEntry {
  term: string;
  translation: string;
  reading?: string;
}

/** Lignes prêtes pour l'importeur : mot, traduction, lecture. */
export function rowsFromEntries(entries: PackEntry[]): { id: number; fields: string[] }[] {
  return entries.map((entry, index) => ({
    id: index,
    fields: [entry.term, entry.translation, entry.reading ?? ''],
  }));
}

/** Même chose depuis un CSV distant, en suivant les colonnes déclarées par le catalogue. */
export function rowsFromCsv(
  content: string,
  columns: PackColumns,
  skipHeader = false,
): { id: number; fields: string[] }[] {
  const rows = parseCsv(content);
  const body = skipHeader ? rows.slice(1) : rows;
  return body.map((row, index) => ({
    id: index,
    fields: [
      row[columns.term] ?? '',
      row[columns.translation] ?? '',
      columns.reading === undefined ? '' : (row[columns.reading] ?? ''),
    ],
  }));
}

export function parsePackEntries(payload: unknown): PackEntry[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const entries = (payload as Record<string, unknown>).entries;
  if (!Array.isArray(entries)) return [];

  return entries.flatMap((raw): PackEntry[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const item = raw as Record<string, unknown>;
    const term = asString(item.term);
    const translation = asString(item.translation);
    if (!term || !translation) return [];
    const reading = asString(item.reading);
    return [{ term, translation, ...(reading ? { reading } : {}) }];
  });
}

export function glossLabel(glossLang: GlossLang): string {
  return glossLang === 'fr' ? 'vers le français' : 'vers l’anglais';
}
