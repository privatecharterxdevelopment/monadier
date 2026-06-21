import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, Info } from 'lucide-react';
import {
  formatHlBotCloseReason,
  formatHlBotOpenReason,
  parseTradeReasonSections,
} from '../../lib/hlBotReasonLabels';

type Props = {
  reason: string | undefined;
  kind?: 'open' | 'close' | 'plain';
  label?: string;
  className?: string;
};

type PopoverPos = {
  top: number;
  left: number;
  placement: 'top' | 'bottom';
};

/** (i) icon — full reason in a hover box (portal, never clipped by dock scroll). */
const TradeReasonHint: React.FC<Props> = ({
  reason,
  kind = 'plain',
  label,
  className = '',
}) => {
  const raw = reason?.trim() ?? '';
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const emptyFallback = kind === 'close' || kind === 'open';

  const formatted =
    kind === 'open'
      ? formatHlBotOpenReason(raw)
      : kind === 'close'
        ? formatHlBotCloseReason(raw)
        : raw;
  const displayRaw = raw || (emptyFallback ? 'No bot reason recorded for this fill.' : '');
  const sections = parseTradeReasonSections(displayRaw);
  const displaySections =
    sections.length > 0 && formatted
      ? sections
      : formatted
        ? [{ text: formatted }]
        : emptyFallback
          ? [{ text: 'No bot reason recorded for this fill.' }]
          : [];

  const updatePos = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 10;
    const estHeight = Math.min(420, 48 + displaySections.length * 36);
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement: 'top' | 'bottom' =
      spaceAbove >= estHeight + gap || spaceAbove >= spaceBelow ? 'top' : 'bottom';
    const top = placement === 'top' ? rect.top - gap : rect.bottom + gap;
    setPos({
      top,
      left: rect.left + rect.width / 2,
      placement,
    });
  }, [displaySections.length]);

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    const onScroll = () => updatePos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, updatePos]);

  if (!emptyFallback && (!raw || !formatted)) return null;

  const heading =
    label ??
    (kind === 'open'
      ? 'Why the bot opened'
      : kind === 'close'
        ? 'Why the bot closed'
        : 'Why');

  const Icon = kind === 'open' || kind === 'close' ? Info : HelpCircle;
  const kindClass =
    kind === 'open'
      ? ' term-trade-reason-hint--open'
      : kind === 'close'
        ? ` term-trade-reason-hint--close${raw ? '' : ' term-trade-reason-hint--empty'}`
        : '';
  const popoverKindClass =
    kind === 'open'
      ? ' term-trade-reason-popover--open'
      : kind === 'close'
        ? ' term-trade-reason-popover--close'
        : '';

  const show = () => {
    setOpen(true);
    updatePos();
  };
  const hide = () => setOpen(false);

  const popover =
    open && pos
      ? createPortal(
          <div
            className={`term-trade-reason-popover term-trade-reason-popover--${pos.placement}${popoverKindClass}`}
            style={{
              top: pos.top,
              left: pos.left,
            }}
            role="tooltip"
          >
            <strong className="term-trade-reason-popover__title">{heading}</strong>
            <div className="term-trade-reason-popover__sections">
              {displaySections.map((section, i) => (
                <div
                  key={i}
                  className={`term-trade-reason-popover__row${
                    section.label ? '' : ' term-trade-reason-popover__row--plain'
                  }`}
                >
                  {section.label ? (
                    <span className="term-trade-reason-popover__label">{section.label}</span>
                  ) : null}
                  <span className="term-trade-reason-popover__text">{section.text}</span>
                </div>
              ))}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <span
        ref={anchorRef}
        className={`term-trade-reason-hint${kindClass}${className ? ` ${className}` : ''}`}
        tabIndex={0}
        role="img"
        aria-label={`${heading}: ${formatted ?? displayRaw}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <Icon size={13} strokeWidth={2} aria-hidden />
      </span>
      {popover}
    </>
  );
};

export default TradeReasonHint;
