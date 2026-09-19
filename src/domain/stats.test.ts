import { describe, expect, it } from 'vitest';
import {
  BACKUP_REMINDER_DAYS,
  breakdownByState,
  computeStreak,
  reviewForecast,
  reviewHistory,
  shouldRemindBackup,
  successRate,
} from './stats';
import { DAY, createCard } from './scheduler';
import type { Card, DailyCounts, ReviewLog } from './types';

const NOW = new Date(2026, 0, 15, 10, 0, 0).getTime();

function daily(date: string, reviewsDone = 1, newIntroduced = 0): DailyCounts {
  return { date, reviewsDone, newIntroduced };
}

function card(overrides: Partial<Card> = {}): Card {
  return { ...createCard('word', 'recognition', NOW, 'card'), ...overrides };
}

function log(grade: ReviewLog['grade'], reviewedAt: number): ReviewLog {
  return {
    id: `${grade}-${reviewedAt}`,
    cardId: 'card',
    wordId: 'word',
    reviewedAt,
    grade,
    mode: 'reveal',
    intervalBefore: 1,
    intervalAfter: 6,
    easeBefore: 2.5,
    easeAfter: 2.5,
    elapsedDays: 1,
  };
}

describe('série de jours', () => {
  it('compte les jours consécutifs en terminant aujourd’hui', () => {
    const records = [daily('2026-01-13'), daily('2026-01-14'), daily('2026-01-15')];
    expect(computeStreak(records, NOW)).toBe(3);
  });

  it('ne casse pas la série tant que la journée en cours n’est pas entamée', () => {
    const records = [daily('2026-01-13'), daily('2026-01-14')];
    expect(computeStreak(records, NOW)).toBe(2);
  });

  it('retombe à zéro après un jour sauté', () => {
    const records = [daily('2026-01-11'), daily('2026-01-12')];
    expect(computeStreak(records, NOW)).toBe(0);
  });

  it('ignore les journées enregistrées mais vides', () => {
    const records = [daily('2026-01-14'), daily('2026-01-15', 0, 0)];
    expect(computeStreak(records, NOW)).toBe(1);
  });

  it('vaut zéro sans aucun historique', () => {
    expect(computeStreak([], NOW)).toBe(0);
  });
});

describe('historique des révisions', () => {
  it('produit une case par jour, journées vides comprises', () => {
    const history = reviewHistory([daily('2026-01-15', 3, 2)], NOW, 7);
    expect(history).toHaveLength(7);
    expect(history.at(-1)).toEqual({ date: '2026-01-15', offset: 0, count: 5 });
    expect(history[0]).toEqual({ date: '2026-01-09', offset: -6, count: 0 });
  });
});

describe('prévision de charge', () => {
  it('range chaque carte sur son jour d’échéance', () => {
    const cards = [
      card({ id: 'a', state: 'review', due: NOW + DAY }),
      card({ id: 'b', state: 'review', due: NOW + DAY }),
      card({ id: 'c', state: 'review', due: NOW + 3 * DAY }),
    ];
    const forecast = reviewForecast(cards, NOW, 7);
    expect(forecast[1]!.count).toBe(2);
    expect(forecast[3]!.count).toBe(1);
  });

  it('reporte les cartes en retard sur aujourd’hui', () => {
    const cards = [card({ id: 'a', state: 'review', due: NOW - 10 * DAY })];
    expect(reviewForecast(cards, NOW, 7)[0]!.count).toBe(1);
  });

  it('laisse de côté les cartes neuves et suspendues', () => {
    const cards = [
      card({ id: 'a', state: 'new', due: NOW }),
      card({ id: 'b', state: 'review', due: NOW, suspended: true }),
    ];
    expect(reviewForecast(cards, NOW, 7).every((bucket) => bucket.count === 0)).toBe(true);
  });

  it('ignore ce qui tombe au-delà de la fenêtre', () => {
    const cards = [card({ id: 'a', state: 'review', due: NOW + 40 * DAY })];
    expect(reviewForecast(cards, NOW, 14).reduce((sum, b) => sum + b.count, 0)).toBe(0);
  });
});

describe('répartition des cartes', () => {
  it('sépare neuves, en cours, apprises et suspendues', () => {
    const cards = [
      card({ id: '1', state: 'new' }),
      card({ id: '2', state: 'learning' }),
      card({ id: '3', state: 'relearning' }),
      card({ id: '4', state: 'review' }),
      card({ id: '5', state: 'review', suspended: true }),
    ];
    expect(breakdownByState(cards)).toEqual({ fresh: 1, learning: 2, learned: 1, suspended: 1 });
  });
});

describe('taux de réussite', () => {
  it('ne compte que la période demandée', () => {
    const logs = [
      log('known', NOW - 40 * DAY),
      log('known', NOW - DAY),
      log('unknown', NOW - 2 * DAY),
    ];
    expect(successRate(logs, NOW - 30 * DAY)).toBe(50);
  });

  it('vaut null sans donnée plutôt que zéro', () => {
    expect(successRate([], NOW - 30 * DAY)).toBeNull();
  });
});

describe('rappel de sauvegarde', () => {
  it('se tait sur une bibliothèque encore petite', () => {
    expect(shouldRemindBackup(null, 9, NOW)).toBe(false);
  });

  it('alerte quand rien n’a jamais été exporté', () => {
    expect(shouldRemindBackup(null, 10, NOW)).toBe(true);
  });

  it('se tait après un export récent', () => {
    expect(shouldRemindBackup(NOW - 3 * DAY, 100, NOW)).toBe(false);
  });

  it('réapparaît quand l’export a vieilli', () => {
    expect(shouldRemindBackup(NOW - (BACKUP_REMINDER_DAYS + 1) * DAY, 100, NOW)).toBe(true);
  });
});
