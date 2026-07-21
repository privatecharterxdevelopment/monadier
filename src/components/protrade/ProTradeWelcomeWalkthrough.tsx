import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coins,
  ExternalLink,
  Rocket,
  Wallet,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useMonadierAppKit } from '../../hooks/useMonadierAppKit';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import {
  readWelcomeWalkthroughDone,
  writeWelcomeWalkthroughDone,
} from '../../lib/welcomeWalkthrough';
import { BRAND_NAME } from '../../lib/brand';
import LanguageSwitcher from '../i18n/LanguageSwitcher';

type Props = {
  onGoToBot: () => void;
};

const TOTAL_STEPS = 4;

const ProTradeWelcomeWalkthrough: React.FC<Props> = ({ onGoToBot }) => {
  const { t } = useTranslation();
  const { user, sessionReady } = useAuth();
  const { open } = useMonadierAppKit();
  const { address, isConnected } = useMonadierWallet();
  const [openModal, setOpenModal] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!sessionReady || !user?.id) {
      setOpenModal(false);
      return;
    }
    if (readWelcomeWalkthroughDone(user.id)) {
      setOpenModal(false);
      return;
    }
    setOpenModal(true);
    setStep(0);
  }, [sessionReady, user?.id]);

  const dismiss = useCallback(() => {
    if (user?.id) writeWelcomeWalkthroughDone(user.id);
    setOpenModal(false);
  }, [user?.id]);

  const handleConnect = useCallback(() => {
    open({ view: 'Connect' });
  }, [open]);

  const handleOpenWallet = useCallback(() => {
    if (isConnected) {
      open();
      return;
    }
    open({ view: 'Connect' });
  }, [isConnected, open]);

  const handleStartTrading = useCallback(() => {
    dismiss();
    onGoToBot();
  }, [dismiss, onGoToBot]);

  const goNext = useCallback(() => {
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }, []);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  useEffect(() => {
    if (!openModal) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openModal, dismiss]);

  if (!openModal) return null;

  const shortAddr = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : '';
  const progress = t('welcomeWalkthrough.progress', {
    current: step + 1,
    total: TOTAL_STEPS,
  });
  const isLast = step === TOTAL_STEPS - 1;

  return createPortal(
    <div className="hl-welcome-backdrop" role="presentation" onClick={dismiss}>
      <div
        className="hl-welcome-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hl-welcome-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hl-welcome-topbar">
          <p className="hl-welcome-progress" aria-live="polite">
            {progress}
          </p>
          <button
            type="button"
            className="hl-welcome-close"
            onClick={dismiss}
            aria-label={t('welcomeWalkthrough.close')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="hl-welcome-foil" key={step}>
          {step === 0 ? (
            <>
              <p className="hl-welcome-kicker">{BRAND_NAME}</p>
              <h2 id="hl-welcome-title" className="hl-welcome-title">
                {t('welcomeWalkthrough.title')}
              </h2>
              <p className="hl-welcome-lead">{t('welcomeWalkthrough.lead')}</p>
              <div className="hl-welcome-lang-block">
                <p className="hl-welcome-lang-ask">{t('welcomeWalkthrough.languageAsk')}</p>
                <LanguageSwitcher variant="welcome" />
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="hl-welcome-icon" aria-hidden>
                <Wallet size={22} />
              </div>
              <h2 id="hl-welcome-title" className="hl-welcome-title">
                {t('welcomeWalkthrough.step1Title')}
              </h2>
              <p className="hl-welcome-lead">{t('welcomeWalkthrough.step1Body')}</p>
              {isConnected ? (
                <p className="hl-welcome-connected" role="status">
                  <CheckCircle2 size={14} aria-hidden />
                  {t('welcomeWalkthrough.connected', { address: shortAddr })}
                </p>
              ) : (
                <button
                  type="button"
                  className="hl-welcome-btn hl-welcome-btn--primary"
                  onClick={handleConnect}
                >
                  <Wallet size={14} aria-hidden />
                  {t('welcomeWalkthrough.connectWallet')}
                </button>
              )}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="hl-welcome-icon" aria-hidden>
                <Coins size={22} />
              </div>
              <h2 id="hl-welcome-title" className="hl-welcome-title">
                {t('welcomeWalkthrough.step2Title')}
              </h2>
              <p className="hl-welcome-lead">{t('welcomeWalkthrough.step2Body')}</p>
              <p className="hl-welcome-hint">{t('welcomeWalkthrough.step2Hint')}</p>
              <button
                type="button"
                className="hl-welcome-btn hl-welcome-btn--secondary"
                onClick={handleOpenWallet}
              >
                <ExternalLink size={14} aria-hidden />
                {t('welcomeWalkthrough.openWallet')}
              </button>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="hl-welcome-icon" aria-hidden>
                <Rocket size={22} />
              </div>
              <h2 id="hl-welcome-title" className="hl-welcome-title">
                {t('welcomeWalkthrough.step3Title')}
              </h2>
              <p className="hl-welcome-lead">{t('welcomeWalkthrough.step3Body')}</p>
            </>
          ) : null}
        </div>

        <footer className="hl-welcome-foot">
          <button type="button" className="hl-welcome-skip" onClick={dismiss}>
            {t('welcomeWalkthrough.skip')}
          </button>
          <div className="hl-welcome-nav">
            {step > 0 ? (
              <button
                type="button"
                className="hl-welcome-btn hl-welcome-btn--ghost"
                onClick={goBack}
              >
                <ArrowLeft size={14} aria-hidden />
                {t('welcomeWalkthrough.back')}
              </button>
            ) : null}
            {isLast ? (
              <button
                type="button"
                className="hl-welcome-btn hl-welcome-btn--primary"
                onClick={handleStartTrading}
              >
                <Rocket size={14} aria-hidden />
                {t('welcomeWalkthrough.startTrading')}
              </button>
            ) : (
              <button
                type="button"
                className="hl-welcome-btn hl-welcome-btn--primary"
                onClick={goNext}
              >
                {t('welcomeWalkthrough.next')}
                <ArrowRight size={14} aria-hidden />
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
};

export default ProTradeWelcomeWalkthrough;
