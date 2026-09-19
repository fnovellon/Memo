import { useRef, useState, type FormEvent } from 'react';
import { useStore } from '../app/store';
import ImagePicker from '../components/ImagePicker';
import { LANGUAGES, needsReading } from '../domain/languages';
import { suggestQuery, type ImageCandidate } from '../domain/images';
import { findDuplicate } from '../data/repository';

export default function AddWordPage() {
  const { settings, updateSettings, addWord, setWordImage } = useStore();
  const [lang, setLang] = useState(settings.lastLang);
  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  const [reading, setReading] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<ImageCandidate | null>(null);
  const [picking, setPicking] = useState(false);
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

      const word = await addWord({
        lang,
        term: cleanTerm,
        translation: cleanTranslation,
        ...(showReading && reading.trim() ? { reading: reading.trim() } : {}),
      });
      if (lang !== settings.lastLang) await updateSettings({ lastLang: lang });

      // Le mot est déjà enregistré : si l'image échoue, on le dit sans le perdre.
      let imageFailed = false;
      if (image) {
        try {
          await setWordImage(word.id, image);
        } catch {
          imageFailed = true;
        }
      }

      setNotice(
        imageFailed
          ? { kind: 'warn', text: `« ${cleanTerm} » ajouté, mais l’image n’a pas pu être enregistrée.` }
          : { kind: 'ok', text: `« ${cleanTerm} » ajouté.` },
      );
      setTerm('');
      setTranslation('');
      setReading('');
      setImage(null);
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

        <div className="image-field">
          {image ? (
            <>
              <img src={image.thumbnail} alt="" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="small">Image choisie</div>
                <div className="small muted">
                  {image.source.creator || 'auteur inconnu'} ·{' '}
                  {image.source.license.toUpperCase()}
                </div>
              </div>
              <button className="btn btn--ghost" type="button" onClick={() => setImage(null)}>
                Retirer
              </button>
            </>
          ) : (
            <button
              className="btn btn--ghost btn--block"
              type="button"
              onClick={() => setPicking(true)}
              disabled={!term.trim() && !translation.trim()}
            >
              Ajouter une image (facultatif)
            </button>
          )}
        </div>

        <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
          Ajouter
        </button>
        <p className="small muted" style={{ marginBottom: 0, marginTop: 12 }}>
          Chaque mot crée deux cartes : une pour le reconnaître, une pour le produire.
        </p>
      </form>

      {picking && (
        <ImagePicker
          initialQuery={suggestQuery(translation, term)}
          onPick={(candidate) => {
            setImage(candidate);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}
