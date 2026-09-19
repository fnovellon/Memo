import {
  IMAGE_QUALITY,
  MAX_IMAGE_SIZE,
  buildAttribution,
  fitWithin,
  type ImageCandidate,
} from '../domain/images';
import { ImageSearchError, fetchImageBlob } from './openverse';
import { putImage } from './repository';
import type { StoredImage } from './db';

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Réduit l'image et la réencode en WebP avant stockage : une photo de banque pèse
 * facilement plusieurs mégaoctets, ce qui saturerait vite le quota du navigateur.
 * Si le navigateur ne sait pas produire de WebP, il rend du PNG et on le garde.
 */
export async function downscale(
  blob: Blob,
  max = MAX_IMAGE_SIZE,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
    if (width === 0 || height === 0) {
      throw new ImageSearchError('Cette image est illisible.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new ImageSearchError('Le navigateur n’a pas pu préparer l’image.');
    context.drawImage(bitmap, 0, 0, width, height);

    const encoded = await toBlob(canvas, 'image/webp', IMAGE_QUALITY);
    if (!encoded) throw new ImageSearchError('Le navigateur n’a pas pu convertir l’image.');
    return { blob: encoded, width, height };
  } finally {
    bitmap.close();
  }
}

/** Télécharge, allège et range l'image choisie sous l'identifiant du mot. */
export async function attachImage(
  wordId: string,
  candidate: ImageCandidate,
  now = Date.now(),
): Promise<StoredImage> {
  const original = await fetchImageBlob(candidate.thumbnail);
  const { blob, width, height } = await downscale(original);

  const stored: StoredImage = {
    wordId,
    blob,
    width,
    height,
    source: candidate.source,
    attribution: buildAttribution(candidate.source),
    addedAt: now,
  };
  await putImage(stored);
  return stored;
}
