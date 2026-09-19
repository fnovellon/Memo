import { describe, expect, it } from 'vitest';
import { acceptedAnswers, checkTypedAnswer } from './answerCheck';

describe('variantes acceptées', () => {
  it('découpe les traductions multiples', () => {
    expect(acceptedAnswers('chat, matou')).toEqual(['chat', 'matou']);
    expect(acceptedAnswers('to run / to jog')).toEqual(['to run', 'to jog']);
    expect(acceptedAnswers('rapide ou vif')).toEqual(['rapide', 'vif']);
  });
});

describe('vérification d’une réponse tapée', () => {
  it('accepte la réponse exacte, casse et espaces mis à part', () => {
    expect(checkTypedAnswer('heureux hasard', '  Heureux   Hasard ')).toBe('exact');
  });

  it('accepte n’importe quelle variante listée', () => {
    expect(checkTypedAnswer('chat, matou', 'matou')).toBe('exact');
  });

  it('signale une réponse juste mais mal accentuée', () => {
    expect(checkTypedAnswer('à côté', 'a cote')).toBe('close');
    expect(checkTypedAnswer("l'été", 'lete')).toBe('close');
  });

  it('refuse une réponse différente', () => {
    expect(checkTypedAnswer('chat', 'chien')).toBe('wrong');
  });

  it('refuse une réponse vide', () => {
    expect(checkTypedAnswer('chat', '   ')).toBe('wrong');
  });
});
