import React from 'react';
import { HelpCircle } from 'lucide-react';

type Props = {
  reason: string | undefined;
  className?: string;
};

/** (?) hover — why the bot opened this trade. */
const TradeOpenReasonHint: React.FC<Props> = ({ reason, className = '' }) => {
  const text = reason?.trim();
  if (!text) return null;

  return (
    <span
      className={`term-trade-reason-hint${className ? ` ${className}` : ''}`}
      tabIndex={0}
      role="img"
      aria-label={`Open reason: ${text}`}
    >
      <HelpCircle size={12} strokeWidth={2.2} aria-hidden />
      <span className="term-trade-reason-hint__tip">{text}</span>
    </span>
  );
};

export default TradeOpenReasonHint;
