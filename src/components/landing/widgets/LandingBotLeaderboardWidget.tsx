import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  fetchBotPublicRecentCloses,
  type BotPublicTradeRow,
} from '../../../lib/api/botPublicLeaderboard';
import { supabase } from '../../../lib/supabaseClient';

const REFRESH_MS = 10_000;

type Props = {
  limit?: number;
  variant?: 'compact' | 'hero';
  className?: string;
};

function fmtPnl(n: number): string {
  const sign = n >= 0 ? '+' : '−';
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDateTime(iso: string): { date: string; time: string } {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { date: '—', time: '—' };
  const d = new Date(ms);
  return {
    date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
}

const LandingBotLeaderboardWidget: React.FC<Props> = ({
  limit = 8,
  variant = 'compact',
  className = '',
}) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<BotPublicTradeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const next = await fetchBotPublicRecentCloses(limit);
    setRows(next);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await load();
      if (cancelled) return;
    };
    void run();
    const id = window.setInterval(() => void load(), REFRESH_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);

    const channel = supabase
      .channel(`landing-bot-leaderboard-${variant}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trade_history' },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [load, variant]);

  return (
    <div
      className={`landing-apple-widget landing-apple-widget--lb landing-apple-widget--lb-${variant}${
        className ? ` ${className}` : ''
      }`}
      aria-label={t('landing.widgets.lb.aria')}
    >
      <div className="landing-apple-widget-lb-head">
        <span className="landing-apple-widget-lb-live">
          <span className="landing-apple-widget-lb-live-dot" aria-hidden />
          {t('landing.widgets.lb.live')}
        </span>
        <span className="landing-apple-widget-lb-meta">{t('landing.widgets.lb.subtitle')}</span>
      </div>

      {loading && rows.length === 0 ? (
        <div className="landing-apple-widget-lb-state">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          <span>{t('landing.widgets.lb.loading')}</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="landing-apple-widget-lb-state">
          <span>{t('landing.widgets.lb.empty')}</span>
        </div>
      ) : (
        <ul className="landing-apple-widget-lb-list">
          {rows.map((row) => {
            const { date, time } = fmtDateTime(row.closedAt);
            const win = row.profitUsd >= 0;
            return (
              <li key={row.id} className="landing-apple-widget-lb-row">
                <span className="landing-apple-widget-lb-asset">
                  {row.pair}{' '}
                  <span
                    className={`landing-apple-widget-lb-side landing-apple-widget-lb-side--${row.direction.toLowerCase()}`}
                  >
                    {row.direction}
                  </span>
                </span>
                <span className="landing-apple-widget-lb-wallet" title={row.wallet}>
                  0x{row.walletLabel}
                </span>
                <span className="landing-apple-widget-lb-date">{date}</span>
                <span className="landing-apple-widget-lb-time">{time}</span>
                <span
                  className={`landing-apple-widget-lb-pnl${
                    win ? ' landing-apple-widget-lb-pnl--win' : ' landing-apple-widget-lb-pnl--loss'
                  }`}
                >
                  {fmtPnl(row.profitUsd)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default LandingBotLeaderboardWidget;
