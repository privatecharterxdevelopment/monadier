import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BOT_AUDIENCE_VIDEO_BANNER } from '../../lib/seo/tradingBotContent';

const ROTATE_MS = 3600;
const ROTATE_LINES = [
  BOT_AUDIENCE_VIDEO_BANNER.lineOne,
  BOT_AUDIENCE_VIDEO_BANNER.lineTwo,
] as const;

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
};

const BotAudienceVideoBanner: React.FC = () => {
  const [index, setIndex] = useState(0);
  const line = ROTATE_LINES[index] ?? ROTATE_LINES[0];
  const sizer = ROTATE_LINES.reduce((a, b) => (a.length >= b.length ? a : b));

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % ROTATE_LINES.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section
      className="landing-gmx-gutter landing-bot-audience-section"
      aria-labelledby="bot-audience-title"
    >
      <div className="landing-gmx-shell landing-bot-audience-shell">
        <motion.div {...fadeUp} className="landing-bot-audience-frame">
          <video
            className="landing-bot-audience-video"
            src={BOT_AUDIENCE_VIDEO_BANNER.videoSrc}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            aria-hidden
          />
          <div className="landing-bot-audience-overlay">
            <h2 id="bot-audience-title" className="landing-bot-audience-title">
              <span className="landing-bot-audience-title-rotate" aria-live="polite">
                <span className="landing-bot-audience-title-sizer" aria-hidden>
                  {sizer}
                </span>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={line}
                    className="landing-bot-audience-title-line"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {line}
                  </motion.span>
                </AnimatePresence>
              </span>
            </h2>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default BotAudienceVideoBanner;
