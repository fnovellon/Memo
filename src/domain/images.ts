/** Côté le plus long d'une image stockée. Suffisant pour une carte, léger en base. */
export const MAX_IMAGE_SIZE = 512;
/** Qualité WebP : au-delà, le gain visuel ne justifie plus le poids. */
export const IMAGE_QUALITY = 0.75;

export const OPENVERSE_ENDPOINT = 'https://api.openverse.org/v1/images/';

/** Provenance d'une image, conservée pour pouvoir créditer son auteur. */
export interface ImageSource {
  provider: 'openverse';
  id: string;
  title: string;
  creator: string;
  license: string;
  licenseUrl: string;
  pageUrl: string;
}

export interface ImageCandidate {
  source: ImageSource;
  /** Vignette servie par Openverse, utilisée pour l'aperçu comme pour le stockage. */
  thumbnail: string;
}

/**
 * Réduit une taille dans un carré sans la déformer. Une image déjà petite est
 * laissée telle quelle : l'agrandir ne ferait qu'alourdir le fichier.
 */
export function fitWithin(
  width: number,
  height: number,
  max = MAX_IMAGE_SIZE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= max) return { width: Math.round(width), height: Math.round(height) };
  const ratio = max / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

/**
 * Les images d'Openverse sont sous licences libres, qui exigent presque toutes
 * de nommer l'auteur : la mention est donc construite et stockée avec l'image.
 */
export function buildAttribution(source: ImageSource): string {
  const creator = source.creator.trim() || 'auteur inconnu';
  const title = source.title.trim() || 'sans titre';
  return `${title} — ${creator} (${source.license.toUpperCase()})`;
}

export function openverseSearchUrl(query: string, pageSize = 12): string {
  const url = new URL(OPENVERSE_ENDPOINT);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('page_size', String(pageSize));
  // Seulement ce qui est réutilisable et modifiable, et pas de contenu sensible.
  url.searchParams.set('license_type', 'commercial,modification');
  url.searchParams.set('mature', 'false');
  return url.toString();
}

/**
 * Retient un résultat d'Openverse seulement s'il porte tout ce qu'il faut pour
 * l'afficher et le créditer. Un résultat incomplet est écarté plutôt qu'affiché
 * à moitié : on ne peut pas créditer une image dont on ignore la provenance.
 */
export function normalizeOpenverseResult(raw: unknown): ImageCandidate | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;

  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  const id = text(item.id);
  const thumbnail = text(item.thumbnail) || text(item.url);
  const license = text(item.license);

  if (!id || !thumbnail || !license) return null;
  if (!/^https:\/\//.test(thumbnail)) return null;

  return {
    thumbnail,
    source: {
      provider: 'openverse',
      id,
      title: text(item.title),
      creator: text(item.creator),
      license,
      licenseUrl: text(item.license_url),
      pageUrl: text(item.foreign_landing_url),
    },
  };
}

export function normalizeOpenverseResponse(payload: unknown): ImageCandidate[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const results = (payload as Record<string, unknown>).results;
  if (!Array.isArray(results)) return [];
  return results
    .map(normalizeOpenverseResult)
    .filter((candidate): candidate is ImageCandidate => candidate !== null);
}

/** Terme de recherche proposé par défaut : le français décrit mieux la scène cherchée. */
export function suggestQuery(translation: string, term: string): string {
  const cleaned = translation.split(/[,;/]/)[0]?.trim() ?? '';
  return cleaned || term.trim();
}
