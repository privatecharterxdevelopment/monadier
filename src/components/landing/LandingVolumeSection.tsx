import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useBotPublicLeaderboardData } from '../../hooks/useBotPublicLeaderboard';
import {
  accumulateLeaderboardVolume,
  applyVolumeDrip,
  formatLandingVolumeUsd,
  getLandingVolumeBaseUsd,
  getLandingVolumeTotalUsd,
  LANDING_VOLUME_DRIP_INTERVAL_MS,
  nextVolumeDripUsd,
  peekLeaderboardVolumeExtra,
} from '../../lib/landingVolumeCounter';

const DURATION_MS = 1800;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

const LandingVolumeSection: React.FC = () => {
  const { t } = useTranslation();
  const { topTrades, liveTrades } = useBotPublicLeaderboardData({
    topLimit: 20,
    recentLimit: 24,
    refreshMs: 10_000,
  });

  const [target, setTarget] = useState(() =>
    getLandingVolumeTotalUsd(peekLeaderboardVolumeExtra())
  );
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const [display, setDisplay] = useState(0);
  const started = useRef(false);
  const displayRef = useRef(0);

  // Fold leaderboard P/L (+80, +30, +91…) onto the 51k base — never drops.
  useEffect(() => {
    const rows = [...liveTrades, ...topTrades];
    if (rows.length === 0) {
      setTarget(getLandingVolumeTotalUsd(peekLeaderboardVolumeExtra()));
      return;
    }
    const { extraUsd } = accumulateLeaderboardVolume(
      rows.map((r) => ({ id: r.id, profitUsd: r.profitUsd }))
    );
    setTarget(getLandingVolumeTotalUsd(extraUsd));
  }, [liveTrades, topTrades]);

  // Every minute: drip a few dollars onto the counter.
  useEffect(() => {
    const id = window.setInterval(() => {
      applyVolumeDrip(nextVolumeDripUsd());
      setTarget(getLandingVolumeTotalUsd(peekLeaderboardVolumeExtra()));
    }, LANDING_VOLUME_DRIP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    if (!inView) return;

    if (!started.current) {
      started.current = true;
      const start = performance.now();
      let raf = 0;
      const from = 0;
      // First paint: always reveal from 0 → at least base 51k (plus any already-seen adds).
      const to = Math.max(target, getLandingVolumeBaseUsd());

      const tick = (now: number) => {
        const tProgress = Math.min(1, (now - start) / DURATION_MS);
        setDisplay(from + (to - from) * easeOutCubic(tProgress));
        if (tProgress < 1) raf = requestAnimationFrame(tick);
        else setDisplay(to);
      };

      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }

    const from = displayRef.current;
    const to = target;
    if (Math.abs(to - from) < 0.005) return;

    const start = performance.now();
    const bumpMs = 650;
    let raf = 0;
    const tick = (now: number) => {
      const tProgress = Math.min(1, (now - start) / bumpMs);
      setDisplay(from + (to - from) * easeOutCubic(tProgress));
      if (tProgress < 1) raf = requestAnimationFrame(tick);
      else setDisplay(to);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target]);

  const liveLabel = useMemo(() => t('landing.volume.live', { defaultValue: 'Live' }), [t]);

  return (
    <section
      ref={ref}
      className="landing-al-volume"
      aria-labelledby="landing-al-volume-title"
    >
      <div className="landing-al-volume-inner">
        <p id="landing-al-volume-title" className="landing-al-volume-value">
          <span className="landing-al-volume-live" title={liveLabel} aria-label={liveLabel}>
            <span className="landing-al-volume-live-dot" aria-hidden />
          </span>
          <motion.span
            className="landing-al-volume-value-num"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            {formatLandingVolumeUsd(display)}
          </motion.span>
        </p>
        <motion.p
          className="landing-al-volume-label"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        >
          {t('landing.volume.label')}
        </motion.p>
      </div>
    </section>
  );
};

export default LandingVolumeSection;
