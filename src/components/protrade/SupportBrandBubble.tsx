import React, { useEffect, useState } from 'react';
import Logo from '../ui/Logo';

type Props = {
  body: string;
  createdAt: string;
  roleLabel: string;
  /** Animate typing for newly arrived admin replies */
  animate?: boolean;
};

/**
 * HyperGain support bubble: + mark + optional typing → typewriter reveal.
 */
const SupportBrandBubble: React.FC<Props> = ({ body, createdAt, roleLabel, animate = false }) => {
  const [phase, setPhase] = useState<'typing' | 'reveal' | 'done'>(animate ? 'typing' : 'done');
  const [shown, setShown] = useState(animate ? '' : body);

  useEffect(() => {
    if (!animate) {
      setPhase('done');
      setShown(body);
      return;
    }

    setPhase('typing');
    setShown('');
    const typingMs = 700 + Math.min(900, body.length * 8);
    const t1 = window.setTimeout(() => setPhase('reveal'), typingMs);
    return () => window.clearTimeout(t1);
  }, [animate, body]);

  useEffect(() => {
    if (phase !== 'reveal') return;
    let i = 0;
    const step = Math.max(12, Math.floor(28 - body.length / 40));
    const id = window.setInterval(() => {
      i += 1;
      setShown(body.slice(0, i));
      if (i >= body.length) {
        window.clearInterval(id);
        setPhase('done');
      }
    }, step);
    return () => window.clearInterval(id);
  }, [phase, body]);

  return (
    <div className="hl-help-chat__msg hl-help-chat__msg--admin">
      <div className="hl-help-chat__avatar" aria-hidden>
        <Logo variant="app" size="sm" iconOnly theme="light" linked={false} />
      </div>
      <div className="hl-help-chat__bubble hl-help-chat__bubble--admin">
        <span className="hl-help-chat__bubble-role">{roleLabel}</span>
        {phase === 'typing' ? (
          <div className="hl-help-chat__typing" aria-label="Support is typing">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <p>
            {shown}
            {phase === 'reveal' ? <span className="hl-help-chat__caret" aria-hidden /> : null}
          </p>
        )}
        <time dateTime={createdAt}>{new Date(createdAt).toLocaleString()}</time>
      </div>
    </div>
  );
};

export default SupportBrandBubble;
