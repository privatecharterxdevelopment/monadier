import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDown } from 'lucide-react';

type Props = {
  label?: string;
};

/** Mobile-only — jumps to buy/sell or bot panel when it is off-screen. */
const ProTradeMobileTradeFab: React.FC<Props> = ({ label = 'Trade' }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const panel = document.getElementById('hl-trade-panel');
    const scrollRoot = document.querySelector('.hl-terminal-shell');
    if (!panel || !scrollRoot) return;

    const mq = window.matchMedia('(max-width: 900px)');
    const sync = () => {
      if (!mq.matches) setVisible(false);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!mq.matches) {
          setVisible(false);
          return;
        }
        setVisible(!entry.isIntersecting);
      },
      { root: scrollRoot, threshold: 0.12, rootMargin: '-48px 0px -64px 0px' },
    );

    observer.observe(panel);
    mq.addEventListener('change', sync);

    return () => {
      observer.disconnect();
      mq.removeEventListener('change', sync);
    };
  }, []);

  const scrollToPanel = useCallback(() => {
    document.getElementById('hl-trade-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="hl-mobile-trade-fab"
      onClick={scrollToPanel}
      aria-label={`Scroll to ${label}`}
    >
      <ArrowDown size={16} aria-hidden />
      {label}
    </button>
  );
};

export default ProTradeMobileTradeFab;
