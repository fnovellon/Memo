import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../app/store';
import { PackError, fetchCatalogue, installPack } from '../data/packs';
import { glossLabel, type PackSummary } from '../domain/packs';
import { languageLabel } from '../domain/languages';
import type { ImportReport } from '../data/importer';

interface Outcome {
  packId: string;
  report: ImportReport;
}

export default function PacksPage() {
  const { settings, updateSettings, reload } = useStore();
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const catalogue = await fetchCatalogue();
        if (!cancelled) setPacks(catalogue);
      } catch (failure) {
        if (!cancelled) {
          setPacks([]);
          setError(failure instanceof PackError ? failure.message : 'Catalogue indisponible.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byLanguage = useMemo(() => {
    const groups = new Map<string, PackSummary[]>();
    for (const pack of packs ?? []) {
      const list = groups.get(pack.lang);
      if (list) list.push(pack);
      else groups.set(pack.lang, [pack]);
    }
    return [...groups.entries()];
  }, [packs]);

  async function install(pack: PackSummary) {
    setInstalling(pack.id);
    setError(null);
    setOutcome(null);
    try {
      const report = await installPack(pack);
      await reload();
      if (!settings.installedPacks.includes(pack.id)) {
        await updateSettings({ installedPacks: [...settings.installedPacks, pack.id] });
      }
      setOutcome({ packId: pack.id, report });
    } catch (failure) {
      setError(failure instanceof PackError ? failure.message : 'L’installation a échoué.');
    } finally {
      setInstalling(null);
    }
  }

  if (packs === null) return <p className="empty">Chargement du catalogue…</p>;

  return (
    <>
      <h1 className="page-title">Packs de vocabulaire</h1>

      {error && (
        <p className="notice" role="status">
          {error}
        </p>
      )}

      {packs.length === 0 && !error && <p className="empty">Aucun pack disponible.</p>}

      {byLanguage.map(([lang, group]) => (
        <section className="panel" key={lang}>
          <h2 className="field__label" style={{ marginBottom: 12 }}>
            {languageLabel(lang)}
          </h2>
          <ul className="pack-list">
            {group.map((pack) => {
              const installed = settings.installedPacks.includes(pack.id);
              const busy = installing === pack.id;
              return (
                <li className="pack" key={pack.id}>
                  <div className="pack__body">
                    <div className="pack__title">{pack.theme || pack.title}</div>
                    <div className="pack__meta">
                      {pack.count !== undefined && <span>{pack.count} mots</span>}
                      <span className={pack.glossLang === 'fr' ? 'badge' : 'badge badge--warn'}>
                        {glossLabel(pack.glossLang)}
                      </span>
                      {pack.remote && <span className="badge">dépôt externe</span>}
                    </div>
                    {outcome?.packId === pack.id && (
                      <div className="pack__report">
                        {outcome.report.imported} mot{outcome.report.imported > 1 ? 's' : ''} ajouté
                        {outcome.report.imported > 1 ? 's' : ''}
                        {outcome.report.skipped.duplicate > 0 &&
                          ` · ${outcome.report.skipped.duplicate} déjà présent${
                            outcome.report.skipped.duplicate > 1 ? 's' : ''
                          }`}
                      </div>
                    )}
                  </div>
                  <button
                    className={installed ? 'btn' : 'btn btn--primary'}
                    onClick={() => void install(pack)}
                    disabled={busy}
                  >
                    {busy ? '…' : installed ? 'Réinstaller' : 'Installer'}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="small muted" style={{ marginBottom: 0 }}>
            {group[0]?.attribution}
          </p>
        </section>
      ))}
    </>
  );
}
