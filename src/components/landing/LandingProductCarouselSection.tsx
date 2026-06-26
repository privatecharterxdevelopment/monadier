import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { goToOpenApp } from '../../lib/appUrls';
import { dashboardPreview } from '../../assets/landing/dashboardPreview';
import { useLandingScrollSequence } from './useLandingScrollSequence';

const PRODUCT_CARDS = [
  {
    id: 'bot',
    title: 'Full auto bot trading',
    desc: 'AI scans 200+ HL perps — opens, trails profit, and cuts losers 24/7.',
    image: dashboardPreview,
    cta: 'Start bot',
    section: '?section=bot',
  },
  {
    id: 'perps',
    title: 'Pro perps trading',
    desc: 'Live charts, depth, and execution on Hyperliquid.',
    image: '/images/landing/hero-visual.png',
    cta: 'Trade perps',
    section: '',
  },
  {
    id: 'betting',
    title: 'Sports betting',
    desc: 'HIP-4 outcome markets — macro, crypto, and live sports on-chain.',
    image: '/images/betting/sports-hero.png',
    cta: 'Open betting',
    section: '?section=sportsbets',
  },
  {
    id: 'pro-trade',
    title: 'Professional trade',
    desc: 'Full Hyperliquid terminal — charts, depth, and precision execution.',
    image: '/images/landing/hero-visual.png',
    cta: 'Open terminal',
    section: '',
  },
] as const;

const CAROUSEL_SCROLL_PX = 720;
const TITLE_ROTATE_WORDS = ['today', 'tomorrow', 'whenever'] as const;
const TITLE_ROTATE_MS = 3200;

function measureCarouselTravel(lane: HTMLElement, track: HTMLElement): number {
  const cards = track.querySelectorAll<HTMLElement>('.landing-gmx-product-carousel-card');
  const lastCard = cards[cards.length - 1];
  if (lastCard) {
    const endGap = 24;
    return Math.max(0, lastCard.offsetLeft + lastCard.offsetWidth + endGap - lane.clientWidth);
  }
  return Math.max(0, track.scrollWidth - lane.clientWidth);
}

const LandingProductCarouselSection: React.FC = () => {
  const laneRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const finalScrollRef = useRef(0);
  const [rotateIndex, setRotateIndex] = useState(0);
  const rotateWord = TITLE_ROTATE_WORDS[rotateIndex] ?? TITLE_ROTATE_WORDS[0];
  const longestRotateWord = TITLE_ROTATE_WORDS.reduce((a, b) => (a.length >= b.length ? a : b));

  useEffect(() => {
    const id = window.setInterval(() => {
      setRotateIndex((i) => (i + 1) % TITLE_ROTATE_WORDS.length);
    }, TITLE_ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  const { sectionRef, progress, locked, unlocked } = useLandingScrollSequence({
    lockId: 'carousel',
    scrollPx: CAROUSEL_SCROLL_PX,
  });

  const applyCarouselOffset = useCallback((offsetPx: number, useTransform: boolean) => {
    const lane = laneRef.current;
    const track = trackRef.current;
    if (!lane || !track) return;

    if (useTransform) {
      track.style.transform = `translate3d(-${offsetPx}px, 0, 0)`;
      lane.scrollLeft = 0;
    } else {
      track.style.transform = 'none';
      lane.scrollLeft = offsetPx;
    }
  }, []);

  const syncFromProgress = useCallback(
    (p: number) => {
      const lane = laneRef.current;
      const track = trackRef.current;
      if (!lane || !track) return;

      const travel = measureCarouselTravel(lane, track);
      const offset = Math.min(travel, p * travel);
      finalScrollRef.current = offset;
      applyCarouselOffset(offset, !unlocked);
    },
    [applyCarouselOffset, unlocked]
  );

  useEffect(() => {
    syncFromProgress(progress);
    const onResize = () => syncFromProgress(progress);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [progress, syncFromProgress]);

  useEffect(() => {
    if (!unlocked) return;
    applyCarouselOffset(finalScrollRef.current, false);
  }, [unlocked, applyCarouselOffset]);

  useEffect(() => {
    if (!unlocked) return undefined;
    const lane = laneRef.current;
    if (!lane) return undefined;

    const onLaneWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (lane.scrollWidth <= lane.clientWidth + 1) return;

      const atStart = lane.scrollLeft <= 1;
      const atEnd = lane.scrollLeft + lane.clientWidth >= lane.scrollWidth - 1;

      if ((e.deltaY > 0 && !atEnd) || (e.deltaY < 0 && !atStart)) {
        e.preventDefault();
        e.stopPropagation();
        lane.scrollLeft += e.deltaY;
      }
    };

    lane.addEventListener('wheel', onLaneWheel, { passive: false });
    return () => lane.removeEventListener('wheel', onLaneWheel);
  }, [unlocked]);

  return (
    <section
      ref={sectionRef}
      className={`landing-gmx-section landing-gmx-product-carousel-section${
        locked ? ' landing-gmx-scroll-sequence--locked' : ''
      }${unlocked ? ' landing-gmx-product-carousel-section--unlocked' : ''}`}
      aria-labelledby="landing-product-carousel-title"
    >
      <div className="landing-gmx-product-carousel-sticky">
        <div className="landing-gmx-gutter landing-gmx-shell landing-gmx-product-carousel-shell">
          <div className="landing-gmx-product-carousel-layout">
            <div className="landing-gmx-product-carousel-head">
              <h2 id="landing-product-carousel-title" className="landing-gmx-product-carousel-title">
                <span className="landing-gmx-product-carousel-title-row">
                  <span className="landing-gmx-product-carousel-emphasis">Start </span>
                  <span className="landing-gmx-product-carousel-emphasis">earning</span>
                </span>
                <span
                  className="landing-gmx-product-carousel-title-rotate"
                  aria-live="polite"
                >
                  <span className="landing-gmx-product-carousel-title-rotate-sizer" aria-hidden>
                    {longestRotateWord}
                  </span>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={rotateWord}
                      className="landing-gmx-product-carousel-title-rotate-visible landing-gmx-product-carousel-emphasis"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {rotateWord}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </h2>
            </div>

            <div ref={laneRef} className="landing-gmx-product-carousel-lane">
              <div ref={trackRef} className="landing-gmx-product-carousel-track">
                {PRODUCT_CARDS.map((card) => (
                  <article
                    key={card.id}
                    className="landing-gmx-product-card landing-gmx-product-carousel-card"
                    style={{ backgroundImage: `url(${card.image})` }}
                  >
                    <div className="landing-gmx-product-card-shade" aria-hidden />
                    <div className="landing-gmx-product-card-copy">
                      <h3 className="landing-gmx-product-card-title">{card.title}</h3>
                      <p className="landing-gmx-product-card-desc">{card.desc}</p>
                      <button
                        type="button"
                        className="landing-gmx-product-card-cta"
                        onClick={() => goToOpenApp(card.section, false)}
                      >
                        {card.cta}
                        <ArrowRight size={14} aria-hidden />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LandingProductCarouselSection;
