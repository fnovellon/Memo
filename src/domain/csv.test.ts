import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('lecture CSV', () => {
  it('découpe des champs simples', () => {
    expect(parseCsv('a,b,c\nd,e,f')).toEqual([['a', 'b', 'c'], ['d', 'e', 'f']]);
  });

  it('respecte le séparateur à l’intérieur des guillemets', () => {
    expect(parseCsv('ああ,ああ,"Ah!, Oh!",JLPT')).toEqual([['ああ', 'ああ', 'Ah!, Oh!', 'JLPT']]);
  });

  it('restitue un guillemet doublé', () => {
    expect(parseCsv('a,"il dit ""non""",b')).toEqual([['a', 'il dit "non"', 'b']]);
  });

  it('accepte un retour à la ligne dans un champ cité', () => {
    expect(parseCsv('a,"deux\nlignes",c')).toEqual([['a', 'deux\nlignes', 'c']]);
  });

  it('gère les fins de ligne Windows et les lignes vides', () => {
    expect(parseCsv('a,b\r\n\r\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('conserve les champs vides', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });

  it('accepte un autre séparateur', () => {
    expect(parseCsv('a;b;c', ';')).toEqual([['a', 'b', 'c']]);
  });

  it('ne rend rien sur un contenu vide', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\n')).toEqual([]);
  });
});
