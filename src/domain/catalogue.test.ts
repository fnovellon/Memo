import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePackIndex } from './packs';

/**
 * Le catalogue est produit par `scripts/build-packs.mjs` et versionné. Ces
 * vérifications portent sur le fichier livré : elles attrapent une régénération
 * oubliée, qui avait déjà fait importer l'en-tête d'un CSV comme une carte.
 */
const index = JSON.parse(readFileSync('public/packs/index.json', 'utf8'));
const packs = parsePackIndex(index);

describe('catalogue livré', () => {
  it('est intégralement valide : aucune fiche écartée à la lecture', () => {
    expect(packs.length).toBe(index.packs.length);
    expect(packs.length).toBeGreaterThan(5);
  });

  it('donne à chaque pack distant ses colonnes et son format', () => {
    for (const pack of packs.filter((candidate) => candidate.remote)) {
      expect(pack.format, `${pack.id} : format`).toBe('csv');
      expect(pack.columns, `${pack.id} : colonnes`).toBeDefined();
      // Ces exports portent une ligne d'en-tête, qui ne doit pas devenir une carte.
      expect(pack.skipHeader, `${pack.id} : en-tête à sauter`).toBe(true);
    }
  });

  it('livre bien le fichier de chaque pack local, avec son compte', () => {
    for (const pack of packs.filter((candidate) => candidate.file)) {
      expect(existsSync(`public/packs/${pack.file}`), `${pack.id} : fichier`).toBe(true);
      expect(pack.count ?? 0, `${pack.id} : compte`).toBeGreaterThan(0);
    }
  });

  it('annonce une licence et une attribution partout', () => {
    for (const pack of packs) {
      expect(pack.license, `${pack.id} : licence`).not.toBe('');
      expect(pack.attribution, `${pack.id} : attribution`).not.toBe('');
    }
  });

  it('n’expose que des sources distantes en HTTPS', () => {
    for (const pack of packs) {
      if (pack.remote) expect(pack.remote.startsWith('https://')).toBe(true);
    }
  });
});
