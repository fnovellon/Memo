import { useMemo, useState } from 'react';
import { useStore } from '../app/store';
import ImagePicker from '../components/ImagePicker';
import PhotoButton from '../components/PhotoButton';
import { useWordImage } from '../app/useWordImage';
import { LANGUAGES, getLanguage, needsReading } from '../domain/languages';
import { describeNextDue } from '../domain/scheduler';
import {
  checkImageFile,
  describeImageRejection,
  suggestQuery,
  type ImageCandidate,
} from '../domain/images';
import type { Word } from '../domain/types';

export default function LibraryPage() {
  const { words, cards, updateWord, deleteWord, setWordSuspended, hasImage } = useStore();
  const [query, setQuery] = useState('');
  const [lang, setLang] = useState('all');
  const [editing, setEditing] = useState<string | null>(null);

  const cardsByWord = useMemo(() => {
    const map = new Map<string, typeof cards>();
    for (const card of cards) {
      const list = map.get(card.wordId);
      if (list) list.push(card);
      else map.set(card.wordId, [card]);
    }
    return map;
  }, [cards]);

  const langsInUse = useMemo(() => {
    const used = new Set(words.map((word) => word.lang));
    return LANGUAGES.filter((language) => used.has(language.code));
  }, [words]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return words
      .filter((word) => (lang === 'all' ? true : word.lang === lang))
      .filter((word) =>
        needle
          ? word.term.toLocaleLowerCase().includes(needle) ||
            word.translation.toLocaleLowerCase().includes(needle) ||
            (word.reading?.toLocaleLowerCase().includes(needle) ?? false)
          : true,
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [words, query, lang]);

  async function handleDelete(word: Word) {
    const confirmed = window.confirm(
      `Supprimer « ${word.term} » ? Ses deux cartes et leur planning seront perdus.`,
    );
    if (confirmed) await deleteWord(word.id);
  }

  return (
    <>
      <h1 className="page-title">Bibliothèque</h1>

      <div className="toolbar">
        <input
          className="input"
          type="search"
          placeholder="Rechercher…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Rechercher un mot"
        />
        {langsInUse.length > 1 && (
          <select
            className="select"
            value={lang}
            onChange={(event) => setLang(event.target.value)}
            aria-label="Filtrer par langue"
          >
            <option value="all">Toutes</option>
            {langsInUse.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="empty">
          {words.length === 0 ? 'Aucun mot pour l’instant.' : 'Aucun résultat pour cette recherche.'}
        </p>
      ) : (
        <ul className="word-list">
          {visible.map((word) => {
            const wordCards = cardsByWord.get(word.id) ?? [];
            const suspended = wordCards.length > 0 && wordCards.every((card) => card.suspended);
            const next = wordCards
              .filter((card) => !card.suspended)
              .sort((a, b) => a.due - b.due)[0];

            return (
              <li key={word.id} className={suspended ? 'word word--suspended' : 'word'}>
                {editing === word.id ? (
                  <WordEditor
                    word={word}
                    onCancel={() => setEditing(null)}
                    onSave={async (updated) => {
                      await updateWord(updated);
                      setEditing(null);
                    }}
                  />
                ) : (
                  <>
                    <div className="word__row">
                      {hasImage(word.id) && <Thumbnail wordId={word.id} />}
                      <div className="word__body">
                        <div className="word__head">
                          <span className="word__term" lang={getLanguage(word.lang).htmlLang}>
                            {word.term}
                          </span>
                          <span className="word__translation">{word.translation}</span>
                        </div>
                        <div className="word__meta">
                          <span className="badge">{getLanguage(word.lang).label}</span>
                          {word.reading && <span>{word.reading}</span>}
                          <span>
                            {suspended
                              ? 'suspendu'
                              : next
                                ? `revu ${describeNextDue(next, Date.now())}`
                                : 'jamais vu'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="word__actions">
                      <button className="btn btn--ghost" onClick={() => setEditing(word.id)}>
                        Modifier
                      </button>
                      <button
                        className="btn btn--ghost"
                        onClick={() => void setWordSuspended(word.id, !suspended)}
                      >
                        {suspended ? 'Reprendre' : 'Suspendre'}
                      </button>
                      <button className="btn btn--danger" onClick={() => void handleDelete(word)}>
                        Supprimer
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Thumbnail({ wordId }: { wordId: string }) {
  const illustration = useWordImage(wordId);
  if (!illustration) return null;
  return <img className="word__thumb" src={illustration.url} alt="" />;
}

function WordEditor({
  word,
  onSave,
  onCancel,
}: {
  word: Word;
  onSave: (word: Word) => Promise<void>;
  onCancel: () => void;
}) {
  const { setWordImage, setWordPhoto, removeWordImage, hasImage } = useStore();
  const [term, setTerm] = useState(word.term);
  const [translation, setTranslation] = useState(word.translation);
  const [reading, setReading] = useState(word.reading ?? '');
  const [picking, setPicking] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const illustration = useWordImage(word.id, hasImage(word.id));

  async function pick(candidate: ImageCandidate) {
    setPicking(false);
    setImageError(null);
    try {
      await setWordImage(word.id, candidate);
    } catch {
      setImageError('L’image n’a pas pu être enregistrée.');
    }
  }

  async function pickPhoto(file: File) {
    const rejection = checkImageFile(file);
    if (rejection) {
      setImageError(describeImageRejection(rejection));
      return;
    }
    setImageError(null);
    try {
      await setWordPhoto(word.id, file);
    } catch {
      setImageError('Cette photo n’a pas pu être enregistrée.');
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          ...word,
          term,
          translation,
          ...(reading.trim() ? { reading: reading.trim() } : { reading: undefined }),
        });
      }}
    >
      <label className="field">
        <span className="field__label">Mot</span>
        <input className="input" value={term} onChange={(e) => setTerm(e.target.value)} required />
      </label>
      {needsReading(word.lang) && (
        <label className="field">
          <span className="field__label">Lecture</span>
          <input className="input" value={reading} onChange={(e) => setReading(e.target.value)} />
        </label>
      )}
      <label className="field">
        <span className="field__label">Traduction</span>
        <input
          className="input"
          value={translation}
          onChange={(e) => setTranslation(e.target.value)}
          required
        />
      </label>
      {imageError && <p className="notice">{imageError}</p>}

      <div className="image-field">
        {illustration ? (
          <>
            <img src={illustration.url} alt="" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="small muted">{illustration.image.attribution}</div>
            </div>
            <button className="btn btn--ghost" type="button" onClick={() => setPicking(true)}>
              Changer
            </button>
            <PhotoButton onPick={(file) => void pickPhoto(file)}>Photo</PhotoButton>
            <button
              className="btn btn--danger"
              type="button"
              onClick={() => void removeWordImage(word.id)}
            >
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
            >
              Chercher une image
            </button>
            <PhotoButton onPick={(file) => void pickPhoto(file)}>Photo</PhotoButton>
          </div>
        )}
      </div>

      <div className="row">
        <button className="btn btn--primary" type="submit">
          Enregistrer
        </button>
        <button className="btn btn--ghost" type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>

      {picking && (
        <ImagePicker
          initialQuery={suggestQuery(translation, term)}
          onPick={(candidate) => void pick(candidate)}
          onClose={() => setPicking(false)}
        />
      )}
    </form>
  );
}
