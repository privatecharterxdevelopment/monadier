import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { goToOpenApp } from '../../lib/appUrls';
import { useLandingScrollSequence } from './useLandingScrollSequence';
import LandingProductWidgetCard from './LandingProductWidgetCard';

const PRODUCT_CARD_META = [
  { id: 'bot', image: '/images/landing/landing-carousel-bot-brain.png', section: '?section=bot', hideCopy: true },
  { id: 'perps', image: '/images/landing/landing-carousel-perps-candles.png', section: '', hideCopy: true },
  { id: 'betting', image: '/images/landing/landing-carousel-betting-trophy.png', section: '?section=sportsbets', hideCopy: true },
  { id: 'predictions', image: '/images/landing/landing-carousel-predictions-question.png', section: '?section=sportsbets', hideCopy: true },
] as const;

const CAROUSEL_SCROLL_PX = 720;
const TITLE_ROTATE_MS = 3200;
const ROTATE_FALLBACK = ['passively', 'today', 'tomorrow', 'whenever'] as const;

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
  const { t } = useTranslation();
  const laneRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const finalScrollRef = useRef(0);
  const [rotateIndex, setRotateIndex] = useState(0);

  const rotateWordsRaw = t('landing.carousel.rotateWords', { returnObjects: true });
  const rotateWords = Array.isArray(rotateWordsRaw)
    ? (rotateWordsRaw as string[])
    : [...ROTATE_FALLBACK];
  const rotateWord = rotateWords[rotateIndex] ?? rotateWords[0] ?? ROTATE_FALLBACK[0];
  const longestRotateWord = rotateWords.reduce((a, b) => (a.length >= b.length ? a : b), '');

  const productCards = useMemo(
    () =>
      PRODUCT_CARD_META.map((card) => ({
        ...card,
        title: t(`landing.carousel.cards.${card.id}.title`),
        cta: t(`landing.carousel.cards.${card.id}.cta`),
      })),
    [t]
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setRotateIndex((i) => (i + 1) % rotateWords.length);
    }, TITLE_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [rotateWords.length]);

  const { sectionRef, progress, locked, unlocked } = useLandingScrollSequence({
    lockId: 'carousel',
    scrollPx: CAROUSEL_SCROLL_PX,
    releaseAnchorId: 'landing-sleep-earnings-section',
    releaseAnchorOffsetPx: 0,
    releaseScrollBehavior: 'auto',
    handoffLockId: 'sleep-earnings',
  });

  const applyCarouselOffset = useCallback((offsetPx: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transform = `translate3d(-${offsetPx}px, 0, 0)`;
  }, []);

  const syncFromProgress = useCallback(
    (p: number) => {
      const lane = laneRef.current;
      const track = trackRef.current;
      if (!lane || !track) return;

      const travel = measureCarouselTravel(lane, track);
      const offset = Math.min(travel, p * travel);
      finalScrollRef.current = offset;
      applyCarouselOffset(offset);
    },
    [applyCarouselOffset]
  );

  useEffect(() => {
    syncFromProgress(progress);
    const onResize = () => syncFromProgress(progress);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [progress, syncFromProgress]);

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
                  <span className="landing-gmx-product-carousel-emphasis">{t('landing.carousel.titleStart')} </span>
                  <span className="landing-gmx-product-carousel-emphasis">{t('landing.carousel.titleEarn')}</span>
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
                      className="landing-gmx-product-carousel-title-rotate-visible landing-gmx-product-carousel-muted"
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
                {productCards.map((card) => (
                  <LandingProductWidgetCard
                    key={card.id}
                    image={card.image}
                    label={card.cta}
                    section={card.section}
                  />
                ))}
              </div>
            </div>

            <p className="landing-gmx-product-carousel-desc">{t('landing.carousel.description')}</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LandingProductCarouselSection;
