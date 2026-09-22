import { describe, expect, it } from 'vitest';
import {
  glossLabel,
  parsePackEntries,
  parsePackIndex,
  rowsFromCsv,
  rowsFromEntries,
} from './packs';

const LOCAL = {
  id: 'en-food', title: 'Anglais — Nourriture', lang: 'en', glossLang: 'fr',
  theme: 'Nourriture', count: 47, license: 'CC BY 4.0', attribution: 'WordNet',
  file: 'en-food.json',
};

const REMOTE = {
  id: 'ja-jlpt-n5', title: 'Japonais — JLPT N5', lang: 'ja', glossLang: 'en',
  theme: 'JLPT N5', license: 'MIT', attribution: 'Jamie Sinclair',
  remote: 'https://raw.githubusercontent.com/x/y/main/n5.csv',
  format: 'csv', columns: { term: 0, reading: 1, translation: 2 }, skipHeader: true,
};

describe('catalogue', () => {
  it('retient les fiches locales et distantes', () => {
    const packs = parsePackIndex({ packs: [LOCAL, REMOTE] });
    expect(packs).toHaveLength(2);
    expect(packs[0]?.file).toBe('en-food.json');
    expect(packs[1]?.columns).toEqual({ term: 0, reading: 1, translation: 2 });
    expect(packs[1]?.skipHeader).toBe(true);
  });

  it('écarte une fiche sans source ni titre', () => {
    const { file: _unused, ...withoutSource } = LOCAL;
    expect(parsePackIndex({ packs: [withoutSource] })).toHaveLength(0);
    expect(parsePackIndex({ packs: [{ ...LOCAL, title: '' }] })).toHaveLength(0);
  });

  it('refuse une source distante non sécurisée', () => {
    expect(parsePackIndex({ packs: [{ ...REMOTE, remote: 'http://exemple.org/x.csv' }] })).toHaveLength(0);
  });

  it('considère le français par défaut', () => {
    const { glossLang: _unused, ...withoutGloss } = LOCAL;
    expect(parsePackIndex({ packs: [withoutGloss] })[0]?.glossLang).toBe('fr');
  });

  it('ignore une charge utile inattendue', () => {
    expect(parsePackIndex(null)).toEqual([]);
    expect(parsePackIndex({ packs: 'oups' })).toEqual([]);
    expect(parsePackIndex({ packs: [42, null] })).toEqual([]);
  });
});

describe('contenu d’un pack', () => {
  it('retient les entrées complètes', () => {
    const entries = parsePackEntries({
      entries: [
        { term: 'tea', translation: 'thé' },
        { term: 'neko', translation: 'chat', reading: 'ねこ' },
        { term: 'sans traduction' },
      ],
    });
    expect(entries).toEqual([
      { term: 'tea', translation: 'thé' },
      { term: 'neko', translation: 'chat', reading: 'ねこ' },
    ]);
  });

  it('prépare les lignes pour l’importeur', () => {
    expect(rowsFromEntries([{ term: 'tea', translation: 'thé' }])).toEqual([
      { id: 0, fields: ['tea', 'thé', ''] },
    ]);
  });
});

describe('pack distant au format CSV', () => {
  const csv = 'expression,reading,meaning\nああ,ああ,"Ah!, Oh!"\n会う,あう,"to meet, to see"\n';

  it('suit les colonnes déclarées et saute l’en-tête', () => {
    expect(rowsFromCsv(csv, { term: 0, reading: 1, translation: 2 }, true)).toEqual([
      { id: 0, fields: ['ああ', 'Ah!, Oh!', 'ああ'] },
      { id: 1, fields: ['会う', 'to meet, to see', 'あう'] },
    ]);
  });

  it('garde l’en-tête quand le catalogue ne demande pas de la sauter', () => {
    expect(rowsFromCsv(csv, { term: 0, translation: 2 }, false)[0]).toEqual({
      id: 0, fields: ['expression', 'meaning', ''],
    });
  });
});

describe('langue de traduction annoncée', () => {
  it('se dit en clair', () => {
    expect(glossLabel('fr')).toBe('vers le français');
    expect(glossLabel('en')).toBe('vers l’anglais');
  });
});
