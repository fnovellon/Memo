import { useStore } from '../app/store';
import type { Settings } from '../domain/types';

const THEMES: { value: Settings['theme']; label: string }[] = [
  { value: 'system', label: 'Système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

export default function SettingsPage() {
  const { settings, updateSettings, words, cards } = useStore();

  return (
    <>
      <h1 className="page-title">Réglages</h1>

      <section className="panel">
        <h2 className="field__label" style={{ marginBottom: 12 }}>
          Rythme quotidien
        </h2>
        <label className="field">
          <span className="field__label">Nouvelles cartes par jour</span>
          <input
            className="input"
            type="number"
            min={0}
            max={999}
            value={settings.newPerDay}
            onChange={(event) =>
              void updateSettings({ newPerDay: clamp(Number(event.target.value), 0, 999) })
            }
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field__label">Révisions maximum par jour</span>
          <input
            className="input"
            type="number"
            min={0}
            max={9999}
            value={settings.reviewsPerDay}
            onChange={(event) =>
              void updateSettings({ reviewsPerDay: clamp(Number(event.target.value), 0, 9999) })
            }
          />
        </label>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Ces plafonds lissent la charge : sans eux, une semaine d’absence produit une séance
          interminable au retour.
        </p>
      </section>

      <section className="panel">
        <h2 className="field__label" style={{ marginBottom: 12 }}>
          Apparence
        </h2>
        <div className="row">
          {THEMES.map((theme) => (
            <button
              key={theme.value}
              className={settings.theme === theme.value ? 'btn btn--primary' : 'btn'}
              onClick={() => void updateSettings({ theme: theme.value })}
              aria-pressed={settings.theme === theme.value}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="field__label" style={{ marginBottom: 12 }}>
          Tes données
        </h2>
        <p className="small" style={{ marginTop: 0 }}>
          {words.length} mot{words.length > 1 ? 's' : ''} et {cards.length} carte
          {cards.length > 1 ? 's' : ''}, stockés uniquement dans ce navigateur. Rien n’est envoyé
          sur un serveur.
        </p>
        <p className="small muted" style={{ marginBottom: 0 }}>
          L’export de sauvegarde arrive au prochain jalon. D’ici là, évite de vider les données de
          site de ce navigateur.
        </p>
      </section>
    </>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
