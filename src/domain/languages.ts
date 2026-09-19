import type { LangCode } from './types';

export interface Language {
  code: LangCode;
  label: string;
  /** Langues à écriture non latine : la fiche gagne un champ « lecture ». */
  needsReading: boolean;
  /** Utilisé par `lang=` pour la coupure de ligne et le choix de police. */
  htmlLang: string;
}

export const LANGUAGES: Language[] = [
  { code: 'en', label: 'Anglais', needsReading: false, htmlLang: 'en' },
  { code: 'es', label: 'Espagnol', needsReading: false, htmlLang: 'es' },
  { code: 'it', label: 'Italien', needsReading: false, htmlLang: 'it' },
  { code: 'de', label: 'Allemand', needsReading: false, htmlLang: 'de' },
  { code: 'pt', label: 'Portugais', needsReading: false, htmlLang: 'pt' },
  { code: 'nl', label: 'Néerlandais', needsReading: false, htmlLang: 'nl' },
  { code: 'ja', label: 'Japonais', needsReading: true, htmlLang: 'ja' },
  { code: 'zh', label: 'Chinois', needsReading: true, htmlLang: 'zh' },
  { code: 'ko', label: 'Coréen', needsReading: true, htmlLang: 'ko' },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function getLanguage(code: LangCode): Language {
  return BY_CODE.get(code) ?? { code, label: code.toUpperCase(), needsReading: false, htmlLang: code };
}

export function languageLabel(code: LangCode): string {
  return getLanguage(code).label;
}

export function needsReading(code: LangCode): boolean {
  return getLanguage(code).needsReading;
}
