import { useId, useState } from 'react';
import type { DayBucket } from '../domain/stats';

interface BarChartProps {
  title: string;
  buckets: DayBucket[];
  /** Légende des extrémités de l'axe, de gauche à droite. */
  axis: [string, string];
  emptyMessage: string;
}

const WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

function describe(bucket: DayBucket): string {
  if (bucket.offset === 0) return "aujourd'hui";
  if (bucket.offset === -1) return 'hier';
  if (bucket.offset === 1) return 'demain';
  const date = new Date(`${bucket.date}T12:00:00`);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()}`;
}

/**
 * Colonnes à série unique : une seule couleur, donc pas de légende — le titre dit
 * déjà ce qui est tracé. Le tableau replié sous le graphique porte les valeurs que
 * l'on ne peut pas toutes étiqueter.
 */
export default function BarChart({ title, buckets, axis, emptyMessage }: BarChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const tableId = useId();

  const max = Math.max(...buckets.map((bucket) => bucket.count));
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const peak = buckets.findIndex((bucket) => bucket.count === max);

  return (
    <figure className="chart">
      <figcaption className="chart__title">{title}</figcaption>

      {total === 0 ? (
        <p className="chart__empty">{emptyMessage}</p>
      ) : (
        <>
          <div
            className="chart__plot"
            role="img"
            aria-label={`${title} : ${total} au total, maximum ${max} ${describe(buckets[peak]!)}.`}
          >
            {buckets.map((bucket, index) => {
              const height = max === 0 ? 0 : (bucket.count / max) * 100;
              const active = hovered === index;
              return (
                <div
                  key={bucket.date}
                  className="chart__col"
                  onPointerEnter={() => setHovered(index)}
                  onPointerDown={() => setHovered(index)}
                  onPointerLeave={() => setHovered(null)}
                >
                  {(active || (hovered === null && index === peak)) && bucket.count > 0 && (
                    <span className="chart__value">{bucket.count}</span>
                  )}
                  <div
                    className={active ? 'chart__bar chart__bar--active' : 'chart__bar'}
                    style={{ height: `${Math.max(height, bucket.count > 0 ? 4 : 0)}%` }}
                  />
                  {active && <span className="chart__tip">{describe(bucket)}</span>}
                </div>
              );
            })}
          </div>
          <div className="chart__axis">
            <span>{axis[0]}</span>
            <span>{axis[1]}</span>
          </div>
        </>
      )}

      <details className="chart__data">
        <summary>Voir les chiffres</summary>
        <table id={tableId} className="chart__table">
          <thead>
            <tr>
              <th scope="col">Jour</th>
              <th scope="col">Cartes</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.date}>
                <th scope="row">{describe(bucket)}</th>
                <td>{bucket.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
