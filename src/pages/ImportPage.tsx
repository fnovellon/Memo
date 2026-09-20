import { useMemo, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../app/store';
import { AnkiImportError, readAnkiPackage, type AnkiPackage } from '../data/ankiPackage';
import { rowsFromPackage, runImport, type ImportReport } from '../data/importer';
import { guessMapping, parseTextNotes, splitFields, type FieldMapping } from '../domain/anki';
import { LANGUAGES } from '../domain/languages';

interface Source {
  kind: 'apkg' | 'text';
  label: string;
  pkg?: AnkiPackage;
  /** Types de note du paquet, du plus fourni au moins fourni. */
  notetypes: { id: number; name: string; fields: string[]; count: number }[];
  notetypeId: number;
  columns: string[];
  rows: { id: number; fields: string[] }[];
}

type Phase = 'idle' | 'reading' | 'ready' | 'importing' | 'done';

export default function ImportPage() {
  const { settings, reload } = useStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [lang, setLang] = useState(settings.lastLang);
  const [mapping, setMapping] = useState<FieldMapping>({ term: 0, translation: 1, reading: null });
  const [keepSchedule, setKeepSchedule] = useState(true);
  const [importImages, setImportImages] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const preview = useMemo(() => {
    if (!source) return [];
    return source.rows.slice(0, 3).map((row) => ({
      term: row.fields[mapping.term] ?? '',
      translation: row.fields[mapping.translation] ?? '',
    }));
  }, [source, mapping]);

  function selectNotetype(source: Source, notetypeId: number): Source {
    const notetype = source.notetypes.find((candidate) => candidate.id === notetypeId);
    const columns = notetype?.fields ?? [];
    const rows = source.pkg ? rowsFromPackage(source.pkg, notetypeId) : source.rows;
    setMapping(guessMapping(columns));
    return { ...source, notetypeId, columns, rows };
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setPhase('reading');
    setError(null);
    setReport(null);
    setSource(null);

    try {
      if (file.name.toLowerCase().endsWith('.apkg')) {
        const pkg = await readAnkiPackage(file);
        const counts = new Map<number, number>();
        for (const note of pkg.notes) counts.set(note.mid, (counts.get(note.mid) ?? 0) + 1);

        const notetypes = pkg.notetypes
          .map((notetype) => ({ ...notetype, count: counts.get(notetype.id) ?? 0 }))
          .filter((notetype) => notetype.count > 0)
          .sort((a, b) => b.count - a.count);

        if (notetypes.length === 0) {
          // Sans description de type, on se rabat sur les champs bruts de la première note.
          const width = splitFields(pkg.notes[0]!.flds).length;
          const fallback = {
            id: pkg.notes[0]!.mid,
            name: 'Notes du paquet',
            fields: Array.from({ length: width }, (_, index) => `Champ ${index + 1}`),
            count: pkg.notes.length,
          };
          notetypes.push(fallback);
        }

        const first = notetypes[0]!;
        setMapping(guessMapping(first.fields));
        setSource({
          kind: 'apkg',
          label: file.name.replace(/\.apkg$/i, ''),
          pkg,
          notetypes,
          notetypeId: first.id,
          columns: first.fields,
          rows: rowsFromPackage(pkg, first.id),
        });
      } else {
        const parsed = parseTextNotes(await file.text());
        if (parsed.rows.length === 0) {
          throw new AnkiImportError('Ce fichier ne contient aucune ligne exploitable.');
        }
        setMapping(guessMapping(parsed.columns));
        setSource({
          kind: 'text',
          label: file.name.replace(/\.[^.]+$/, ''),
          notetypes: [],
          notetypeId: 0,
          columns: parsed.columns,
          rows: parsed.rows.map((fields, index) => ({ id: index, fields })),
        });
      }
      setPhase('ready');
    } catch (failure) {
      setError(
        failure instanceof AnkiImportError
          ? failure.message
          : 'Ce fichier n’a pas pu être lu. Vérifie qu’il vient bien d’Anki.',
      );
      setPhase('idle');
    }
  }

  async function handleImport() {
    if (!source) return;
    setPhase('importing');
    setProgress(null);
    try {
      const result = await runImport(
        { rows: source.rows, ...(source.pkg ? { pkg: source.pkg } : {}) },
        {
          lang,
          mapping,
          keepSchedule: source.kind === 'apkg' && keepSchedule,
          importImages: source.kind === 'apkg' && importImages,
          sourceLabel: source.label,
        },
        (done, total) => setProgress({ done, total }),
      );
      await reload();
      setReport(result);
      setPhase('done');
    } catch {
      setError('L’import a échoué en cours de route. Rien n’a été laissé à moitié.');
      setPhase('ready');
    }
  }

  return (
    <>
      <h1 className="page-title">Importer depuis Anki</h1>

      {error && (
        <p className="notice" role="status">
          {error}
        </p>
      )}

      {phase === 'done' && report && <Report report={report} onReset={() => setPhase('idle')} />}

      {phase !== 'done' && (
        <section className="panel">
          <p className="small" style={{ marginTop: 0 }}>
            Prends un paquet <strong>.apkg</strong> exporté depuis Anki, ou un export
            <strong> texte</strong> (.txt, .csv). Le paquet apporte aussi ta progression et tes
            images.
          </p>
          <label className="btn btn--primary btn--block" style={{ cursor: 'pointer' }}>
            {phase === 'reading' ? 'Lecture…' : 'Choisir un fichier'}
            <input
              type="file"
              accept=".apkg,.txt,.csv,.tsv,text/plain"
              hidden
              disabled={phase === 'reading' || phase === 'importing'}
              onChange={(event) => void handleFile(event)}
            />
          </label>
        </section>
      )}

      {source && phase !== 'done' && (
        <>
          <section className="panel">
            <h2 className="field__label" style={{ marginBottom: 12 }}>
              {source.rows.length} note{source.rows.length > 1 ? 's' : ''} lue
              {source.rows.length > 1 ? 's' : ''}
            </h2>

            {source.notetypes.length > 1 && (
              <label className="field">
                <span className="field__label">Type de note à importer</span>
                <select
                  className="select"
                  value={source.notetypeId}
                  onChange={(event) =>
                    setSource(selectNotetype(source, Number(event.target.value)))
                  }
                >
                  {source.notetypes.map((notetype) => (
                    <option key={notetype.id} value={notetype.id}>
                      {notetype.name} ({notetype.count})
                    </option>
                  ))}
                </select>
                <span className="small muted">
                  Un seul type est importé à la fois. Relance l’import pour les autres.
                </span>
              </label>
            )}

            <label className="field">
              <span className="field__label">Langue de ces mots</span>
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

            <FieldSelect
              label="Mot en langue étrangère"
              columns={source.columns}
              value={mapping.term}
              onChange={(term) => setMapping({ ...mapping, term })}
            />
            <FieldSelect
              label="Traduction en français"
              columns={source.columns}
              value={mapping.translation}
              onChange={(translation) => setMapping({ ...mapping, translation })}
            />
            <FieldSelect
              label="Lecture (facultatif)"
              columns={source.columns}
              value={mapping.reading}
              allowNone
              onChange={(reading) => setMapping({ ...mapping, reading })}
            />

            {preview.length > 0 && (
              <div className="preview">
                <div className="field__label">Aperçu</div>
                {preview.map((row, index) => (
                  <div key={index} className="preview__row">
                    <span>{row.term || <em className="muted">vide</em>}</span>
                    <span className="muted">{row.translation || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {source.kind === 'apkg' && (
            <section className="panel">
              <label className="switch" style={{ marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={keepSchedule}
                  onChange={(event) => setKeepSchedule(event.target.checked)}
                />
                <span>
                  Reprendre ma progression
                  <span className="small muted" style={{ display: 'block' }}>
                    Intervalles, facilité et oublis d’Anki sont convertis. Les cartes encore en
                    apprentissage repartent à neuf : leur état n’a pas d’équivalent ici.
                  </span>
                </span>
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={importImages}
                  onChange={(event) => setImportImages(event.target.checked)}
                />
                <span>
                  Récupérer les images
                  <span className="small muted" style={{ display: 'block' }}>
                    {source.pkg?.mediaUnreadable
                      ? 'Les médias de ce paquet n’ont pas pu être indexés : aucune image ne sera reprise.'
                      : 'Les images des notes sont réduites puis rattachées à leur mot.'}
                  </span>
                </span>
              </label>
            </section>
          )}

          <button
            className="btn btn--primary btn--block"
            onClick={() => void handleImport()}
            disabled={phase === 'importing'}
          >
            {phase === 'importing'
              ? progress
                ? `Images ${progress.done}/${progress.total}…`
                : 'Import en cours…'
              : `Importer ${source.rows.length} note${source.rows.length > 1 ? 's' : ''}`}
          </button>
        </>
      )}
    </>
  );
}

function FieldSelect({
  label,
  columns,
  value,
  onChange,
  allowNone = false,
}: {
  label: string;
  columns: string[];
  value: number | null;
  onChange: (value: never) => void;
  allowNone?: boolean;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <select
        className="select"
        value={value === null ? '' : value}
        onChange={(event) =>
          onChange((event.target.value === '' ? null : Number(event.target.value)) as never)
        }
      >
        {allowNone && <option value="">Aucune</option>}
        {columns.map((column, index) => (
          <option key={index} value={index}>
            {column}
          </option>
        ))}
      </select>
    </label>
  );
}

function Report({ report, onReset }: { report: ImportReport; onReset: () => void }) {
  const ignored = report.skipped.empty + report.skipped.cloze + report.skipped.duplicate;

  return (
    <section className="panel">
      <h2 className="field__label" style={{ marginBottom: 12 }}>
        Import terminé
      </h2>
      <ul className="breakdown">
        <li>
          <span>Mots ajoutés</span>
          <strong>{report.imported}</strong>
        </li>
        {report.scheduled > 0 && (
          <li>
            <span>Cartes ayant gardé leur planning</span>
            <strong>{report.scheduled}</strong>
          </li>
        )}
        {report.images > 0 && (
          <li>
            <span>Images reprises</span>
            <strong>{report.images}</strong>
          </li>
        )}
        {report.imagesFailed > 0 && (
          <li>
            <span>Images introuvables dans le paquet</span>
            <strong>{report.imagesFailed}</strong>
          </li>
        )}
        {report.skipped.duplicate > 0 && (
          <li>
            <span>Déjà dans ta bibliothèque</span>
            <strong>{report.skipped.duplicate}</strong>
          </li>
        )}
        {report.skipped.cloze > 0 && (
          <li>
            <span>Notes à trous, non convertibles</span>
            <strong>{report.skipped.cloze}</strong>
          </li>
        )}
        {report.skipped.empty > 0 && (
          <li>
            <span>Notes sans mot ou sans traduction</span>
            <strong>{report.skipped.empty}</strong>
          </li>
        )}
      </ul>
      {ignored > 0 && (
        <p className="small muted">
          {ignored} note{ignored > 1 ? 's ont' : ' a'} été écartée{ignored > 1 ? 's' : ''} : rien
          n’a été importé à moitié.
        </p>
      )}
      <div className="row" style={{ marginTop: 14 }}>
        <Link className="btn btn--primary" to="/bibliotheque">
          Voir la bibliothèque
        </Link>
        <button className="btn btn--ghost" onClick={onReset}>
          Importer autre chose
        </button>
      </div>
    </section>
  );
}
