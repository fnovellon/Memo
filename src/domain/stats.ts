import type { Card, DailyCounts, ReviewLog } from './types';
import { DAY } from './scheduler';

/** Clé de journée locale, identique à celle utilisée par le stockage. */
export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export interface DayBucket {
  date: string;
  /** Décalage en jours par rapport à aujourd'hui : 0 = aujourd'hui, -1 = hier. */
  offset: number;
  count: number;
}

/**
 * Nombre de jours consécutifs travaillés, en terminant aujourd'hui.
 *
 * Une journée encore vide ne casse pas la série : tant qu'hier est travaillé, la
 * série court toujours — sinon l'utilisateur la verrait tomber à zéro chaque matin.
 */
export function computeStreak(records: DailyCounts[], now: number): number {
  const worked = new Set(
    records.filter((record) => record.newIntroduced + record.reviewsDone > 0).map((r) => r.date),
  );
  if (worked.size === 0) return 0;

  const today = startOfDay(now);
  let cursor = worked.has(dayKey(today)) ? today : today - DAY;
  if (!worked.has(dayKey(cursor))) return 0;

  let streak = 0;
  while (worked.has(dayKey(cursor))) {
    streak += 1;
    cursor -= DAY;
  }
  return streak;
}

/** Les `days` derniers jours, aujourd'hui compris, y compris les journées vides. */
export function reviewHistory(records: DailyCounts[], now: number, days: number): DayBucket[] {
  const byDate = new Map(records.map((record) => [record.date, record]));
  const today = startOfDay(now);
  const buckets: DayBucket[] = [];

  for (let offset = -(days - 1); offset <= 0; offset += 1) {
    const date = dayKey(today + offset * DAY);
    const record = byDate.get(date);
    buckets.push({
      date,
      offset,
      count: record ? record.newIntroduced + record.reviewsDone : 0,
    });
  }
  return buckets;
}

/**
 * Charge à venir : combien de cartes arrivent à échéance chaque jour.
 * Tout ce qui est déjà en retard est compté sur aujourd'hui — c'est là qu'il faudra
 * le traiter.
 */
export function reviewForecast(cards: Card[], now: number, days: number): DayBucket[] {
  const today = startOfDay(now);
  const buckets: DayBucket[] = Array.from({ length: days }, (_, offset) => ({
    date: dayKey(today + offset * DAY),
    offset,
    count: 0,
  }));

  for (const card of cards) {
    if (card.suspended || card.state === 'new') continue;
    const offset = Math.max(0, Math.floor((startOfDay(card.due) - today) / DAY));
    if (offset >= days) continue;
    buckets[offset]!.count += 1;
  }
  return buckets;
}

export interface StateBreakdown {
  fresh: number;
  learning: number;
  learned: number;
  suspended: number;
}

export function breakdownByState(cards: Card[]): StateBreakdown {
  const breakdown: StateBreakdown = { fresh: 0, learning: 0, learned: 0, suspended: 0 };
  for (const card of cards) {
    if (card.suspended) breakdown.suspended += 1;
    else if (card.state === 'new') breakdown.fresh += 1;
    else if (card.state === 'review') breakdown.learned += 1;
    else breakdown.learning += 1;
  }
  return breakdown;
}

/** Part de réponses « je savais » sur la période, en pourcentage entier. */
export function successRate(logs: ReviewLog[], since: number): number | null {
  const recent = logs.filter((log) => log.reviewedAt >= since);
  if (recent.length === 0) return null;
  const known = recent.filter((log) => log.grade === 'known').length;
  return Math.round((known / recent.length) * 100);
}

/** Intervalle en jours au-delà duquel on rappelle qu'aucune sauvegarde n'a été faite. */
export const BACKUP_REMINDER_DAYS = 14;

/**
 * Les données ne vivent que dans ce navigateur : passé un certain volume, ne jamais
 * avoir exporté devient un vrai risque, et c'est le moment de le dire.
 */
export function shouldRemindBackup(
  lastExportAt: number | null | undefined,
  wordCount: number,
  now: number,
): boolean {
  if (wordCount < 10) return false;
  if (!lastExportAt) return true;
  return now - lastExportAt > BACKUP_REMINDER_DAYS * DAY;
}
