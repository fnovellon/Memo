import { describe, expect, it } from 'vitest';
import {
  DAY,
  DEFAULT_EASE,
  LAPSE_EASE_PENALTY,
  MINUTE,
  MIN_EASE,
  applyGrade,
  createCard,
  describeNextDue,
  fuzzInterval,
  returnsInSession,
} from './scheduler';
import type { Card } from './types';

const NOW = Date.UTC(2026, 0, 15, 10, 0, 0);
const noFuzz = () => 0.5;

function reviewCard(overrides: Partial<Card> = {}): Card {
  return {
    ...createCard('word-1', 'recognition', NOW, 'card-1'),
    state: 'review',
    interval: 10,
    repetitions: 3,
    due: NOW,
    lastReviewedAt: NOW - 10 * DAY,
    ...overrides,
  };
}

describe('createCard', () => {
  it('démarre neuve, due immédiatement, avec la facilité par défaut', () => {
    const card = createCard('word-1', 'production', NOW, 'card-1');
    expect(card).toMatchObject({
      state: 'new',
      due: NOW,
      interval: 0,
      ease: DEFAULT_EASE,
      repetitions: 0,
      lapses: 0,
      step: 0,
      suspended: false,
    });
  });
});

describe('paliers d’apprentissage', () => {
  it('fait franchir 1 min puis 10 min avant de sortir à 1 jour', () => {
    const fresh = createCard('word-1', 'recognition', NOW, 'card-1');

    const first = applyGrade(fresh, 'known', NOW, { random: noFuzz }).card;
    expect(first.state).toBe('learning');
    expect(first.due).toBe(NOW + 1 * MINUTE);

    const second = applyGrade(first, 'known', NOW, { random: noFuzz }).card;
    expect(second.state).toBe('learning');
    expect(second.due).toBe(NOW + 10 * MINUTE);

    const graduated = applyGrade(second, 'known', NOW, { random: noFuzz }).card;
    expect(graduated.state).toBe('review');
    expect(graduated.interval).toBe(1);
    expect(graduated.repetitions).toBe(1);
    expect(graduated.due).toBe(NOW + DAY);
  });

  it('renvoie au premier palier sans toucher à la facilité quand le mot n’est pas su', () => {
    const fresh = createCard('word-1', 'recognition', NOW, 'card-1');
    const advanced = applyGrade(fresh, 'known', NOW, { random: noFuzz }).card;

    const forgotten = applyGrade(advanced, 'unknown', NOW, { random: noFuzz }).card;
    expect(forgotten.state).toBe('learning');
    expect(forgotten.due).toBe(NOW + 1 * MINUTE);
    expect(forgotten.ease).toBe(DEFAULT_EASE);
    expect(forgotten.lapses).toBe(0);
  });
});

describe('révisions réussies', () => {
  it('enchaîne 1 jour, 6 jours, puis multiplie par la facilité', () => {
    const graduated = reviewCard({ repetitions: 1, interval: 1 });

    const second = applyGrade(graduated, 'known', NOW, { random: noFuzz }).card;
    expect(second.interval).toBe(6);
    expect(second.repetitions).toBe(2);

    const third = applyGrade(second, 'known', NOW, { random: noFuzz }).card;
    expect(third.interval).toBe(Math.round(6 * DEFAULT_EASE));
    expect(third.due).toBe(NOW + third.interval * DAY);
  });

  it('laisse la facilité intacte : « je savais » vaut la note 4 de SM-2', () => {
    const card = reviewCard({ ease: 2.1 });
    expect(applyGrade(card, 'known', NOW, { random: noFuzz }).card.ease).toBe(2.1);
  });
});

describe('oubli d’une carte apprise', () => {
  it('coûte 0,20 de facilité et ramène la carte dans la séance', () => {
    const card = reviewCard({ ease: 2.5, interval: 30, repetitions: 5 });
    const lapsed = applyGrade(card, 'unknown', NOW, { random: noFuzz }).card;

    expect(lapsed.state).toBe('relearning');
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.ease).toBeCloseTo(2.5 - LAPSE_EASE_PENALTY, 10);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.due).toBe(NOW + 1 * MINUTE);
    expect(returnsInSession(lapsed, NOW)).toBe(true);
  });

  it('ne descend jamais sous la facilité plancher', () => {
    const card = reviewCard({ ease: MIN_EASE });
    expect(applyGrade(card, 'unknown', NOW, { random: noFuzz }).card.ease).toBe(MIN_EASE);
  });

  it('remonte à 1 jour puis 6 jours après ré-apprentissage', () => {
    let card = applyGrade(reviewCard(), 'unknown', NOW, { random: noFuzz }).card;
    card = applyGrade(card, 'known', NOW, { random: noFuzz }).card; // palier 10 min
    card = applyGrade(card, 'known', NOW, { random: noFuzz }).card; // sortie
    expect(card.state).toBe('review');
    expect(card.interval).toBe(1);

    card = applyGrade(card, 'known', NOW, { random: noFuzz }).card;
    expect(card.interval).toBe(6);
  });
});

describe('dispersion des intervalles', () => {
  it('ne touche pas aux intervalles de moins de deux jours', () => {
    expect(fuzzInterval(1, () => 0)).toBe(1);
    expect(fuzzInterval(1, () => 1)).toBe(1);
  });

  it('reste dans une fourchette de ±5 % au-delà', () => {
    for (const random of [() => 0, () => 0.25, () => 0.5, () => 0.75, () => 1]) {
      const fuzzed = fuzzInterval(100, random);
      expect(fuzzed).toBeGreaterThanOrEqual(95);
      expect(fuzzed).toBeLessThanOrEqual(105);
    }
  });
});

describe('journal de révision', () => {
  it('enregistre l’avant et l’après, et le temps réellement écoulé', () => {
    const card = reviewCard({ interval: 10, ease: 2.5, lastReviewedAt: NOW - 12 * DAY });
    const { log } = applyGrade(card, 'unknown', NOW, { mode: 'typing', random: noFuzz });

    expect(log).toMatchObject({
      cardId: 'card-1',
      wordId: 'word-1',
      grade: 'unknown',
      mode: 'typing',
      intervalBefore: 10,
      easeBefore: 2.5,
      reviewedAt: NOW,
    });
    expect(log.easeAfter).toBeCloseTo(2.3, 10);
    expect(log.elapsedDays).toBeCloseTo(12, 10);
  });
});

describe('immuabilité', () => {
  it('ne modifie jamais la carte reçue', () => {
    const card = reviewCard();
    const snapshot = { ...card };
    applyGrade(card, 'known', NOW, { random: noFuzz });
    expect(card).toEqual(snapshot);
  });
});

describe('describeNextDue', () => {
  it('formule l’échéance en français', () => {
    expect(describeNextDue({ ...reviewCard(), state: 'learning', due: NOW + 10 * MINUTE }, NOW)).toBe(
      'dans 10 min',
    );
    expect(describeNextDue({ ...reviewCard(), due: NOW + DAY }, NOW)).toBe('demain');
    expect(describeNextDue({ ...reviewCard(), due: NOW + 6 * DAY }, NOW)).toBe('dans 6 jours');
    expect(describeNextDue({ ...reviewCard(), due: NOW + 90 * DAY }, NOW)).toBe('dans 3 mois');
  });
});
