import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Circle,
  Rocket,
  Wallet,
  X,
  Coins,
  ExternalLink,
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

type Props = {
  onGoToBot: () => void;
};

const ProTradeWelcomeWalkthrough: React.FC<Props> = ({ onGoToBot }) => {
  const { t } = useTranslation();
  const { user, sessionReady } = useAuth();
  const { open } = useMonadierAppKit();
  const { address, isConnected } = useMonadierWallet();
  const [openModal, setOpenModal] = useState(false);
  const [fundReady, setFundReady] = useState(false);

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

  return createPortal(
    <div
      className="hl-welcome-backdrop"
      role="presentation"
      onClick={dismiss}
    >
      <div
        className="hl-welcome-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hl-welcome-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="hl-welcome-close"
          onClick={dismiss}
          aria-label={t('welcomeWalkthrough.close')}
        >
          <X size={16} />
        </button>

        <header className="hl-welcome-head">
          <p className="hl-welcome-kicker">{BRAND_NAME}</p>
          <h2 id="hl-welcome-title" className="hl-welcome-title">
            {t('welcomeWalkthrough.title')}
          </h2>
          <p className="hl-welcome-lead">{t('welcomeWalkthrough.lead')}</p>
        </header>

        <ol className="hl-welcome-steps">
          <li className={`hl-welcome-step${isConnected ? ' hl-welcome-step--done' : ''}`}>
            <div className="hl-welcome-step-badge" aria-hidden>
              {isConnected ? <CheckCircle2 size={18} /> : <Wallet size={18} />}
            </div>
            <div className="hl-welcome-step-body">
              <h3>{t('welcomeWalkthrough.step1Title')}</h3>
              <p>{t('welcomeWalkthrough.step1Body')}</p>
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
            </div>
          </li>

          <li className={`hl-welcome-step${fundReady ? ' hl-welcome-step--done' : ''}`}>
            <div className="hl-welcome-step-badge" aria-hidden>
              {fundReady ? <CheckCircle2 size={18} /> : <Coins size={18} />}
            </div>
            <div className="hl-welcome-step-body">
              <h3>{t('welcomeWalkthrough.step2Title')}</h3>
              <p>{t('welcomeWalkthrough.step2Body')}</p>
              <ul className="hl-welcome-bullets">
                <li>{t('welcomeWalkthrough.step2BulletTopup')}</li>
                <li>{t('welcomeWalkthrough.step2BulletConvert')}</li>
              </ul>
              <div className="hl-welcome-step-actions">
                <button
                  type="button"
                  className="hl-welcome-btn hl-welcome-btn--secondary"
                  onClick={handleOpenWallet}
                >
                  <ExternalLink size={14} aria-hidden />
                  {t('welcomeWalkthrough.openWallet')}
                </button>
                <button
                  type="button"
                  className={`hl-welcome-btn ${fundReady ? 'hl-welcome-btn--done' : 'hl-welcome-btn--ghost'}`}
                  onClick={() => setFundReady(true)}
                >
                  {fundReady ? (
                    <>
                      <CheckCircle2 size={14} aria-hidden />
                      {t('welcomeWalkthrough.fundsReady')}
                    </>
                  ) : (
                    <>
                      <Circle size={14} aria-hidden />
                      {t('welcomeWalkthrough.markFundsReady')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </li>

          <li className="hl-welcome-step">
            <div className="hl-welcome-step-badge" aria-hidden>
              <Rocket size={18} />
            </div>
            <div className="hl-welcome-step-body">
              <h3>{t('welcomeWalkthrough.step3Title')}</h3>
              <p>{t('welcomeWalkthrough.step3Body')}</p>
            </div>
          </li>
        </ol>

        <footer className="hl-welcome-foot">
          <button type="button" className="hl-welcome-skip" onClick={dismiss}>
            {t('welcomeWalkthrough.skip')}
          </button>
          <button
            type="button"
            className="hl-welcome-btn hl-welcome-btn--primary hl-welcome-btn--cta"
            onClick={handleStartTrading}
          >
            <Rocket size={14} aria-hidden />
            {t('welcomeWalkthrough.startTrading')}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
};

export default ProTradeWelcomeWalkthrough;
