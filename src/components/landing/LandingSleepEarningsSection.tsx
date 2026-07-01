import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { TrendingUp, UserPlus, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLandingAutoSequence } from './useLandingAutoSequence';

type WinNotification = {
  amount: number;
  pair: string;
  minutesAgo: number;
};

const WIN_NOTIFICATIONS: WinNotification[] = [
  { amount: 14.92, pair: 'ETH', minutesAgo: 18 },
  { amount: 3.75, pair: 'BTC', minutesAgo: 12 },
  { amount: 411.59, pair: 'HYPE', minutesAgo: 3 },
  { amount: 52.08, pair: 'ARB', minutesAgo: 1 },
];

const PILL_KEYS = ['run247'] as const;

const NOTIF_STEP_MS = 1650;
const NOTIF_EASE = [0.22, 1, 0.36, 1] as const;
const LOCK_SCREEN_TIME = '9:41';

function fmtUsd(amount: number): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function HyperGainNotifMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      className="landing-sleep-notif-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
    >
      <rect width="32" height="32" rx="8" fill="rgba(255, 255, 255, 0.94)" />
      <path
        d="M16 8V24M8 16H24"
        stroke="#0a0a0a"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Pinned iPhone mockup — one win notification per scroll step, headline overlay at end. */
const LandingSleepEarningsSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [titleDone, setTitleDone] = useState(false);
  const [descriptionDone, setDescriptionDone] = useState(false);

  const lockDate = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(new Date()),
    [i18n.language]
  );

  const notifications = useMemo(
    () =>
      WIN_NOTIFICATIONS.map((row) => ({
        ...row,
        id: `${row.pair}-${row.amount}`,
        title: t('landing.sleepEarnings.notificationTitle', { pair: row.pair }),
        time: t('landing.sleepEarnings.minutesAgo', { count: row.minutesAgo }),
        amountLabel: t('landing.sleepEarnings.amount', { amount: fmtUsd(row.amount) }),
      })),
    [t]
  );

  const overlayStep = notifications.length;
  const stepCount = notifications.length + 1;

  const { sectionRef, stepIndex, complete } = useLandingAutoSequence({
    mode: 'step',
    stepCount,
    stepDurationMs: NOTIF_STEP_MS,
    visibilityThreshold: 0.28,
  });

  const visibleCount = Math.min(stepIndex + 1, notifications.length);
  const showOverlay = stepIndex >= overlayStep;
  const visibleNotifications = notifications.slice(0, visibleCount);
  const sequenceFinished = complete && descriptionDone;

  useEffect(() => {
    if (stepIndex < overlayStep) {
      setTitleDone(false);
      setDescriptionDone(false);
    }
  }, [stepIndex, overlayStep]);

  return (
    <section
      id="landing-sleep-earnings-section"
      ref={sectionRef}
      className={`landing-sleep-section landing-gmx-section--auto-play${
        sequenceFinished ? ' landing-sleep-section--finished' : ''
      }`}
      aria-labelledby="landing-sleep-earnings-title"
    >
      <div className="landing-sleep-sticky">
        <div className="landing-gmx-gutter landing-gmx-shell">
          <div className="landing-sleep-stack">
            <div className="landing-sleep-frame">
              <div className="landing-sleep-phone-clip" aria-hidden>
              <div className="landing-sleep-phone">
                <div className="landing-sleep-phone-notch" />
                <div className="landing-sleep-phone-screen">
                  <img
                    className="landing-sleep-wallpaper"
                    src="/images/landing/landing-sleep-iphone-wallpaper.png"
                    alt=""
                    decoding="async"
                    draggable={false}
                  />
                  <div className="landing-sleep-status-bar">
                    <time className="landing-sleep-status-time" dateTime="09:41">
                      {LOCK_SCREEN_TIME}
                    </time>
                    <span className="landing-sleep-status-notch-spacer" aria-hidden />
                    <time className="landing-sleep-status-date" dateTime={new Date().toISOString().slice(0, 10)}>
                      {lockDate}
                    </time>
                  </div>
                  <div className="landing-sleep-notifications">
                    <AnimatePresence initial={false}>
                      {visibleNotifications.map((n) => (
                        <motion.article
                          key={n.id}
                          className="landing-sleep-notif"
                          layout
                          initial={{ opacity: 0, y: -28, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -12, scale: 0.98 }}
                          transition={{
                            layout: { duration: 0.42, ease: NOTIF_EASE },
                            duration: 0.52,
                            ease: NOTIF_EASE,
                          }}
                        >
                          <HyperGainNotifMark />
                          <div className="landing-sleep-notif-body">
                            <div className="landing-sleep-notif-head">
                              <span className="landing-sleep-notif-app">
                                {t('landing.sleepEarnings.appName')}
                              </span>
                              <span className="landing-sleep-notif-time">{n.time}</span>
                            </div>
                            <p className="landing-sleep-notif-title">{n.title}</p>
                            <p className="landing-sleep-notif-amount">{n.amountLabel}</p>
                          </div>
                        </motion.article>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {showOverlay ? (
                <motion.div
                  className="landing-sleep-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.65, ease: NOTIF_EASE }}
                >
                  <div className="landing-sleep-overlay-inner">
                    <div className="landing-sleep-overlay-title-wrap">
                      <motion.h2
                        id="landing-sleep-earnings-title"
                        className="landing-sleep-overlay-title"
                        initial={{ opacity: 0, y: 28, filter: 'blur(10px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, filter: 'blur(6px)' }}
                        transition={{ duration: 0.78, delay: 0.06, ease: NOTIF_EASE }}
                        onAnimationComplete={() => {
                          if (showOverlay) setTitleDone(true);
                        }}
                      >
                        {t('landing.sleepEarnings.title')}
                      </motion.h2>
                    </div>
                    <AnimatePresence>
                      {titleDone ? (
                        <motion.p
                          className="landing-sleep-overlay-desc"
                          initial={{ opacity: 0, filter: 'blur(6px)' }}
                          animate={{ opacity: 1, filter: 'blur(0px)' }}
                          exit={{ opacity: 0, filter: 'blur(4px)' }}
                          transition={{ duration: 0.58, delay: 0.04, ease: NOTIF_EASE }}
                          onAnimationComplete={() => {
                            if (showOverlay && titleDone) setDescriptionDone(true);
                          }}
                        >
                          {t('landing.sleepEarnings.description')}
                        </motion.p>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            </div>

            <AnimatePresence>
              {descriptionDone ? (
                <motion.div
                  className="landing-sleep-pills"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: NOTIF_EASE }}
                  aria-label={t('landing.sleepEarnings.pillsAria')}
                >
                  {PILL_KEYS.map((key, i) => (
                    <motion.span
                      key={key}
                      className="landing-sleep-pill"
                      initial={{ opacity: 0, y: 18, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.98 }}
                      transition={{
                        duration: 0.48,
                        delay: i * 0.1,
                        ease: NOTIF_EASE,
                      }}
                    >
                      <TrendingUp size={16} strokeWidth={2.25} aria-hidden />
                      {t(`landing.sleepEarnings.pills.${key}`)}
                    </motion.span>
                  ))}
                  <motion.div
                    className="landing-sleep-pill landing-sleep-pill--register"
                    initial={{ opacity: 0, y: 18, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.98 }}
                    transition={{
                      duration: 0.48,
                      delay: PILL_KEYS.length * 0.1,
                      ease: NOTIF_EASE,
                    }}
                  >
                    <Link to="/register" className="landing-sleep-pill-register-link">
                      <UserPlus size={16} strokeWidth={2.25} aria-hidden />
                      {t('landing.sleepEarnings.registerCta')}
                    </Link>
                  </motion.div>
                  <motion.div
                    className="landing-sleep-pill-rainbow"
                    initial={{ opacity: 0, y: 18, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.98 }}
                    transition={{
                      duration: 0.48,
                      delay: (PILL_KEYS.length + 1) * 0.1,
                      ease: NOTIF_EASE,
                    }}
                  >
                    <Link to="/how-it-works" className="landing-sleep-pill-rainbow-link">
                      {t('nav.howItWorks')}
                      <ArrowRight size={16} strokeWidth={2.25} aria-hidden />
                    </Link>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LandingSleepEarningsSection;
