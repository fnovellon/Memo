import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_SIZE,
  MAX_SOURCE_BYTES,
  buildAttribution,
  checkImageFile,
  describeImageRejection,
  fitWithin,
  normalizeOpenverseResponse,
  normalizeOpenverseResult,
  openverseSearchUrl,
  suggestQuery,
  type ImageSource,
} from './images';

const SOURCE: ImageSource = {
  provider: 'openverse',
  id: 'abc',
  title: 'Un chat roux',
  creator: 'Camille',
  license: 'by-sa',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  pageUrl: 'https://example.org/photo',
};

const RESULT = {
  id: 'abc',
  title: 'Un chat roux',
  creator: 'Camille',
  license: 'by-sa',
  license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  foreign_landing_url: 'https://example.org/photo',
  thumbnail: 'https://api.openverse.org/v1/images/abc/thumb/',
  url: 'https://example.org/full.jpg',
};

describe('redimensionnement', () => {
  it('ramène le plus grand côté à la limite en gardant les proportions', () => {
    expect(fitWithin(2000, 1000)).toEqual({ width: MAX_IMAGE_SIZE, height: MAX_IMAGE_SIZE / 2 });
    expect(fitWithin(1000, 2000)).toEqual({ width: MAX_IMAGE_SIZE / 2, height: MAX_IMAGE_SIZE });
  });

  it('laisse intacte une image déjà petite', () => {
    expect(fitWithin(320, 200)).toEqual({ width: 320, height: 200 });
  });

  it('encaisse une taille absurde sans produire de NaN', () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(-5, 10)).toEqual({ width: 0, height: 0 });
  });
});

describe('mention d’attribution', () => {
  it('nomme l’œuvre, son auteur et sa licence', () => {
    expect(buildAttribution(SOURCE)).toBe('Un chat roux — Camille (BY-SA)');
  });

  it('reste lisible quand l’auteur ou le titre manque', () => {
    expect(buildAttribution({ ...SOURCE, creator: '', title: '' })).toBe(
      'sans titre — auteur inconnu (BY-SA)',
    );
  });
});

describe('requête Openverse', () => {
  it('ne demande que des images réutilisables et modifiables', () => {
    const url = new URL(openverseSearchUrl('chat roux', 8));
    expect(url.searchParams.get('q')).toBe('chat roux');
    expect(url.searchParams.get('page_size')).toBe('8');
    expect(url.searchParams.get('license_type')).toBe('commercial,modification');
    expect(url.searchParams.get('mature')).toBe('false');
  });
});

describe('lecture des résultats', () => {
  it('retient un résultat complet', () => {
    const candidate = normalizeOpenverseResult(RESULT);
    expect(candidate?.thumbnail).toBe('https://api.openverse.org/v1/images/abc/thumb/');
    expect(candidate?.source.creator).toBe('Camille');
  });

  it('se rabat sur l’image entière quand la vignette manque', () => {
    expect(normalizeOpenverseResult({ ...RESULT, thumbnail: undefined })?.thumbnail).toBe(
      'https://example.org/full.jpg',
    );
  });

  it('écarte un résultat sans licence : impossible à créditer', () => {
    expect(normalizeOpenverseResult({ ...RESULT, license: '' })).toBeNull();
  });

  it('écarte une adresse non sécurisée ou absente', () => {
    expect(
      normalizeOpenverseResult({ ...RESULT, thumbnail: 'http://example.org/x.jpg', url: '' }),
    ).toBeNull();
    expect(normalizeOpenverseResult({ ...RESULT, thumbnail: '', url: '' })).toBeNull();
  });

  it('ignore une charge utile inattendue plutôt que de casser', () => {
    expect(normalizeOpenverseResponse(null)).toEqual([]);
    expect(normalizeOpenverseResponse({ results: 'oups' })).toEqual([]);
    expect(normalizeOpenverseResponse({ results: [RESULT, { id: 'x' }] })).toHaveLength(1);
  });
});

describe('terme de recherche proposé', () => {
  it('part du français, première variante seulement', () => {
    expect(suggestQuery('chat, matou', 'cat')).toBe('chat');
  });

  it('se rabat sur le mot étranger si la traduction est vide', () => {
    expect(suggestQuery('  ', 'cat')).toBe('cat');
  });
});

describe('contrôle d’un fichier image', () => {
  it('accepte une photo ordinaire', () => {
    expect(checkImageFile({ type: 'image/jpeg', size: 2_000_000 })).toBeNull();
  });

  it('refuse ce qui n’est pas une image', () => {
    expect(checkImageFile({ type: 'application/pdf', size: 1000 })).toBe('type');
  });

  it('refuse un fichier vide ou démesuré', () => {
    expect(checkImageFile({ type: 'image/jpeg', size: 0 })).toBe('empty');
    expect(checkImageFile({ type: 'image/jpeg', size: MAX_SOURCE_BYTES + 1 })).toBe('size');
  });

  it('explique chaque refus en français', () => {
    expect(describeImageRejection('type')).toMatch(/pas une image/);
    expect(describeImageRejection('size')).toMatch(/25 Mo/);
    expect(describeImageRejection('empty')).toMatch(/vide/);
  });
});

describe('crédit d’une photo personnelle', () => {
  it('ne cherche personne à créditer', () => {
    expect(
      buildAttribution({
        provider: 'device', id: 'x', title: '', creator: '', license: '', licenseUrl: '', pageUrl: '',
      }),
    ).toBe('Photo personnelle');
  });
});
