import type { CardState } from './types';
import { DEFAULT_EASE, MIN_EASE } from './scheduler';

/** Séparateur des champs d'une note Anki. */
export const FIELD_SEPARATOR = '\u001f';

/** Types de carte d'Anki. Seules les cartes « révision » portent un vrai planning. */
export const ANKI_TYPE = { new: 0, learning: 1, review: 2, relearning: 3 } as const;
/** File d'attente -1 : carte suspendue. */
export const ANKI_QUEUE_SUSPENDED = -1;

const SECONDS_PER_DAY = 86_400;
/** Au-delà, une échéance est manifestement corrompue et on la ramène à aujourd'hui. */
const MAX_FUTURE_DAYS = 365 * 20;

export interface AnkiNoteRow {
  id: number;
  mid: number;
  flds: string;
  tags: string;
}

export interface AnkiCardRow {
  id: number;
  nid: number;
  ord: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
}

export interface AnkiNotetype {
  id: number;
  name: string;
  fields: string[];
}

export function splitFields(flds: string): string[] {
  return flds.split(FIELD_SEPARATOR);
}

/**
 * Entités nommées courantes. Les lettres accentuées sont indispensables : un deck
 * français ou allemand en est truffé, et les laisser passer telles quelles
 * produirait des cartes illisibles.
 */
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
  ccedil: 'ç',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë',
  igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  ntilde: 'ñ',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø', oelig: 'œ',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü',
  yacute: 'ý', yuml: 'ÿ', szlig: 'ß',
  laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', deg: '°', middot: '·', euro: '€',
};

/**
 * Les versions capitales suivent la même règle : `Eacute` vaut `É`. On les dérive
 * plutôt que de doubler la table à la main.
 */
for (const [name, character] of Object.entries(ENTITIES)) {
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  if (!(capitalized in ENTITIES) && character.toUpperCase() !== character) {
    ENTITIES[capitalized] = character.toUpperCase();
  }
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const code = entity.startsWith('#x') || entity.startsWith('#X')
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity] ?? ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Ramène un champ Anki à du texte simple. Les champs contiennent du HTML, des
 * références de son et des images : tout cela doit disparaître du texte de la carte,
 * les images étant récupérées séparément.
 */
