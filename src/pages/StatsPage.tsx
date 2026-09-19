import { useEffect, useState } from 'react';
import { useStore } from '../app/store';
import BarChart from '../components/BarChart';
import { listDaily, listReviewLogs } from '../data/repository';
import { DAY } from '../domain/scheduler';
import {
  breakdownByState,
  computeStreak,
  reviewForecast,
  reviewHistory,
  successRate,
} from '../domain/stats';
import type { DailyCounts, ReviewLog } from '../domain/types';

const WINDOW_DAYS = 14;
const SUCCESS_WINDOW_DAYS = 30;

export default function StatsPage() {
  const { words, cards, counts } = useStore();
  const [daily, setDaily] = useState<DailyCounts[] | null>(null);
  const [logs, setLogs] = useState<ReviewLog[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [records, recent] = await Promise.all([
        listDaily(),
        listReviewLogs(Date.now() - SUCCESS_WINDOW_DAYS * DAY),
      ]);
      if (!cancelled) {
        setDaily(records);
        setLogs(recent);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `counts` change à chaque réponse : recharger garde la page juste après une séance.
  }, [counts]);

  if (daily === null) return <p className="empty">Chargement…</p>;

  const now = Date.now();
  const streak = computeStreak(daily, now);
  const history = reviewHistory(daily, now, WINDOW_DAYS);
  const forecast = reviewForecast(cards, now, WINDOW_DAYS);
  const breakdown = breakdownByState(cards);
  const rate = successRate(logs, now - SUCCESS_WINDOW_DAYS * DAY);

  return (
    <>
      <h1 className="page-title">Statistiques</h1>

      <section className="panel hero">
        <div className="hero__count">{streak}</div>
        <p className="hero__label" style={{ margin: 0 }}>
          {streak === 0
            ? 'aucune série en cours'
            : `jour${streak > 1 ? 's' : ''} d’affilée`}
        </p>
      </section>

      <div className="stat-row">
        <div className="stat">
          <div className="stat__value">{words.length}</div>
          <div className="stat__label">mots</div>
        </div>
        <div className="stat">
          <div className="stat__value">{breakdown.learned}</div>
          <div className="stat__label">cartes apprises</div>
        </div>
        <div className="stat">
          <div className="stat__value">{rate === null ? '—' : `${rate}%`}</div>
          <div className="stat__label">réussite 30 j</div>
        </div>
      </div>

      <section className="panel">
        <BarChart
          title="Cartes révisées, 14 derniers jours"
          buckets={history}
          axis={['il y a 14 jours', "aujourd'hui"]}
          emptyMessage="Aucune révision sur la période."
        />
        <BarChart
          title="Charge à venir, 14 prochains jours"
          buckets={forecast}
          axis={["aujourd'hui", 'dans 14 jours']}
          emptyMessage="Aucune échéance dans les deux prochaines semaines."
        />
      </section>

      <section className="panel">
        <h2 className="field__label" style={{ marginBottom: 10 }}>
          Où en sont tes cartes
        </h2>
        <ul className="breakdown">
          <li>
            <span>Jamais vues</span>
            <strong>{breakdown.fresh}</strong>
          </li>
          <li>
            <span>En cours d’apprentissage</span>
            <strong>{breakdown.learning}</strong>
          </li>
          <li>
            <span>Apprises</span>
            <strong>{breakdown.learned}</strong>
          </li>
          {breakdown.suspended > 0 && (
            <li>
              <span>Suspendues</span>
              <strong>{breakdown.suspended}</strong>
            </li>
          )}
        </ul>
      </section>
    </>
  );
}
