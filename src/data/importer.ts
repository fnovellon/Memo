import {
  convertSchedule,
  prepareNotes,
  splitFields,
  type AnkiCardRow,
  type FieldMapping,
  type PreparedNote,
  type SkipReason,
} from '../domain/anki';
import { buildAttribution, type ImageSource } from '../domain/images';
import { createCard } from '../domain/scheduler';
import type { Card, Direction, LangCode, Word } from '../domain/types';
import { downscale } from './imageStore';
import { bulkInsert, listWords, putImage } from './repository';
import type { AnkiPackage } from './ankiPackage';

const DIRECTIONS: Direction[] = ['recognition', 'production'];

export interface ImportOptions {
  lang: LangCode;
  mapping: FieldMapping;
  /** Reprendre le planning d'Anki plutôt que de repartir de cartes neuves. */
  keepSchedule: boolean;
  importImages: boolean;
  sourceLabel: string;
}

export interface ImportReport {
  imported: number;
  skipped: Record<SkipReason, number>;
  /** Cartes ayant hérité d'un planning Anki. */
  scheduled: number;
  images: number;
  imagesFailed: number;
}

export interface ImportInput {
  /** Champs déjà séparés, tels qu'ils seront présentés à la correspondance. */
  rows: { id: number; fields: string[] }[];
  pkg?: AnkiPackage;
}

/** Champs d'une note Anki, prêts pour la correspondance. */
export function rowsFromPackage(pkg: AnkiPackage, notetypeId: number) {
  return pkg.notes
    .filter((note) => note.mid === notetypeId)
    .map((note) => ({ id: note.id, fields: splitFields(note.flds) }));
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Anki produit une carte par modèle de la note : la première interroge en général
 * dans le sens « recto → verso », la seconde dans l'autre. On les fait correspondre
 * à nos deux sens dans cet ordre, et ce qui manque démarre à neuf.
 */
function scheduleFor(
  ankiCards: AnkiCardRow[] | undefined,
  direction: Direction,
): AnkiCardRow | undefined {
  if (!ankiCards) return undefined;
  const wanted = direction === 'recognition' ? 0 : 1;
  return ankiCards.find((card) => card.ord === wanted);
}

export async function runImport(
  input: ImportInput,
  options: ImportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportReport> {
  const now = Date.now();

  const existing = await listWords();
  const existingKeys = new Set(
    existing
      .filter((word) => word.lang === options.lang)
      .map((word) => word.term.toLocaleLowerCase()),
  );

  const { notes, skipped } = prepareNotes(input.rows, options.mapping, existingKeys);

  const cardsByNote = new Map<number, AnkiCardRow[]>();
  if (input.pkg && options.keepSchedule) {
    for (const card of input.pkg.cards) {
      const list = cardsByNote.get(card.nid);
      if (list) list.push(card);
      else cardsByNote.set(card.nid, [card]);
    }
  }

  const words: Word[] = [];
  const cards: Card[] = [];
  let scheduled = 0;

  for (const note of notes) {
    const word: Word = {
      id: newId(),
      lang: options.lang,
      term: note.term,
      translation: note.translation,
      source: `pack:${options.sourceLabel}`,
      createdAt: now,
      ...(note.reading ? { reading: note.reading } : {}),
    };
    words.push(word);

    for (const direction of DIRECTIONS) {
      const card = createCard(word.id, direction, now, newId());
      const ankiCard = scheduleFor(cardsByNote.get(note.sourceId), direction);
      if (ankiCard && input.pkg) {
        const converted = convertSchedule(ankiCard, input.pkg.collectionCreated, now);
        Object.assign(card, converted);
        if (converted.state === 'review') scheduled += 1;
      }
      cards.push(card);
    }
  }

  await bulkInsert(words, cards);

  const report: ImportReport = {
    imported: words.length,
    skipped,
    scheduled,
    images: 0,
    imagesFailed: 0,
  };

  if (options.importImages && input.pkg) {
    const withImages = notes
      .map((note, index) => ({ note, word: words[index]! }))
      .filter((pair): pair is { note: PreparedNote & { imageName: string }; word: Word } =>
        Boolean(pair.note.imageName),
      );

    let done = 0;
    for (const { note, word } of withImages) {
      try {
        const bytes = input.pkg.getMedia(note.imageName);
        if (!bytes) {
          report.imagesFailed += 1;
        } else {
          // La copie isole les octets du tampon d'origine, que Blob ne doit pas partager.
          const blob = new Blob([bytes.slice().buffer as ArrayBuffer]);
          const reduced = await downscale(blob);
          const source: ImageSource = {
            provider: 'anki',
            id: note.imageName,
            title: note.imageName,
            creator: '',
            license: '',
            licenseUrl: '',
            pageUrl: '',
          };
          await putImage({
            wordId: word.id,
            blob: reduced.blob,
            width: reduced.width,
            height: reduced.height,
            source,
            attribution: buildAttribution(source),
            addedAt: now,
          });
          report.images += 1;
        }
      } catch {
        report.imagesFailed += 1;
      }
      done += 1;
      onProgress?.(done, withImages.length);
    }
  }

  return report;
}
