import type { Card, DailyCounts, Settings } from './types';

/** Nombre minimal de cartes intercalées avant de re-présenter une carte en apprentissage. */
export const REQUEUE_GAP = 3;

export interface SessionQuotas {
  newPerDay: Settings['newPerDay'];
  reviewsPerDay: Settings['reviewsPerDay'];
}

export interface SessionPlan {
  /** Les cartes de la séance, dans l'ordre de présentation. */
  order: string[];
  dueCount: number;
  newCount: number;
}

/**
 * Compose la séance du jour : d'abord ce qui est en retard, puis ce qui est dû,
 * puis les nouvelles cartes — le tout borné par les quotas journaliers.
 *
 * Fonction pure. Le filtrage par langue, s'il y en a un, est fait par l'appelant.
 */
export function buildSessionPlan(
  cards: Card[],
  now: number,
  quotas: SessionQuotas,
  counts: DailyCounts,
): SessionPlan {
  const available = cards.filter((card) => !card.suspended);

  const reviewBudget = Math.max(0, quotas.reviewsPerDay - counts.reviewsDone);
  const newBudget = Math.max(0, quotas.newPerDay - counts.newIntroduced);

  const due = available
    .filter((card) => card.state !== 'new' && card.due <= now)
    .sort((a, b) => a.due - b.due)
    .slice(0, reviewBudget);

  const fresh = available
    .filter((card) => card.state === 'new')
    .sort((a, b) => a.due - b.due)
    .slice(0, newBudget);

  const order = spaceOutSameWord(interleave(due, fresh)).map((card) => card.id);

  return { order, dueCount: due.length, newCount: fresh.length };
}

/** Répartit les nouvelles cartes régulièrement parmi les révisions, au lieu d'un bloc en tête. */
function interleave(reviews: Card[], fresh: Card[]): Card[] {
  if (fresh.length === 0) return reviews;
  if (reviews.length === 0) return fresh;

  const total = reviews.length + fresh.length;
  const out: Card[] = [];
  let reviewIndex = 0;
  let freshIndex = 0;

  for (let slot = 0; slot < total; slot += 1) {
    const freshExpected = Math.round(((slot + 1) * fresh.length) / total);
    if (freshIndex < freshExpected && freshIndex < fresh.length) {
      out.push(fresh[freshIndex]!);
      freshIndex += 1;
    } else if (reviewIndex < reviews.length) {
      out.push(reviews[reviewIndex]!);
      reviewIndex += 1;
    } else {
      out.push(fresh[freshIndex]!);
      freshIndex += 1;
    }
  }
  return out;
}

/**
 * Évite que les deux cartes d'un même mot ne se suivent : voir la traduction juste
 * après avoir vu le mot rendrait la seconde carte gratuite.
 */
function spaceOutSameWord(cards: Card[]): Card[] {
  const out = [...cards];
  for (let i = 1; i < out.length; i += 1) {
    if (out[i]!.wordId !== out[i - 1]!.wordId) continue;
    const swapWith = out.findIndex(
      (candidate, index) =>
        index > i &&
        candidate.wordId !== out[i - 1]!.wordId &&
        (index + 1 >= out.length || out[index + 1]!.wordId !== out[i]!.wordId),
    );
    if (swapWith !== -1) {
      [out[i], out[swapWith]] = [out[swapWith]!, out[i]!];
    }
  }
  return out;
}

/** Réinsère une carte en apprentissage quelques cartes plus loin dans la file. */
export function requeue(order: string[], cardId: string): string[] {
  const next = order.filter((id) => id !== cardId);
  const position = Math.min(REQUEUE_GAP, next.length);
  next.splice(position, 0, cardId);
  return next;
}

/** « Passer » : la carte repart en fin de file, sans aucune autre conséquence. */
export function sendToBack(order: string[], cardId: string): string[] {
  const next = order.filter((id) => id !== cardId);
  next.push(cardId);
  return next;
}

export interface DueSummary {
  due: number;
  fresh: number;
  total: number;
}

/** Ce que l'accueil annonce : le volume réellement proposé aujourd'hui, quotas compris. */
export function summarizeDue(
  cards: Card[],
  now: number,
  quotas: SessionQuotas,
  counts: DailyCounts,
): DueSummary {
  const plan = buildSessionPlan(cards, now, quotas, counts);
  return { due: plan.dueCount, fresh: plan.newCount, total: plan.order.length };
}
