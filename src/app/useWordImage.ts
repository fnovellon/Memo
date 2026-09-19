import { useEffect, useState } from 'react';
import { getImage } from '../data/repository';
import type { StoredImage } from '../data/db';

export interface WordImage {
  image: StoredImage;
  url: string;
}

/**
 * Charge l'image d'un mot et en fabrique une URL temporaire, libérée au démontage :
 * sans cette libération, chaque carte affichée fuirait un blob en mémoire.
 */
export function useWordImage(wordId: string | undefined, enabled = true): WordImage | null {
  const [value, setValue] = useState<WordImage | null>(null);

  useEffect(() => {
    if (!wordId || !enabled) {
      setValue(null);
      return;
    }

    let cancelled = false;
    let url: string | null = null;

    void (async () => {
      const image = await getImage(wordId);
      if (cancelled || !image) {
        if (!cancelled) setValue(null);
        return;
      }
      url = URL.createObjectURL(image.blob);
      setValue({ image, url });
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [wordId, enabled]);

  return value;
}