export function toPlainText(field: string): string {
  return decodeEntities(
    field
      .replace(/\[sound:[^\]]*\]/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(div|p|li|tr)>/gi, ' ')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nom du premier fichier image référencé par le champ, s'il y en a un. */
export function extractImageName(field: string): string | null {
  const match = /<img[^>]+src\s*=\s*["']?([^"'>\s]+)["']?/i.exec(field);
  if (!match?.[1]) return null;
  const name = decodeEntities(match[1]).trim();
  // Une image distante n'est pas dans le paquet : inutile de la chercher.
  if (!name || /^https?:/i.test(name)) return null;
  return name;
}

/** Les notes à trous ne se ramènent pas à un couple mot/traduction. */
export function isCloze(field: string): boolean {
  return /\{\{c\d+::/.test(field);
}

export interface ConvertedSchedule {
  state: CardState;
  due: number;
  interval: number;
  ease: number;
  repetitions: number;
  lapses: number;
  suspended: boolean;
}

function freshSchedule(now: number, suspended: boolean): ConvertedSchedule {
  return {
    state: 'new',
    due: now,
    interval: 0,
    ease: DEFAULT_EASE,
    repetitions: 0,
    lapses: 0,
    suspended,
  };
}

/**
 * Convertit le planning d'une carte Anki vers le nôtre.
 *
 * Anki compte les échéances en jours depuis la création de la collection, et
 * exprime la facilité en millièmes. Les cartes encore en apprentissage ne sont pas
 * reprises : leur état interne ne correspond à rien chez nous, et elles sont de
 * toute façon à revoir tout de suite.
 *
 * @param collectionCreated date de création de la collection, en secondes (colonne `crt`).
 */
export function convertSchedule(
  card: AnkiCardRow,
  collectionCreated: number,
  now: number,
): ConvertedSchedule {
  const suspended = card.queue === ANKI_QUEUE_SUSPENDED;
  const isScheduled = card.type === ANKI_TYPE.review || card.type === ANKI_TYPE.relearning;

  if (!isScheduled || card.ivl <= 0) return freshSchedule(now, suspended);

  const dueMs = (collectionCreated + card.due * SECONDS_PER_DAY) * 1000;
  const horizon = now + MAX_FUTURE_DAYS * SECONDS_PER_DAY * 1000;
  const due = Number.isFinite(dueMs) && dueMs > 0 && dueMs < horizon ? dueMs : now;

  const ease = card.factor > 0 ? Math.max(MIN_EASE, card.factor / 1000) : DEFAULT_EASE;

  return {
    state: 'review',
    due,
    interval: card.ivl,
    ease,
    repetitions: Math.max(1, card.reps),
    lapses: Math.max(0, card.lapses),
    suspended,
  };
}

/* ------------------------------------------------------------------ */
/* Export texte d'Anki                                                 */
/* ------------------------------------------------------------------ */

export interface TextNotes {
  separator: string;
  /** Noms de colonnes si l'export en déclare, sinon « Colonne 1 », « Colonne 2 »… */
  columns: string[];
  rows: string[][];
}

const SEPARATORS: Record<string, string> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  space: ' ',
  pipe: '|',
};

function detectSeparator(lines: string[]): string {
  const declared = lines.find((line) => line.toLowerCase().startsWith('#separator:'));
  if (declared) {
    const value = declared.slice('#separator:'.length).trim().toLowerCase();
    if (SEPARATORS[value]) return SEPARATORS[value]!;
    if (value.length === 1) return value;
  }
  // À défaut de déclaration, on retient le candidat le plus régulier.
  const body = lines.filter((line) => line && !line.startsWith('#')).slice(0, 20);
  const candidates = ['\t', ';', ','];
  let best = '\t';
  let bestScore = -1;
  for (const candidate of candidates) {
    const counts = body.map((line) => line.split(candidate).length);
    if (counts.length === 0 || counts.some((count) => count < 2)) continue;
    const score = Math.min(...counts);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/**
 * Lit un export « Notes au format texte » d'Anki. Les lignes de tête commençant par
 * `#` décrivent le fichier et ne sont pas des notes.
 */
export function parseTextNotes(content: string): TextNotes {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const separator = detectSeparator(lines);

  const declaredColumns = lines
    .find((line) => line.toLowerCase().startsWith('#columns:'))
    ?.slice('#columns:'.length)
    .split(separator)
    .map((name) => name.trim())
    .filter(Boolean);

  const rows = lines
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => line.split(separator));

  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columns =
    declaredColumns && declaredColumns.length >= width
      ? declaredColumns.slice(0, width)
      : Array.from({ length: width }, (_, index) => `Colonne ${index + 1}`);

  return { separator, columns, rows };
}

/* ------------------------------------------------------------------ */
/* Correspondance des champs                                           */
/* ------------------------------------------------------------------ */

export interface FieldMapping {
  term: number;
  translation: number;
  reading: number | null;
}

const TERM_HINTS = ['front', 'word', 'expression', 'recto', 'mot', 'term', 'vocab', 'kanji'];
const TRANSLATION_HINTS = ['back', 'meaning', 'translation', 'verso', 'traduction', 'sens', 'english', 'français', 'francais'];
const READING_HINTS = ['reading', 'lecture', 'kana', 'pinyin', 'romaji', 'pronunciation', 'furigana'];

function findByHint(columns: string[], hints: string[], taken: number[]): number | null {
  const index = columns.findIndex(
    (name, position) =>
      !taken.includes(position) && hints.some((hint) => name.toLowerCase().includes(hint)),
  );
  return index === -1 ? null : index;
}

/**
 * Devine la correspondance à partir des noms de champs, sans jamais l'imposer :
 * l'écran d'import la montre et laisse corriger.
 */
export function guessMapping(columns: string[]): FieldMapping {
  const term = findByHint(columns, TERM_HINTS, []) ?? 0;
  const translation = findByHint(columns, TRANSLATION_HINTS, [term]) ?? (term === 0 ? 1 : 0);
  const reading = findByHint(columns, READING_HINTS, [term, translation]);
  return {
    term,
    translation: Math.min(translation, Math.max(columns.length - 1, 0)),
    reading,
  };
}

export type SkipReason = 'empty' | 'cloze' | 'duplicate';

export interface PreparedNote {
  term: string;
  translation: string;
  reading?: string;
  imageName?: string;
  sourceId: number;
}

export interface PreparationResult {
  notes: PreparedNote[];
  skipped: Record<SkipReason, number>;
}

/**
 * Transforme des champs bruts en mots prêts à enregistrer, en écartant ce qui ne
 * peut pas l'être et en disant pourquoi — un import muet sur ses refus est pire
 * qu'un import qui en écarte.
 */
export function prepareNotes(
  rows: { fields: string[]; id: number }[],
  mapping: FieldMapping,
  existingKeys: ReadonlySet<string>,
): PreparationResult {
  const skipped: Record<SkipReason, number> = { empty: 0, cloze: 0, duplicate: 0 };
  const notes: PreparedNote[] = [];
  const seen = new Set(existingKeys);

  for (const row of rows) {
    const rawTerm = row.fields[mapping.term] ?? '';
    const rawTranslation = row.fields[mapping.translation] ?? '';

    if (isCloze(rawTerm) || isCloze(rawTranslation)) {
      skipped.cloze += 1;
      continue;
    }

    const term = toPlainText(rawTerm);
    const translation = toPlainText(rawTranslation);
    if (!term || !translation) {
      skipped.empty += 1;
      continue;
    }

    const key = term.toLocaleLowerCase();
    if (seen.has(key)) {
      skipped.duplicate += 1;
      continue;
    }
    seen.add(key);

    const reading = mapping.reading === null ? '' : toPlainText(row.fields[mapping.reading] ?? '');
    const imageName =
      extractImageName(rawTerm) ?? extractImageName(rawTranslation) ?? undefined;

    notes.push({
      term,
      translation,
      sourceId: row.id,
      ...(reading ? { reading } : {}),
      ...(imageName ? { imageName } : {}),
    });
  }

  return { notes, skipped };
}

/* ------------------------------------------------------------------ */
/* Index des médias                                                    */
/* ------------------------------------------------------------------ */

/**
 * Lit la table des médias au format JSON des paquets classiques :
 * `{"0": "chat.jpg", "1": "chien.mp3"}`, où la clé est le nom de l'entrée dans
 * l'archive et la valeur le nom d'origine du fichier.
 */
export function parseMediaJson(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return map;
  }
  if (typeof parsed !== 'object' || parsed === null) return map;
  for (const [entry, name] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof name === 'string' && name) map.set(name, entry);
  }
  return map;
}

/**
 * Lit la table des médias des paquets récents, encodée en protobuf. Seul le nom
 * de chaque entrée nous intéresse : sa position dans la liste donne le nom de
 * l'entrée dans l'archive.
 *
 * Message : `MediaEntries { repeated MediaEntry entries = 1 }`,
 * `MediaEntry { string name = 1; ... }`.
 */
export function parseMediaProtobuf(bytes: Uint8Array): Map<string, string> {
  const map = new Map<string, string>();
  const decoder = new TextDecoder();
  let offset = 0;
  let index = 0;

  const readVarint = (): number | null => {
    let result = 0;
    let shift = 0;
    while (offset < bytes.length) {
      const byte = bytes[offset]!;
      offset += 1;
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7;
      if (shift > 49) return null;
    }
    return null;
  };

  while (offset < bytes.length) {
    const tag = readVarint();
    if (tag === null) break;
    const field = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType !== 2) {
      // Seuls les champs de longueur variable nous concernent ; on saute le reste.
      if (wireType === 0) {
        if (readVarint() === null) break;
      } else if (wireType === 5) offset += 4;
      else if (wireType === 1) offset += 8;
      else break;
      continue;
    }

    const length = readVarint();
    if (length === null || offset + length > bytes.length) break;
    const chunk = bytes.subarray(offset, offset + length);
    offset += length;

    if (field !== 1) continue;

    // Premier champ de l'entrée : son nom de fichier.
    const name = readFirstString(chunk, decoder);
    if (name) map.set(name, String(index));
    index += 1;
  }

  return map;
}

function readFirstString(chunk: Uint8Array, decoder: TextDecoder): string | null {
  let offset = 0;
  const readVarint = (): number | null => {
    let result = 0;
    let shift = 0;
    while (offset < chunk.length) {
      const byte = chunk[offset]!;
      offset += 1;
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7;
      if (shift > 49) return null;
    }
    return null;
  };

  const tag = readVarint();
  if (tag === null || (tag & 0x07) !== 2 || tag >> 3 !== 1) return null;
  const length = readVarint();
  if (length === null || offset + length > chunk.length) return null;
  return decoder.decode(chunk.subarray(offset, offset + length));
}
