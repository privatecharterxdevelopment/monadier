import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  label: string;
  value: string;
  meta?: string;
  description: string;
  variant?: 'light' | 'dark';
  className?: string;
};

type PopoverPos = {
  top: number;
  left: number;
  placement: 'top' | 'bottom';
};

/** Grey metric pill — description on hover only (minimal popover). */
const BotMetricPill: React.FC<Props> = ({
  label,
  value,
  meta,
  description,
  variant = 'light',
  className = '',
}) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos | null>(null);

  const pillClass =
    variant === 'dark'
      ? 'hl-chart-bot-pill'
      : 'term-chart-live-badge term-chart-bot-pill term-bot-metric-pill';
  const labelClass =
    variant === 'dark' ? 'hl-chart-bot-pill__label' : 'term-chart-live-badge__label';
  const valueClass =
    variant === 'dark' ? 'hl-chart-bot-pill__value' : 'term-chart-live-badge__pair';
  const metaClass =
    variant === 'dark' ? 'hl-chart-bot-pill__meta' : 'term-chart-live-badge__price';

  const updatePos = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 8;
    const estHeight = 72;
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
  }, []);

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

  const show = () => {
    setOpen(true);
    updatePos();
  };
  const hide = () => setOpen(false);

  const popover =
    open && pos
      ? createPortal(
          <div
            className={`term-bot-metric-popover term-bot-metric-popover--${pos.placement}`}
            style={{ top: pos.top, left: pos.left }}
            role="tooltip"
          >
            <span className="term-bot-metric-popover__label">{label}</span>
            <p className="term-bot-metric-popover__text">{description}</p>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div
        ref={anchorRef}
        className={`${pillClass}${className ? ` ${className}` : ''}`}
        tabIndex={0}
        aria-label={`${label}: ${value}. ${description}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <span className={labelClass}>{label}</span>
        <span className={valueClass}>{value}</span>
        {meta ? <span className={metaClass}>{meta}</span> : null}
      </div>
      {popover}
    </>
  );
};

export default BotMetricPill;
