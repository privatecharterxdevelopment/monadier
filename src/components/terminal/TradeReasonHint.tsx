import React from 'react';
import { HelpCircle, Info } from 'lucide-react';
import {
  formatHlBotCloseReason,
  formatHlBotOpenReason,
} from '../../lib/hlBotReasonLabels';

type Props = {
  reason: string | undefined;
  kind?: 'open' | 'close' | 'plain';
  label?: string;
  className?: string;
};

/** (i) hover — why the bot opened, closed, or is waiting. */
const TradeReasonHint: React.FC<Props> = ({
  reason,
  kind = 'plain',
  label,
  className = '',
}) => {
  const raw = reason?.trim();
  if (!raw) return null;

  const text =
    kind === 'open'
      ? formatHlBotOpenReason(raw)
      : kind === 'close'
        ? formatHlBotCloseReason(raw)
        : raw;
  if (!text) return null;

  const heading =
    label ??
    (kind === 'open'
      ? 'Why the bot opened'
      : kind === 'close'
        ? 'Why the bot closed'
        : 'Why');

  const Icon = kind === 'open' ? Info : HelpCircle;
  const kindClass = kind === 'open' ? ' term-trade-reason-hint--open' : '';

  return (
    <span
      className={`term-trade-reason-hint${kindClass}${className ? ` ${className}` : ''}`}
      tabIndex={0}
      role="img"
      aria-label={`${heading}: ${text}`}
    >
      <Icon size={13} strokeWidth={2} aria-hidden />
      <span className="term-trade-reason-hint__tip">
        <strong className="term-trade-reason-hint__title">{heading}</strong>
        <span className="term-trade-reason-hint__body">{text}</span>
      </span>
    </span>
  );
};

export default TradeReasonHint;
