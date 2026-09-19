/** Verdict d'une réponse tapée. `close` : bon mot, écriture approximative. */
export type AnswerVerdict = 'exact' | 'close' | 'wrong';

/** Sépare les variantes acceptables : « chat, matou » ou « to run / to jog ». */
export function acceptedAnswers(expected: string): string[] {
  return expected
    .split(/[,;/]|\bou\b/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

/** Version indulgente : sans accents ni ponctuation, pour tolérer une frappe pressée. */
function loosen(value: string): string {
  return normalize(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compare une réponse tapée à la réponse attendue. Toute variante listée dans la
 * traduction est acceptée : avoir écrit « matou » pour « chat, matou » est juste.
 */
export function checkTypedAnswer(expected: string, typed: string): AnswerVerdict {
  const candidates = acceptedAnswers(expected);
  const answer = normalize(typed);
  if (!answer) return 'wrong';

  if (candidates.some((candidate) => normalize(candidate) === answer)) return 'exact';

  const loose = loosen(typed);
  if (loose && candidates.some((candidate) => loosen(candidate) === loose)) return 'close';

  return 'wrong';
}
