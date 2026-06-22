import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import {
  formatCountdown,
  formatInTimeZone,
  getBotTradingWindowState,
} from '../../lib/botTradingWindow';
import { useNowTicker, useUserGeoTime } from '../../hooks/useUserGeoTime';

type Props = {
  compact?: boolean;
  className?: string;
};

const BotTradingWindowCard: React.FC<Props> = ({ compact = false, className = '' }) => {
  const geo = useUserGeoTime();
  const now = useNowTicker(true);

  const windowState = useMemo(() => getBotTradingWindowState(now), [now]);
  const countdown = formatCountdown(windowState.nextChangeAt.getTime() - now.getTime());
  const localWhen = formatInTimeZone(windowState.nextChangeAt, geo.timezone);
  const locationLabel = [geo.city, geo.country].filter(Boolean).join(', ');

  return (
    <div
      className={`bot-trading-window${compact ? ' bot-trading-window--compact' : ''} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className="bot-trading-window-head">
        <Clock size={compact ? 14 : 16} aria-hidden />
        <span className="bot-trading-window-title">Bot entry window</span>
        <span
          className={`bot-trading-window-pill${
            windowState.longOpensAllowed ? ' bot-trading-window-pill--long' : ''
          }`}
        >
          {windowState.longOpensAllowed ? 'LONG + SHORT' : 'SHORT only'}
        </span>
      </div>
      <p className="bot-trading-window-detail">{windowState.detail}</p>
      <div className="bot-trading-window-countdown">
        <span className="bot-trading-window-countdown-label">
          {windowState.nextChangeSummary} in
        </span>
        <strong className="bot-trading-window-countdown-value">{countdown}</strong>
      </div>
      <p className="bot-trading-window-meta">
        {localWhen}
        {locationLabel ? ` · ${locationLabel}` : ''}
        {geo.source === 'ip' ? ' · from your IP timezone' : ' · local timezone'}
      </p>
    </div>
  );
};

export default BotTradingWindowCard;
