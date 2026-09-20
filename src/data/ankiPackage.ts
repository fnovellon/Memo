import { unzipSync } from 'fflate';
import { decompress as zstdDecompress } from 'fzstd';
import {
  parseMediaJson,
  parseMediaProtobuf,
  type AnkiCardRow,
  type AnkiNoteRow,
  type AnkiNotetype,
} from '../domain/anki';

/** Échec dont le message est fait pour être montré tel quel. */
export class AnkiImportError extends Error {}

/** Noms possibles de la base, du plus récent au plus ancien. */
const COLLECTION_NAMES = ['collection.anki21b', 'collection.anki21', 'collection.anki2'];
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

function isZstd(bytes: Uint8Array): boolean {
  return bytes.length > 4 && ZSTD_MAGIC.every((byte, index) => bytes[index] === byte);
}

/** Les paquets récents compressent chaque entrée ; les anciens ne compressent rien. */
function inflate(bytes: Uint8Array): Uint8Array {
  return isZstd(bytes) ? zstdDecompress(bytes) : bytes;
}

export interface AnkiPackage {
  /** Création de la collection, en secondes — origine des échéances d'Anki. */
  collectionCreated: number;
  notetypes: AnkiNotetype[];
  notes: AnkiNoteRow[];
  cards: AnkiCardRow[];
  /** Vrai si le paquet contient des médias que l'on n'a pas su indexer. */
  mediaUnreadable: boolean;
  getMedia: (filename: string) => Uint8Array | null;
}

type Row = Record<string, unknown>;

function query(db: { prepare: (sql: string) => any }, sql: string): Row[] {
  const statement = db.prepare(sql);
  const rows: Row[] = [];
  try {
    while (statement.step()) rows.push(statement.getAsObject() as Row);
  } finally {
    statement.free();
  }
  return rows;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0) || 0;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Les types de note vivent dans une colonne JSON de `col` sur les anciens schémas,
 * et dans de vraies tables sur les récents. On tente les deux.
 */
function readNotetypes(db: any): AnkiNotetype[] {
  const fromJson = readNotetypesFromJson(db);
  if (fromJson.length > 0) return fromJson;
  return readNotetypesFromTables(db);
}

function readNotetypesFromJson(db: any): AnkiNotetype[] {
  let raw = '';
  try {
    raw = asString(query(db, 'SELECT models FROM col LIMIT 1')[0]?.models);
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const models = JSON.parse(raw) as Record<string, { name?: string; flds?: unknown[] }>;
    return Object.entries(models).map(([id, model]) => ({
      id: Number(id),
      name: model.name ?? `Type ${id}`,
      fields: (model.flds ?? [])
        .map((field) => field as { name?: string; ord?: number })
        .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))
        .map((field, index) => field.name ?? `Champ ${index + 1}`),
    }));
  } catch {
    return [];
  }
}

function readNotetypesFromTables(db: any): AnkiNotetype[] {
  try {
    const names = query(db, 'SELECT id, name FROM notetypes');
    const fields = query(db, 'SELECT ntid, ord, name FROM fields ORDER BY ntid, ord');
    return names.map((row) => {
      const id = asNumber(row.id);
      return {
        id,
        name: asString(row.name) || `Type ${id}`,
        fields: fields
          .filter((field) => asNumber(field.ntid) === id)
          .map((field, index) => asString(field.name) || `Champ ${index + 1}`),
      };
    });
  } catch {
    return [];
  }
}

function readMediaIndex(entries: Record<string, Uint8Array>): {
  index: Map<string, string>;
  unreadable: boolean;
} {
  const raw = entries.media;
  if (!raw) return { index: new Map(), unreadable: false };

  let bytes: Uint8Array;
  try {
    bytes = inflate(raw);
  } catch {
    return { index: new Map(), unreadable: true };
  }

  const text = new TextDecoder().decode(bytes);
  const json = parseMediaJson(text);
  if (json.size > 0) return { index: json, unreadable: false };

  const protobuf = parseMediaProtobuf(bytes);
  if (protobuf.size > 0) return { index: protobuf, unreadable: false };

  // Un index vide n'est un échec que s'il y avait des fichiers à indexer.
  const hasNumberedEntries = Object.keys(entries).some((name) => /^\d+$/.test(name));
  return { index: new Map(), unreadable: hasNumberedEntries };
}

/**
 * Ouvre un `.apkg` : archive ZIP contenant une base SQLite, éventuellement
 * compressée, et les fichiers de médias numérotés.
 */
export async function readAnkiPackage(file: File): Promise<AnkiPackage> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new AnkiImportError('Ce fichier n’est pas une archive Anki lisible.');
  }

  const name = COLLECTION_NAMES.find((candidate) => entries[candidate]);
  if (!name) {
    throw new AnkiImportError(
      'Archive sans collection Anki. Exporte un paquet « .apkg » depuis Anki, pas une sauvegarde.',
    );
  }

  let database: Uint8Array;
  try {
    database = inflate(entries[name]!);
  } catch {
    throw new AnkiImportError('La collection de ce paquet n’a pas pu être décompressée.');
  }

  // Le moteur SQLite ne se charge qu'ici : inutile de le faire payer au démarrage.
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });

  let db: any;
  try {
    db = new SQL.Database(database);
  } catch {
    throw new AnkiImportError('La collection de ce paquet est illisible.');
  }

  try {
    const collectionCreated = asNumber(query(db, 'SELECT crt FROM col LIMIT 1')[0]?.crt);
    const notetypes = readNotetypes(db);

    const notes: AnkiNoteRow[] = query(db, 'SELECT id, mid, flds, tags FROM notes').map((row) => ({
      id: asNumber(row.id),
      mid: asNumber(row.mid),
      flds: asString(row.flds),
      tags: asString(row.tags),
    }));

    const cards: AnkiCardRow[] = query(
      db,
      'SELECT id, nid, ord, type, queue, due, ivl, factor, reps, lapses FROM cards',
    ).map((row) => ({
      id: asNumber(row.id),
      nid: asNumber(row.nid),
      ord: asNumber(row.ord),
      type: asNumber(row.type),
      queue: asNumber(row.queue),
      due: asNumber(row.due),
      ivl: asNumber(row.ivl),
      factor: asNumber(row.factor),
      reps: asNumber(row.reps),
      lapses: asNumber(row.lapses),
    }));

    if (notes.length === 0) {
      throw new AnkiImportError('Ce paquet ne contient aucune note.');
    }

    const { index, unreadable } = readMediaIndex(entries);

    return {
      collectionCreated,
      notetypes,
      notes,
      cards,
      mediaUnreadable: unreadable,
      getMedia: (filename: string) => {
        const entry = index.get(filename);
        if (entry === undefined) return null;
        const bytes = entries[entry];
        if (!bytes) return null;
        try {
          return inflate(bytes);
        } catch {
          return null;
        }
      },
    };
  } finally {
    db.close();
  }
}
