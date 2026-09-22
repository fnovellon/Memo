import {
  parsePackEntries,
  parsePackIndex,
  rowsFromCsv,
  rowsFromEntries,
  type PackSummary,
} from '../domain/packs';
import { runImport, type ImportReport } from './importer';

/** Échec dont le message est destiné à l'écran. */
export class PackError extends Error {}

const TIMEOUT_MS = 20_000;

async function get(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new PackError(`Téléchargement impossible (${response.status}).`);
    return response;
  } catch (failure) {
    if (failure instanceof PackError) throw failure;
    throw new PackError('Le pack n’a pas pu être téléchargé. Vérifie ta connexion.');
  } finally {
    clearTimeout(timer);
  }
}

function packsUrl(file: string): string {
  return `${import.meta.env.BASE_URL}packs/${file}`;
}

export async function fetchCatalogue(): Promise<PackSummary[]> {
  const response = await get(packsUrl('index.json'));
  try {
    return parsePackIndex(await response.json());
  } catch {
    throw new PackError('Le catalogue des packs est illisible.');
  }
}

/**
 * Télécharge un pack puis le verse dans la bibliothèque par le même chemin que
 * l'import Anki : mêmes règles de doublon, même compte rendu.
 */
export async function installPack(pack: PackSummary): Promise<ImportReport> {
  let rows: { id: number; fields: string[] }[];

  if (pack.remote) {
    const text = await (await get(pack.remote)).text();
    if (!pack.columns) throw new PackError('Ce pack ne décrit pas ses colonnes.');
    rows = rowsFromCsv(text, pack.columns, pack.skipHeader ?? false);
  } else if (pack.file) {
    const payload = await (await get(packsUrl(pack.file))).json();
    rows = rowsFromEntries(parsePackEntries(payload));
  } else {
    throw new PackError('Ce pack n’indique aucune source.');
  }

  if (rows.length === 0) throw new PackError('Ce pack est vide.');

  return runImport(
    { rows },
    {
      lang: pack.lang,
      mapping: { term: 0, translation: 1, reading: 2 },
      keepSchedule: false,
      importImages: false,
      sourceLabel: pack.id,
    },
  );
}
