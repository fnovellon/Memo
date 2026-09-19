import { useEffect } from 'react';
import type { Settings } from '../domain/types';

/**
 * Applique le thème choisi. `system` retire l'attribut pour laisser la main à la
 * requête média, ce qui suit alors le réglage de l'appareil en direct.
 */
export function useTheme(theme: Settings['theme']): void {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
}
