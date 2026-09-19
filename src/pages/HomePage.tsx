import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../app/store';
import { summarizeDue } from '../domain/session';
import { LANGUAGES, languageLabel } from '../domain/languages';

export default function HomePage() {
  const { words, cards, settings, counts } = useStore();
  const [lang, setLang] = useState<string>('all');

  const langsInUse = useMemo(() => {
    const used = new Set(words.map((word) => word.lang));
    return LANGUAGES.filter((language) => used.has(language.code));
  }, [words]);

  const scopedCards = useMemo(() => {
    if (lang === 'all') return cards;
    const ids = new Set(words.filter((word) => word.lang === lang).map((word) => word.id));
    return cards.filter((card) => ids.has(card.wordId));
  }, [cards, words, lang]);

  const summary = useMemo(
    () => summarizeDue(scopedCards, Date.now(), settings, counts),
    [scopedCards, settings, counts],
  );

  const learned = cards.filter((card) => card.state === 'review' && !card.suspended).length;

  if (words.length === 0) {
    return (
      <>
        <h1 className="page-title">Bienvenue</h1>
        <section className="panel">
          <p>
            Ta bibliothèque est vide. Ajoute un premier mot et il te sera proposé à la révision
            immédiatement, puis de plus en plus espacé à mesure que tu le retiens.
          </p>
          <Link className="btn btn--primary btn--block" to="/ajouter" style={{ marginTop: 14 }}>
            Ajouter mon premier mot
          </Link>
        </section>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">Aujourd’hui</h1>

      {langsInUse.length > 1 && (
        <div className="toolbar">
          <select
            className="select"
            value={lang}
            onChange={(event) => setLang(event.target.value)}
            aria-label="Langue à réviser"
          >
            <option value="all">Toutes les langues</option>
            {langsInUse.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <section className="panel hero">
        <div className="hero__count">{summary.total}</div>
        <p className="hero__label">
          {summary.total === 0
            ? 'Rien à réviser pour le moment'
            : `carte${summary.total > 1 ? 's' : ''} à réviser${
                lang === 'all' ? '' : ` en ${languageLabel(lang).toLowerCase()}`
              }`}
        </p>
        {summary.total > 0 ? (
          <Link
            className="btn btn--primary btn--block"
            to={lang === 'all' ? '/seance' : `/seance?lang=${lang}`}
          >
            Commencer la séance
          </Link>
        ) : (
          <p className="small muted">
            Reviens plus tard, ou ajoute de nouveaux mots pour alimenter tes prochaines séances.
          </p>
        )}
        {summary.total > 0 && (
          <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
            {summary.due} à revoir · {summary.fresh} nouvelle{summary.fresh > 1 ? 's' : ''}
          </p>
        )}
      </section>

      <div className="stat-row">
        <div className="stat">
          <div className="stat__value">{words.length}</div>
          <div className="stat__label">mots</div>
        </div>
        <div className="stat">
          <div className="stat__value">{learned}</div>
          <div className="stat__label">cartes apprises</div>
        </div>
        <div className="stat">
          <div className="stat__value">{counts.reviewsDone + counts.newIntroduced}</div>
          <div className="stat__label">révisées aujourd’hui</div>
        </div>
      </div>
    </>
  );
}
