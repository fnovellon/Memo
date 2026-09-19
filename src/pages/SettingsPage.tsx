import { useRef, useState, type ChangeEvent } from 'react';
import { useStore } from '../app/store';
import { APP_BUILD } from '../app/version';
import { createBackup, downloadBackup, restoreBackup } from '../data/backup';
import { BackupError, parseBackup } from '../domain/backup';
import type { Settings } from '../domain/types';

const THEMES: { value: Settings['theme']; label: string }[] = [
  { value: 'system', label: 'Système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

export default function SettingsPage() {
  const { settings, updateSettings, words, cards, reload } = useStore();
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setBusy(true);
    try {
      const now = Date.now();
      downloadBackup(await createBackup(now));
      await updateSettings({ lastExportAt: now });
      setNotice({ kind: 'ok', text: 'Sauvegarde téléchargée.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    try {
      const backup = parseBackup(await file.text());
      const confirmed = window.confirm(
        `Restaurer ${backup.words.length} mot(s) ? Tes ${words.length} mot(s) actuels et tout ` +
          'leur planning seront définitivement remplacés.',
      );
      if (!confirmed) return;

      await restoreBackup(backup);
      await reload();
      setNotice({ kind: 'ok', text: `${backup.words.length} mot(s) restaurés.` });
    } catch (error) {
      setNotice({
        kind: 'warn',
        text: error instanceof BackupError ? error.message : 'La restauration a échoué.',
      });
    } finally {
      setBusy(false);
    }
  }

  const lastExport = settings.lastExportAt
    ? new Date(settings.lastExportAt).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <>
      <h1 className="page-title">Réglages</h1>

      {notice && (
        <p className={notice.kind === 'ok' ? 'notice notice--ok' : 'notice'} role="status">
          {notice.text}
        </p>
      )}

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
          Séance
        </h2>
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.typingMode}
            onChange={(event) => void updateSettings({ typingMode: event.target.checked })}
          />
          <span>
            Mode écriture
            <span className="small muted" style={{ display: 'block' }}>
              Taper la réponse avant de la révéler. Plus lent, mais la mémorisation est plus
              profonde.
            </span>
          </span>
        </label>
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
          Sauvegarde
        </h2>
        <p className="small" style={{ marginTop: 0 }}>
          {words.length} mot{words.length > 1 ? 's' : ''} et {cards.length} carte
          {cards.length > 1 ? 's' : ''}, stockés uniquement dans ce navigateur. Vider les données
          de site les effacerait définitivement.
        </p>
        <div className="row">
          <button className="btn btn--primary" onClick={() => void handleExport()} disabled={busy}>
            Exporter
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
            Restaurer
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => void handleImport(event)}
        />
        <p className="small muted" style={{ marginBottom: 0, marginTop: 12 }}>
          {lastExport ? `Dernier export le ${lastExport}.` : 'Aucun export pour le moment.'}{' '}
          La restauration remplace tout le contenu ; elle ne fusionne pas.
        </p>
      </section>

      <p className="version">Memo {APP_BUILD}</p>
    </>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
