import React from 'react';
import {
  formatHlBotCloseReason,
  formatHlBotOpenReason,
} from '../../lib/hlBotReasonLabels';

type Props = {
  reason: string | undefined;
  kind?: 'open' | 'close';
  maxLines?: number;
};

/** Visible trade reason in tables — not hover-only. */
const TradeReasonCell: React.FC<Props> = ({ reason, kind = 'open', maxLines = 3 }) => {
  const raw = reason?.trim();
  if (!raw) return <span className="term-trade-reason-cell term-trade-reason-cell--empty">—</span>;

  const formatted =
    kind === 'close' ? formatHlBotCloseReason(raw) : formatHlBotOpenReason(raw);
  if (!formatted) return <span className="term-trade-reason-cell term-trade-reason-cell--empty">—</span>;

  const lines = formatted.split('\n').filter(Boolean);
  const visible = lines.slice(0, maxLines);
  const rest = lines.length - visible.length;

  return (
    <div className="term-trade-reason-cell" title={formatted}>
      {visible.map((line, i) => (
        <span key={i} className="term-trade-reason-cell__line">
          {line}
        </span>
      ))}
      {rest > 0 ? (
        <span className="term-trade-reason-cell__more">+{rest} more</span>
      ) : null}
    </div>
  );
};

export default TradeReasonCell;
