import type { Card, CardState, Direction, Grade, ReviewLog, ReviewMode } from './types';

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;

/** Paliers d'apprentissage, en minutes, parcourus à l'intérieur d'une séance. */
export const LEARNING_STEPS_MINUTES = [1, 10] as const;
/** Intervalle obtenu à la sortie des paliers. */
export const GRADUATING_INTERVAL_DAYS = 1;
/** Intervalle de la deuxième révision réussie. */
export const SECOND_INTERVAL_DAYS = 6;
export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
/** Pénalité de facilité appliquée à chaque oubli d'une carte déjà apprise. */
export const LAPSE_EASE_PENALTY = 0.2;
/** Dispersion appliquée aux intervalles d'au moins deux jours. */
export const FUZZ_RATIO = 0.05;

/** Au-delà de ce délai, une carte n'est plus reprogrammée dans la séance en cours. */
export const IN_SESSION_HORIZON_MS = 20 * MINUTE;

export function createCard(wordId: string, direction: Direction, now: number, id: string): Card {
  return {
    id,
    wordId,
    direction,
    state: 'new',
    due: now,
    interval: 0,
    ease: DEFAULT_EASE,
    repetitions: 0,
    lapses: 0,
    step: 0,
    suspended: false,
  };
}

/**
 * Disperse un intervalle de ±5 % pour éviter que toutes les cartes ajoutées le
 * même jour ne reviennent éternellement groupées. Sans effet sous deux jours.
 */
export function fuzzInterval(days: number, random: () => number = Math.random): number {
  if (days < 2) return days;
  const spread = days * FUZZ_RATIO;
  const fuzzed = days + (random() * 2 - 1) * spread;
  return Math.max(2, Math.round(fuzzed));
}

function isLearningState(state: CardState): boolean {
  return state === 'new' || state === 'learning' || state === 'relearning';
}

function elapsedDaysSince(card: Card, now: number): number {
  if (card.lastReviewedAt === undefined) return 0;
  return Math.max(0, (now - card.lastReviewedAt) / DAY);
}

export interface GradeResult {
  card: Card;
  log: Omit<ReviewLog, 'id'>;
}

/**
 * Applique une réponse à une carte et retourne sa nouvelle version ainsi que la
 * ligne de journal correspondante. Fonction pure : aucune dépendance au stockage,
 * l'instant et l'aléa sont injectés.
 *
 * « Passer » ne passe pas par ici : ce choix n'écrit rien et ne modifie aucun planning.
 */
export function applyGrade(
  card: Card,
  grade: Grade,
  now: number,
  options: { mode?: ReviewMode; random?: () => number } = {},
): GradeResult {
  const { mode = 'reveal', random = Math.random } = options;
  const easeBefore = card.ease;
  const intervalBefore = card.interval;
  const elapsedDays = elapsedDaysSince(card, now);

  const next: Card = { ...card, lastReviewedAt: now };

  if (grade === 'known') {
    if (isLearningState(card.state)) {
      if (card.step < LEARNING_STEPS_MINUTES.length) {
        // Encore un palier à franchir : la carte repasse dans la séance.
        const delay = LEARNING_STEPS_MINUTES[card.step]!;
        next.state = 'learning';
        next.step = card.step + 1;
        next.due = now + delay * MINUTE;
      } else {
        // Sortie des paliers.
        next.state = 'review';
        next.step = 0;
        next.repetitions = card.repetitions + 1;
        next.interval = GRADUATING_INTERVAL_DAYS;
        next.due = now + GRADUATING_INTERVAL_DAYS * DAY;
      }
    } else {
      const repetitions = card.repetitions + 1;
      const interval =
        repetitions <= 1
          ? GRADUATING_INTERVAL_DAYS
          : repetitions === 2
            ? SECOND_INTERVAL_DAYS
            : Math.max(1, Math.round(card.interval * card.ease));
      const scheduled = fuzzInterval(interval, random);
      next.repetitions = repetitions;
      next.interval = scheduled;
      next.due = now + scheduled * DAY;
      // La facilité ne bouge pas : « je savais » équivaut à la note 4 de SM-2.
    }
  } else if (card.state === 'review') {
    // Oubli d'une carte déjà apprise : c'est le seul cas qui coûte de la facilité.
    next.state = 'relearning';
    next.lapses = card.lapses + 1;
    next.ease = Math.max(MIN_EASE, card.ease - LAPSE_EASE_PENALTY);
    next.repetitions = 0;
    next.interval = GRADUATING_INTERVAL_DAYS;
    next.step = 1;
    next.due = now + LEARNING_STEPS_MINUTES[0]! * MINUTE;
  } else {
    // Oubli pendant l'apprentissage : retour au premier palier, sans pénalité.
    next.state = card.state === 'new' ? 'learning' : card.state;
    next.step = 1;
    next.due = now + LEARNING_STEPS_MINUTES[0]! * MINUTE;
  }

  return {
    card: next,
    log: {
      cardId: card.id,
      wordId: card.wordId,
      reviewedAt: now,
      grade,
      mode,
      intervalBefore,
      intervalAfter: next.interval,
      easeBefore,
      easeAfter: next.ease,
      elapsedDays,
    },
  };
}

/** Vrai si la carte doit être re-présentée avant la fin de la séance en cours. */
export function returnsInSession(card: Card, now: number): boolean {
  return isLearningState(card.state) && card.due - now <= IN_SESSION_HORIZON_MS;
}

/** Description lisible de la prochaine échéance, pour l'interface. */
export function describeNextDue(card: Card, now: number): string {
  const delta = card.due - now;
  if (delta <= IN_SESSION_HORIZON_MS && isLearningState(card.state)) {
    const minutes = Math.max(1, Math.round(delta / MINUTE));
    return `dans ${minutes} min`;
  }
  const days = Math.max(1, Math.round(delta / DAY));
  if (days === 1) return 'demain';
  if (days < 30) return `dans ${days} jours`;
  const months = Math.round(days / 30);
  if (months < 12) return `dans ${months} mois`;
  const years = (days / 365).toFixed(1).replace('.0', '');
  return `dans ${years} an${Number(years) >= 2 ? 's' : ''}`;
}
