import { useCallback, useEffect, useState } from 'react';
import { ImageSearchError, searchImages } from '../data/openverse';
import type { ImageCandidate } from '../domain/images';

interface ImagePickerProps {
  initialQuery: string;
  onPick: (candidate: ImageCandidate) => void;
  onClose: () => void;
}

/**
 * Recherche dans Openverse : uniquement des images sous licence libre, chacune
 * affichée avec son crédit pour qu'on sache ce que l'on retient.
 */
export default function ImagePicker({ initialQuery, onPick, onClose }: ImagePickerProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ImageCandidate[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (term: string) => {
    if (!term.trim()) return;
    setStatus('loading');
    setError(null);
    try {
      setResults(await searchImages(term));
      setStatus('done');
    } catch (failure) {
      setResults([]);
      setStatus('done');
      setError(
        failure instanceof ImageSearchError
          ? failure.message
          : 'La recherche d’images a échoué.',
      );
    }
  }, []);

  useEffect(() => {
    void run(initialQuery);
  }, [run, initialQuery]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Choisir une image">
      <div className="modal__panel">
        <div className="row row--between">
          <h2 className="modal__title">Choisir une image</h2>
          <button className="btn btn--ghost" onClick={onClose}>
            Fermer
          </button>
        </div>

        <form
          className="toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            void run(query);
          }}
        >
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Que cherches-tu ?"
            aria-label="Terme de recherche"
            autoComplete="off"
          />
          <button className="btn btn--primary" type="submit" disabled={status === 'loading'}>
            Chercher
          </button>
        </form>

        {error && <p className="notice">{error}</p>}

        {status === 'loading' && <p className="empty">Recherche…</p>}

        {status === 'done' && !error && results.length === 0 && (
          <p className="empty">Aucune image libre pour ce terme. Essaie un mot plus courant.</p>
        )}

        <div className="picker-grid">
          {results.map((candidate) => (
            <button
              key={candidate.source.id}
              type="button"
              className="picker-item"
              onClick={() => onPick(candidate)}
            >
              <img src={candidate.thumbnail} alt="" loading="lazy" />
              <span className="picker-item__credit">
                {candidate.source.creator || 'auteur inconnu'} · {candidate.source.license.toUpperCase()}
              </span>
            </button>
          ))}
        </div>

        <p className="small muted" style={{ marginBottom: 0 }}>
          Images sous licence libre fournies par Openverse. L’auteur et la licence sont
          conservés avec l’image.
        </p>
      </div>
    </div>
  );
}
