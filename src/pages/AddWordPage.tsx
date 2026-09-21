import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../app/store';
import ImagePicker from '../components/ImagePicker';
import PhotoButton from '../components/PhotoButton';
import { LANGUAGES, needsReading } from '../domain/languages';
import {
  checkImageFile,
  describeImageRejection,
  suggestQuery,
  type ImageCandidate,
} from '../domain/images';
import { findDuplicate } from '../data/repository';

/**
 * Image retenue avant que le mot n'existe : elle n'est rattachée qu'une fois le
 * mot créé, puisqu'elle se range sous son identifiant.
 */
type PendingImage =
  | { kind: 'openverse'; candidate: ImageCandidate; previewUrl: string; credit: string }
  | { kind: 'photo'; file: File; previewUrl: string; credit: string };

export default function AddWordPage() {
  const { settings, updateSettings, addWord, setWordImage, setWordPhoto } = useStore();
  const [lang, setLang] = useState(settings.lastLang);
  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  const [reading, setReading] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<PendingImage | null>(null);
  const [picking, setPicking] = useState(false);
  const termRef = useRef<HTMLInputElement>(null);

  const showReading = needsReading(lang);

  // Une URL d'objet doit être libérée, sinon la photo reste en mémoire pour rien.
  useEffect(() => {
    if (image?.kind !== 'photo') return;
    const url = image.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function choosePhoto(file: File) {
    const rejection = checkImageFile(file);
    if (rejection) {
      setNotice({ kind: 'warn', text: describeImageRejection(rejection) });
      return;
    }
    setNotice(null);
    setImage({
      kind: 'photo',
      file,
      previewUrl: URL.createObjectURL(file),
      credit: 'Photo personnelle',
    });
  }

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
          if (image.kind === 'photo') await setWordPhoto(word.id, image.file);
          else await setWordImage(word.id, image.candidate);
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
              <img src={image.previewUrl} alt="" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="small">Image choisie</div>
                <div className="small muted">{image.credit}</div>
              </div>
              <button className="btn btn--ghost" type="button" onClick={() => setImage(null)}>
                Retirer
              </button>
            </>
          ) : (
            <div className="row" style={{ width: '100%' }}>
              <button
                className="btn btn--ghost"
                type="button"
                style={{ flex: 1 }}
                onClick={() => setPicking(true)}
                disabled={!term.trim() && !translation.trim()}
              >
                Chercher une image
              </button>
              <PhotoButton onPick={choosePhoto} className="btn btn--ghost" >
                Photo
              </PhotoButton>
            </div>
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
            setImage({
              kind: 'openverse',
              candidate,
              previewUrl: candidate.thumbnail,
              credit: `${candidate.source.creator || 'auteur inconnu'} · ${candidate.source.license.toUpperCase()}`,
            });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}
