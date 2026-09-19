import { useRef, useState, type FormEvent } from 'react';
import { useStore } from '../app/store';
import { LANGUAGES, needsReading } from '../domain/languages';
import { findDuplicate } from '../data/repository';

export default function AddWordPage() {
  const { settings, updateSettings, addWord } = useStore();
  const [lang, setLang] = useState(settings.lastLang);
  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  const [reading, setReading] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const termRef = useRef<HTMLInputElement>(null);

  const showReading = needsReading(lang);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    const cleanTerm = term.trim();
    const cleanTranslation = translation.trim();
    if (!cleanTerm || !cleanTranslation) return;

    setBusy(true);
    try {
      const duplicate = await findDuplicate(lang, cleanTerm);
      if (duplicate) {
        setNotice({
          kind: 'warn',
          text: `« ${duplicate.term} » est déjà dans ta bibliothèque (${duplicate.translation}).`,
        });
        return;
      }

      await addWord({
        lang,
        term: cleanTerm,
        translation: cleanTranslation,
        ...(showReading && reading.trim() ? { reading: reading.trim() } : {}),
      });
      if (lang !== settings.lastLang) await updateSettings({ lastLang: lang });

      setNotice({ kind: 'ok', text: `« ${cleanTerm} » ajouté.` });
      setTerm('');
      setTranslation('');
      setReading('');
      termRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="page-title">Ajouter un mot</h1>

      {notice && (
        <p className={notice.kind === 'ok' ? 'notice notice--ok' : 'notice'} role="status">
          {notice.text}
        </p>
      )}

      <form className="panel" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Langue</span>
          <select
            className="select"
            value={lang}
            onChange={(event) => setLang(event.target.value)}
          >
            {LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Mot ou expression</span>
          <input
            ref={termRef}
            className="input"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>

        {showReading && (
          <label className="field">
            <span className="field__label">Lecture (kana, pinyin, romaja) — facultatif</span>
            <input
              className="input"
              value={reading}
              onChange={(event) => setReading(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}

        <label className="field">
          <span className="field__label">Traduction en français</span>
          <input
            className="input"
            value={translation}
            onChange={(event) => setTranslation(event.target.value)}
            autoComplete="off"
            required
          />
        </label>

        <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
          Ajouter
        </button>
        <p className="small muted" style={{ marginBottom: 0, marginTop: 12 }}>
          Chaque mot crée deux cartes : une pour le reconnaître, une pour le produire.
        </p>
      </form>
    </>
  );
}
