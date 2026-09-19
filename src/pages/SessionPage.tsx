import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../app/store';
import { buildSessionPlan, requeue, sendToBack } from '../domain/session';
import { describeNextDue, returnsInSession } from '../domain/scheduler';
import { checkTypedAnswer, type AnswerVerdict } from '../domain/answerCheck';
import { getLanguage } from '../domain/languages';
import { useWordImage } from '../app/useWordImage';
import type { Grade, Word } from '../domain/types';

interface Tally {
  known: number;
  unknown: number;
}

const VERDICT_LABEL: Record<AnswerVerdict, string> = {
  exact: 'Exact',
  close: 'Juste, à l’accent près',
  wrong: 'Ce n’est pas ça',
};

export default function SessionPage() {
  const { cards, words, wordsById, cardsById, settings, counts, answer } = useStore();
  const [params] = useSearchParams();
  const lang = params.get('lang');
  const typingMode = settings.typingMode;

  const scopedCards = useMemo(() => {
    if (!lang) return cards;
    const ids = new Set(words.filter((word) => word.lang === lang).map((word) => word.id));
    return cards.filter((card) => ids.has(card.wordId));
  }, [cards, words, lang]);

  // La file est figée à l'ouverture : répondre modifie les cartes, mais ne doit pas
  // recomposer la séance en cours sous les pieds de l'utilisateur.
  const [order, setOrder] = useState<string[]>(
    () => buildSessionPlan(scopedCards, Date.now(), settings, counts).order,
  );
  const [initialCount] = useState(() => order.length);
  const [revealed, setRevealed] = useState(false);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [tally, setTally] = useState<Tally>({ known: 0, unknown: 0 });
  const [lastOutcome, setLastOutcome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const [verdict, setVerdict] = useState<AnswerVerdict | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentId = order[0];
  const card = currentId ? cardsById.get(currentId) : undefined;
  const word = card ? wordsById.get(card.wordId) : undefined;
  const isRecognition = card?.direction === 'recognition';
  const expected = word ? (isRecognition ? word.translation : word.term) : '';
  // Chargée dès que la carte change, affichée seulement à la révélation : pas de
  // temps d'attente au moment où l'on retourne la carte.
  const illustration = useWordImage(word?.id);

  const nextCard = useCallback(() => {
    setRevealed(false);
    setTyped('');
    setVerdict(null);
  }, []);

  // Le champ reprend la main à chaque nouvelle carte, pour enchaîner sans souris.
  useEffect(() => {
    if (typingMode && !revealed) inputRef.current?.focus();
  }, [typingMode, revealed, currentId]);

  const handleAnswer = useCallback(
    async (grade: Grade) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        const updated = await answer(card, grade, verdict === null ? 'reveal' : 'typing');
        setTally((previous) =>
          grade === 'known'
            ? { ...previous, known: previous.known + 1 }
            : { ...previous, unknown: previous.unknown + 1 },
        );
        const returning = returnsInSession(updated, Date.now());
        setOrder((previous) =>
          returning ? requeue(previous, updated.id) : previous.filter((id) => id !== updated.id),
        );
        setLastOutcome(
          returning
            ? 'à revoir dans cette séance'
            : `prochaine fois ${describeNextDue(updated, Date.now())}`,
        );
        nextCard();
      } finally {
        setBusy(false);
      }
    },
    [card, busy, answer, verdict, nextCard],
  );

  const handleSkip = useCallback(() => {
    if (!card || order.length < 2) return;
    setSkipped((previous) => new Set(previous).add(card.id));
    setOrder((previous) => sendToBack(previous, card.id));
    setLastOutcome(null);
    nextCard();
  }, [card, order.length, nextCard]);

  function handleCheck(event: FormEvent) {
    event.preventDefault();
    if (!typed.trim()) return;
    setVerdict(checkTypedAnswer(expected, typed));
    setRevealed(true);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;
      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        setRevealed(true);
        return;
      }
      if (!revealed) return;
      if (event.key === '1') void handleAnswer('known');
      if (event.key === '2') void handleAnswer('unknown');
      if (event.key === '3') handleSkip();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [revealed, handleAnswer, handleSkip]);

  if (initialCount === 0) {
    return (
      <section className="panel empty">
        <p>Rien à réviser pour le moment.</p>
        <Link className="btn" to="/">
          Retour à l’accueil
        </Link>
      </section>
    );
  }

  if (!card || !word) return <SessionSummary tally={tally} />;

  const remaining = new Set(order).size;
  const progress = Math.round(((initialCount - remaining) / initialCount) * 100);
  const target = getLanguage(word.lang);
  const direction = isRecognition ? `${target.label} → Français` : `Français → ${target.label}`;
  const alreadySkipped = skipped.has(card.id);

  return (
    <section className="session">
      <div className="session__bar">
        <span>{remaining} restantes</span>
        <div className="progress">
          <div className="progress__fill" style={{ width: `${progress}%` }} />
        </div>
        <Link to="/" className="small">
          Arrêter
        </Link>
      </div>

      {revealed ? (
        <div className="flashcard">
          <span className="flashcard__tag">{direction}</span>
          <PromptText word={word} recognition={isRecognition} />
          {verdict && (
            <span className={`verdict verdict--${verdict}`}>
              {VERDICT_LABEL[verdict]}
              {verdict === 'wrong' && typed.trim() && (
                <span className="verdict__typed">tu as écrit « {typed.trim()} »</span>
              )}
            </span>
          )}
          <div className="flashcard__divider" />
          {isRecognition ? (
            <>
              {word.reading && <span className="flashcard__reading">{word.reading}</span>}
              <span className="flashcard__answer">{word.translation}</span>
            </>
          ) : (
            <>
              <span className="flashcard__answer" lang={target.htmlLang}>
                {word.term}
              </span>
              {word.reading && <span className="flashcard__reading">{word.reading}</span>}
            </>
          )}
          {illustration && (
            <figure className="card-image">
              <img src={illustration.url} alt="" />
              <figcaption className="card-image__credit">
                {illustration.image.attribution}
              </figcaption>
            </figure>
          )}
          {lastOutcome && <span className="flashcard__hint">{lastOutcome}</span>}
        </div>
      ) : typingMode ? (
        <div className="flashcard">
          <span className="flashcard__tag">{direction}</span>
          <PromptText word={word} recognition={isRecognition} />
        </div>
      ) : (
        <button
          type="button"
          className="flashcard"
          onClick={() => setRevealed(true)}
          aria-label="Révéler la traduction"
        >
          <span className="flashcard__tag">{direction}</span>
          <PromptText word={word} recognition={isRecognition} />
          <span className="flashcard__hint">Touche pour révéler</span>
        </button>
      )}

      {!revealed && typingMode && (
        <form className="typing" onSubmit={handleCheck}>
          <input
            ref={inputRef}
            className="input"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={isRecognition ? 'Traduction en français' : `Réponse en ${target.label.toLowerCase()}`}
            lang={isRecognition ? 'fr' : target.htmlLang}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Ta réponse"
          />
          <div className="row">
            <button className="btn btn--primary" type="submit" disabled={!typed.trim()}>
              Vérifier
            </button>
            <button className="btn btn--ghost" type="button" onClick={() => setRevealed(true)}>
              Je ne sais pas
            </button>
          </div>
        </form>
      )}

      {revealed && (
        <div className="answers">
          <button
            className="btn btn--known"
            onClick={() => void handleAnswer('known')}
            disabled={busy}
          >
            Je me suis rappelé
            <span className="btn__sub">1</span>
          </button>
          <button
            className="btn btn--unknown"
            onClick={() => void handleAnswer('unknown')}
            disabled={busy}
          >
            Je ne savais pas
            <span className="btn__sub">2</span>
          </button>
          <button
            className="btn btn--ghost answers__skip"
            onClick={handleSkip}
            disabled={busy || alreadySkipped || order.length < 2}
          >
            {alreadySkipped ? 'Déjà passé cette séance' : 'Passer'}
          </button>
        </div>
      )}
    </section>
  );
}

function PromptText({ word, recognition }: { word: Word; recognition: boolean }) {
  const target = getLanguage(word.lang);
  if (!recognition) return <span className="flashcard__prompt">{word.translation}</span>;
  return (
    <span
      className={
        target.needsReading ? 'flashcard__prompt flashcard__prompt--cjk' : 'flashcard__prompt'
      }
      lang={target.htmlLang}
    >
      {word.term}
    </span>
  );
}

function SessionSummary({ tally }: { tally: Tally }) {
  const total = tally.known + tally.unknown;
  const rate = total === 0 ? 0 : Math.round((tally.known / total) * 100);

  return (
    <section className="panel hero">
      <div className="hero__count">✓</div>
      <p className="hero__label">Séance terminée</p>
      <div className="stat-row" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="stat__value">{total}</div>
          <div className="stat__label">réponses</div>
        </div>
        <div className="stat">
          <div className="stat__value">{tally.known}</div>
          <div className="stat__label">su</div>
        </div>
        <div className="stat">
          <div className="stat__value">{rate}%</div>
          <div className="stat__label">réussite</div>
        </div>
      </div>
      <Link className="btn btn--primary btn--block" to="/">
        Retour à l’accueil
      </Link>
    </section>
  );
}
