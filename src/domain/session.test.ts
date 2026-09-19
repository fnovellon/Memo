import { describe, expect, it } from 'vitest';
import { REQUEUE_GAP, buildSessionPlan, requeue, sendToBack, summarizeDue } from './session';
import { DAY, createCard } from './scheduler';
import type { Card, DailyCounts } from './types';

const NOW = Date.UTC(2026, 0, 15, 10, 0, 0);
const QUOTAS = { newPerDay: 20, reviewsPerDay: 150 };
const NO_COUNTS: DailyCounts = { date: '2026-01-15', newIntroduced: 0, reviewsDone: 0 };

function newCard(id: string, wordId = id, createdAt = NOW): Card {
  return createCard(wordId, 'recognition', createdAt, id);
}

function dueCard(id: string, dueAt: number, wordId = id): Card {
  return { ...newCard(id, wordId), state: 'review', due: dueAt, interval: 5, repetitions: 3 };
}

describe('composition de la séance', () => {
  it('ignore les cartes non échues et les cartes suspendues', () => {
    const cards = [
      dueCard('due', NOW - DAY),
      dueCard('future', NOW + DAY),
      { ...dueCard('suspended', NOW - DAY), suspended: true },
      { ...newCard('new-suspended'), suspended: true },
    ];

    expect(buildSessionPlan(cards, NOW, QUOTAS, NO_COUNTS).order).toEqual(['due']);
  });

  it('sert les cartes les plus en retard en premier', () => {
    const cards = [
      dueCard('hier', NOW - DAY),
      dueCard('la-semaine-derniere', NOW - 7 * DAY),
      dueCard('ce-matin', NOW - 3600_000),
    ];

    expect(buildSessionPlan(cards, NOW, QUOTAS, NO_COUNTS).order).toEqual([
      'la-semaine-derniere',
      'hier',
      'ce-matin',
    ]);
  });

  it('applique les quotas journaliers', () => {
    const cards = [
      ...Array.from({ length: 10 }, (_, i) => dueCard(`due-${i}`, NOW - DAY)),
      ...Array.from({ length: 10 }, (_, i) => newCard(`new-${i}`)),
    ];

    const plan = buildSessionPlan(cards, NOW, { newPerDay: 3, reviewsPerDay: 4 }, NO_COUNTS);
    expect(plan.dueCount).toBe(4);
    expect(plan.newCount).toBe(3);
    expect(plan.order).toHaveLength(7);
  });

  it('décompte ce qui a déjà été fait aujourd’hui', () => {
    const cards = [
      ...Array.from({ length: 10 }, (_, i) => dueCard(`due-${i}`, NOW - DAY)),
      ...Array.from({ length: 10 }, (_, i) => newCard(`new-${i}`)),
    ];

    const plan = buildSessionPlan(cards, NOW, { newPerDay: 5, reviewsPerDay: 5 }, {
      date: '2026-01-15',
      newIntroduced: 4,
      reviewsDone: 5,
    });
    expect(plan.newCount).toBe(1);
    expect(plan.dueCount).toBe(0);
  });

  it('répartit les nouvelles cartes au lieu de les grouper en tête', () => {
    const cards = [
      ...Array.from({ length: 8 }, (_, i) => dueCard(`due-${i}`, NOW - DAY)),
      ...Array.from({ length: 4 }, (_, i) => newCard(`new-${i}`)),
    ];

    const order = buildSessionPlan(cards, NOW, QUOTAS, NO_COUNTS).order;
    const positions = order
      .map((id, index) => (id.startsWith('new-') ? index : -1))
      .filter((index) => index !== -1);

    expect(positions).toHaveLength(4);
    // Étalées sur toute la séance, pas concentrées sur les premières places.
    expect(Math.max(...positions)).toBeGreaterThan(order.length / 2);
    expect(new Set(positions).size).toBe(4);
  });

  it('ne présente jamais les deux cartes d’un même mot l’une après l’autre', () => {
    const cards = [
      dueCard('chat-reco', NOW - DAY, 'chat'),
      dueCard('chat-prod', NOW - DAY, 'chat'),
      dueCard('chien-reco', NOW - DAY, 'chien'),
      dueCard('chien-prod', NOW - DAY, 'chien'),
    ];

    const order = buildSessionPlan(cards, NOW, QUOTAS, NO_COUNTS).order;
    const wordOf = new Map(cards.map((card) => [card.id, card.wordId]));

    for (let i = 1; i < order.length; i += 1) {
      expect(wordOf.get(order[i]!)).not.toBe(wordOf.get(order[i - 1]!));
    }
  });
});

describe('file de la séance', () => {
  it('réinsère une carte en apprentissage quelques cartes plus loin', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    expect(requeue(order, 'a')).toEqual(['b', 'c', 'd', 'a', 'e']);
  });

  it('place la carte en fin de file quand la séance est presque finie', () => {
    expect(requeue(['a', 'b'], 'a')).toEqual(['b', 'a']);
    expect(requeue(['a'], 'a')).toEqual(['a']);
  });

  it('respecte l’écart annoncé', () => {
    const order = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(requeue(order, 'a').indexOf('a')).toBe(REQUEUE_GAP);
  });

  it('« passer » renvoie la carte tout à la fin', () => {
    expect(sendToBack(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a']);
  });
});

describe('résumé de l’accueil', () => {
  it('annonce exactement ce que la séance proposera', () => {
    const cards = [
      ...Array.from({ length: 6 }, (_, i) => dueCard(`due-${i}`, NOW - DAY)),
      ...Array.from({ length: 6 }, (_, i) => newCard(`new-${i}`)),
    ];

    expect(summarizeDue(cards, NOW, { newPerDay: 2, reviewsPerDay: 3 }, NO_COUNTS)).toEqual({
      due: 3,
      fresh: 2,
      total: 5,
    });
  });
});
