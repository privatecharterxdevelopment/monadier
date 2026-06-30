import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LandingNav from './LandingNav';
import LandingHeroLines from './LandingHeroLines';
import LandingBotPitchSection from './LandingBotPitchSection';
import LandingProductCarouselSection from './LandingProductCarouselSection';
import LandingSleepEarningsSection from './LandingSleepEarningsSection';
import LandingAgentFeatureSections from './LandingAgentFeatureSections';
import LandingHomeBentoCards from './LandingHomeBentoCards';
import LandingFaqSection from './LandingFaqSection';
import LandingFooter from './LandingFooter';
import { goToOpenApp } from '../../lib/appUrls';
import {
  lockPageScroll,
  registerLandingWheelConsumer,
  unlockPageScroll,
  unregisterLandingWheelConsumer,
} from '../../lib/landingScrollLock';

const LANDING_ROTATE_LINES_FALLBACK = [
  'on AI autopilot',
  'on Hyperliquid',
  'with automated perps',
  'on verified sports on-chain',
  'with hedge-fund signals',
  'with deep HL liquidity',
  'across 200+ markets',
] as const;

const HERO_SCROLL_BUMP = 0.16;
/** Small visible edge when fully zoomed (~12px). */
const HERO_MARGIN_PX = 12;
/** Matches LandingNav gmx layout: max-w-[1200px] inside px-3/sm:px-5/md:px-8. */
const HEADER_MAX_W = 1200;
const HEADER_GAP_BELOW_NAV = 12;

type HeroLayout = {
  frameTop: number;
  frameLeft: number;
  frameWidth: number;
  frameHeight: number;
  videoRadius: number;
};

function viewportHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

function headerGutterPx(viewportW: number): number {
  if (viewportW >= 768) return 32;
  if (viewportW >= 640) return 20;
  return 16;
}

function headerContentBox(viewportW: number) {
  const pad = headerGutterPx(viewportW);
  const available = viewportW - pad * 2;
  const width = Math.min(HEADER_MAX_W, available);
  const left = pad + (available - width) / 2;
  const topPad = viewportW >= 768 ? 20 : 12;
  const navHeight = viewportW >= 768 ? 56 : 48;
  const navBottom = topPad + navHeight;
  return { width, left, navBottom };
}

function computeHeroLayout(progress: number, viewportW: number, viewportH: number): HeroLayout {
  const p = Math.min(1, Math.max(0, progress));
  const margin = HERO_MARGIN_PX;
  const header = headerContentBox(viewportW);
  const isMobile = viewportW < 640;

  let startW: number;
  let startLeft: number;
  let startTop: number;
  let startH: number;

  if (isMobile) {
    // Same framing as desktop — nav-aligned width, video below header (no bottom black box)
    startW = header.width;
    startLeft = header.left;
    startTop = header.navBottom + HEADER_GAP_BELOW_NAV;
    startH = Math.min(
      Math.max(260, Math.round(startW * 0.5)),
      Math.round(viewportH * 0.52),
      viewportH - startTop - 112
    );
  } else {
    startW = header.width;
    startLeft = header.left;
    startTop = header.navBottom + HEADER_GAP_BELOW_NAV;
    startH = Math.min(
      Math.max(280, Math.round(startW * 0.5)),
      Math.round(viewportH * 0.62),
      viewportH - startTop - 24
    );
  }

  const endW = viewportW - margin * 2;
  const endH = viewportH - margin * 2;
  const endLeft = margin;
  const endTop = margin;

  return {
    frameTop: startTop + (endTop - startTop) * p,
    frameLeft: startLeft + (endLeft - startLeft) * p,
    frameWidth: startW + (endW - startW) * p,
    frameHeight: startH + (endH - startH) * p,
    videoRadius: 14 + 6 * p,
  };
}

const HERO_DISCLAIMER_COLOR_DARK = '#52525b';
const HERO_DISCLAIMER_COLOR_LIGHT = '#a1a1aa';

