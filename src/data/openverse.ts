import {
  normalizeOpenverseResponse,
  openverseSearchUrl,
  type ImageCandidate,
} from '../domain/images';

/** Échec dont le message est destiné à être montré tel quel à l'utilisateur. */
export class ImageSearchError extends Error {}

const TIMEOUT_MS = 12_000;

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Interroge Openverse. Le service est public et sans clé, mais il limite le débit
 * des appels anonymes : chaque échec reçoit donc un message qui dit quoi faire,
 * plutôt qu'une erreur technique.
 */
export async function searchImages(query: string): Promise<ImageCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  let response: Response;
  try {
    response = await withTimeout((signal) =>
      fetch(openverseSearchUrl(trimmed), { signal, headers: { Accept: 'application/json' } }),
    );
  } catch {
    throw new ImageSearchError(
      'La banque d’images n’a pas répondu. Vérifie ta connexion et réessaie.',
    );
  }

  if (response.status === 429) {
    throw new ImageSearchError('Trop de recherches d’affilée. Attends une minute et réessaie.');
  }
  if (!response.ok) {
    throw new ImageSearchError(`La banque d’images a refusé la requête (${response.status}).`);
  }

  try {
    return normalizeOpenverseResponse(await response.json());
  } catch {
    throw new ImageSearchError('Réponse illisible de la banque d’images.');
  }
}

export async function fetchImageBlob(url: string): Promise<Blob> {
  let response: Response;
  try {
    response = await withTimeout((signal) => fetch(url, { signal }));
  } catch {
    throw new ImageSearchError('Le téléchargement de l’image a échoué.');
  }
  if (!response.ok) {
    throw new ImageSearchError(`Image indisponible (${response.status}).`);
  }
  return response.blob();
}