function heroDisclaimerColor(expand: number): string {
  const t = Math.min(1, Math.max(0, expand));
  if (t <= 0) return HERO_DISCLAIMER_COLOR_DARK;
  if (t >= 1) return HERO_DISCLAIMER_COLOR_LIGHT;

  const dark = [0x52, 0x52, 0x5b];
  const light = [0xa1, 0xa1, 0xaa];
  const mix = dark.map((start, i) => Math.round(start + (light[i] - start) * t));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

const GmxStyleLanding: React.FC = () => {
  const { t } = useTranslation();
  const rotateLinesRaw = t('landing.hero.rotateLines', { returnObjects: true });
  const rotateLines = Array.isArray(rotateLinesRaw)
    ? (rotateLinesRaw as string[])
    : [...LANDING_ROTATE_LINES_FALLBACK];

  const expandRef = useRef(0);
  const targetExpandRef = useRef(0);
  const smoothRafRef = useRef<number | null>(null);
  const unlockedRef = useRef(false);
  const touchYRef = useRef<number | null>(null);
  const lockSnapshotRef = useRef<{ scrollY: number } | null>(null);

  const [expand, setExpand] = useState(0);
  const [scrollUnlocked, setScrollUnlocked] = useState(false);
  const [heroRevealed, setHeroRevealed] = useState(false);
  const [layout, setLayout] = useState<HeroLayout>(() =>
    computeHeroLayout(0, window.innerWidth, viewportHeight())
  );

  const applyProgress = (next: number) => {
    const p = Math.min(1, Math.max(0, next));
    expandRef.current = p;
    targetExpandRef.current = p;
    setExpand(p);
    setLayout(computeHeroLayout(p, window.innerWidth, viewportHeight()));
  };

  const unlockScroll = () => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    setScrollUnlocked(true);
    setHeroRevealed(true);

    const snapshot = lockSnapshotRef.current;
    lockSnapshotRef.current = null;
    if (snapshot) {
      unlockPageScroll(snapshot, 'hero');
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
    }
  };

  const scheduleSmoothExpand = () => {
    if (smoothRafRef.current != null) return;

    const tick = () => {
      const target = targetExpandRef.current;
      const current = expandRef.current;
      const diff = target - current;

      if (Math.abs(diff) < 0.002) {
        expandRef.current = target;
        setExpand(target);
        setLayout(computeHeroLayout(target, window.innerWidth, viewportHeight()));
        smoothRafRef.current = null;
        if (target >= 1 && !unlockedRef.current) unlockScroll();
        return;
      }

      const next = current + diff * 0.12;
      expandRef.current = next;
      setExpand(next);
      setLayout(computeHeroLayout(next, window.innerWidth, viewportHeight()));
      smoothRafRef.current = requestAnimationFrame(tick);
    };

    smoothRafRef.current = requestAnimationFrame(tick);
  };

  const nudgeHeroProgress = (direction: 1 | -1) => {
    targetExpandRef.current = Math.min(
      1,
      Math.max(0, targetExpandRef.current + direction * HERO_SCROLL_BUMP)
    );
    scheduleSmoothExpand();
  };

  useEffect(() => {
    const prevScrollRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';

    window.scrollTo(0, 0);
    expandRef.current = 0;
    targetExpandRef.current = 0;
    unlockedRef.current = false;
    setScrollUnlocked(false);
    setHeroRevealed(false);
    setExpand(0);
    setLayout(computeHeroLayout(0, window.innerWidth, viewportHeight()));

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      applyProgress(1);
      unlockScroll();
      return undefined;
    }

    lockSnapshotRef.current = { scrollY: 0 };
    lockPageScroll(0, 'hero');

    registerLandingWheelConsumer({
      id: 'hero',
      isActive: () => !unlockedRef.current,
      onWheel: (deltaY) => {
        if (unlockedRef.current) return false;
        if (Math.abs(deltaY) < 4) return true;
        nudgeHeroProgress(deltaY > 0 ? 1 : -1);
        return true;
      },
    });

    const onResize = () => {
      setLayout(computeHeroLayout(expandRef.current, window.innerWidth, viewportHeight()));
    };

    const onTouchStart = (e: TouchEvent) => {
      if (unlockedRef.current) return;
      touchYRef.current = e.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (unlockedRef.current || touchYRef.current == null) return;
      if (document.body.style.position !== 'fixed') return;
      const y = e.touches[0]?.clientY;
      if (y == null) return;
      e.preventDefault();
      if (Math.abs(touchYRef.current - y) < 4) return;
      nudgeHeroProgress(touchYRef.current - y > 0 ? 1 : -1);
      touchYRef.current = y;
    };

    const onTouchEnd = () => {
      touchYRef.current = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (unlockedRef.current) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        nudgeHeroProgress(1);
      }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        nudgeHeroProgress(-1);
      }
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      history.scrollRestoration = prevScrollRestoration;
      if (smoothRafRef.current != null) cancelAnimationFrame(smoothRafRef.current);
      unregisterLandingWheelConsumer('hero');
      if (!unlockedRef.current) {
        const snapshot = lockSnapshotRef.current;
        if (snapshot) unlockPageScroll(snapshot, 'hero');
      }
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.removeEventListener('resize', onResize);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const locked = !scrollUnlocked;
  const ctaReveal = Math.min(1, Math.max(0, (expand - 0.72) / 0.28));

  const frameBox: React.CSSProperties = {
    position: 'absolute',
    top: layout.frameTop,
    left: layout.frameLeft,
    width: layout.frameWidth,
    height: layout.frameHeight,
    borderRadius: layout.videoRadius,
  };

  return (
    <div className="landing-gmx">
      <LandingNav variant="light" layout="gmx" />

      <section
        className={`landing-gmx-hero landing-gmx-hero--centered landing-gmx-hero--scroll-expand${
          heroRevealed ? ' landing-gmx-hero--revealed' : ''
        }${locked ? ' landing-gmx-hero--scroll-locked' : ''}${
          ctaReveal > 0.02 ? ' landing-gmx-hero--cta-visible' : ''
        }${expand >= 0.98 ? ' landing-gmx-hero--fullscreen-cta' : ''}`}
        style={
          {
            '--hero-video-expand': expand,
            '--hero-cta-reveal': ctaReveal,
          } as React.CSSProperties
        }
      >
        <div className="landing-gmx-hero-sticky">
          <div className="landing-gmx-hero-viewport">
            <div className="landing-gmx-hero-video-zoom" style={frameBox} aria-hidden>
              <video
                className="landing-gmx-hero-video"
                src="/videos/hero-bg.mp4"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
              />
            </div>
            <div className="landing-gmx-hero-chrome">
              <div className="landing-gmx-hero-chrome-spacer" aria-hidden />
              <div className="landing-gmx-hero-chrome-title">
                <LandingHeroLines
                  lineDarkTop={t('landing.hero.lineDarkTop')}
                  rotateLines={rotateLines}
                  rotatePosition="two-row"
                />
              </div>
              <div className="landing-gmx-hero-cta-slot">
                <div
                  className="landing-gmx-hero-fs-cta"
                  role="group"
                  aria-label={t('common.getStarted')}
                  aria-hidden={ctaReveal < 0.15}
                >
                  <button
                    type="button"
                    className="landing-gmx-hero-fs-btn landing-gmx-hero-fs-btn--light"
                    onClick={() => goToOpenApp('', false)}
                    tabIndex={ctaReveal > 0.4 ? 0 : -1}
                  >
                    {t('common.openApp')}
                    <ArrowRight size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="landing-gmx-hero-fs-btn landing-gmx-hero-fs-btn--dark"
                    onClick={() => goToOpenApp('?section=bot', false)}
                    tabIndex={ctaReveal > 0.4 ? 0 : -1}
                  >
                    {t('common.startBot')}
                    <ArrowRight size={16} aria-hidden />
                  </button>
                </div>
              </div>
              <p
                className="landing-gmx-hero-disclaimer"
                style={{ color: heroDisclaimerColor(expand) }}
              >
                {t('landing.hero.disclaimer')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <LandingProductCarouselSection />
      <LandingSleepEarningsSection />
      <LandingAgentFeatureSections />
      <LandingHomeBentoCards />
      <LandingBotPitchSection />
      <LandingFaqSection />
      <LandingFooter />
    </div>
  );
};

export default GmxStyleLanding;
