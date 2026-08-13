import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppKit } from '@reown/appkit/react';
import { Check, Copy, ExternalLink, Loader2, Lock, Wallet } from 'lucide-react';
import MarketingPageLayout from '../components/layout/MarketingPageLayout';
import PaymentMethodMarks from '../components/protrade/PaymentMethodMarks';
import { useAuth } from '../contexts/AuthContext';
import { useLandingTheme } from '../contexts/LandingThemeContext';
import { useMonadierWallet } from '../hooks/useMonadierWallet';
import { goToOpenApp, goToOpenAppRegister } from '../lib/appUrls';
import {
  isOnrampComingSoon,
  onrampProviderLabel,
  resolveOnrampBuyUrl,
} from '../lib/onramp/buyUsdc';

/**
 * Marketing subpage: connect wallet → buy USDC (MoonPay) → optional register / start bot.
 * Wallet connect is ungated (no HyperGain login required to purchase).
 */
const BuyCryptoLandingPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme } = useLandingTheme();
  const { open } = useAppKit();
  const { address, isConnected } = useMonadierWallet();
  const { isAuthenticated } = useAuth();
  const provider = onrampProviderLabel();
  const comingSoon = isOnrampComingSoon();

  const [iframeReady, setIframeReady] = useState(false);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const [needsPasteAddress, setNeedsPasteAddress] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (comingSoon || !isConnected || !address) {
      setWidgetUrl(null);
      setLoadError(false);
      setLoadingUrl(false);
      setIframeReady(false);
      return;
    }

    let cancelled = false;
    setLoadingUrl(true);
    setLoadError(false);
    setIframeReady(false);

    void (async () => {
      try {
        const resolved = await resolveOnrampBuyUrl({
          walletAddress: address,
          theme: theme === 'dark' ? 'dark' : 'light',
          language: i18n.language,
        });
        if (cancelled) return;
        if (!resolved.url) {
          setWidgetUrl(null);
          setLoadError(true);
          return;
        }
        setWidgetUrl(resolved.url);
        setNeedsPasteAddress(resolved.needsPasteAddress);
      } catch {
        if (!cancelled) {
          setWidgetUrl(null);
          setLoadError(true);
        }
      } finally {
        if (!cancelled) setLoadingUrl(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, address, theme, i18n.language, comingSoon]);

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const connectWallet = () => {
    open({ view: 'Connect' });
  };

  return (
    <MarketingPageLayout narrow centered>
      <section className="hg-buy-land" aria-labelledby="hg-buy-land-title">
        <p className="hg-buy-land__eyebrow">{t('landing.buyPage.eyebrow')}</p>
        <h1 id="hg-buy-land-title" className="hg-buy-land__title">
          {t('landing.buyPage.titleBefore')}
          <span className="hg-buy-land__accent">{t('landing.buyPage.titleAccent')}</span>
          {t('landing.buyPage.titleAfter', { provider })}
        </h1>
        <p className="hg-buy-land__lead">{t('landing.buyPage.lead')}</p>

        <PaymentMethodMarks className="hg-buy-land__marks" />

        <div className="hg-buy-land__panel" role="region" aria-label={t('app.buyUsdc.title')}>
          <p className="hg-buy-land__secure">
            <Lock size={12} strokeWidth={2.25} aria-hidden />
            <span>{t('app.buyUsdc.ctaSecure', { provider })}</span>
          </p>

          {comingSoon ? (
            <div className="hg-buy-land__empty hg-buy-land__coming-soon">
              <p className="hg-buy-land__coming-soon-badge">{t('app.buyUsdc.comingSoon')}</p>
              <p>{t('app.buyUsdc.comingSoonHint', { provider })}</p>
            </div>
          ) : !isConnected ? (
            <div className="hg-buy-land__empty">
              <p>{t('landing.buyPage.connectFirst')}</p>
              <button type="button" className="hg-buy-land__primary" onClick={connectWallet}>
                <Wallet size={16} aria-hidden />
                {t('landing.buyPage.connectCta')}
              </button>
              <p className="hg-buy-land__hint">{t('landing.buyPage.connectHint')}</p>
            </div>
          ) : loadError || !widgetUrl ? (
            <div className="hg-buy-land__empty">
              {loadingUrl ? (
                <>
                  <Loader2 className="hg-buy-land__spin" size={22} aria-hidden />
                  <p>{t('app.buyUsdc.loading')}</p>
                </>
              ) : (
                <>
                  <p>{t('app.buyUsdc.notConfigured')}</p>
                  <p className="hg-buy-land__hint">{t('app.buyUsdc.notConfiguredHint')}</p>
                </>
              )}
            </div>
          ) : (
            <>
              {needsPasteAddress && address ? (
                <div className="hg-buy-land__paste">
                  <p>{t('app.buyUsdc.pasteWallet')}</p>
                  <div className="hg-buy-land__paste-row">
                    <code>{address}</code>
                    <button type="button" onClick={() => void copyAddress()}>
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copied ? t('app.buyUsdc.copied') : t('app.buyUsdc.copy')}</span>
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="hg-buy-land__frame-wrap">
                {!iframeReady ? (
                  <div className="hg-buy-land__frame-loading" aria-hidden>
                    <Loader2 className="hg-buy-land__spin" size={22} />
                    <span>{t('app.buyUsdc.loading')}</span>
                  </div>
                ) : null}
                <iframe
                  className="hg-buy-land__frame"
                  src={widgetUrl}
                  title={t('app.buyUsdc.title')}
                  allow="accelerometer; autoplay; camera; gyroscope; payment; clipboard-write"
                  onLoad={() => setIframeReady(true)}
                />
              </div>
              <a
                className="hg-buy-land__external"
                href={widgetUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} aria-hidden />
                {t('app.buyUsdc.openExternal')}
              </a>
              <p className="hg-buy-land__hint">{t('app.buyUsdc.afterBuy')}</p>
            </>
          )}
        </div>

        <ol className="hg-buy-land__steps" aria-label={t('landing.buyPage.stepsLabel')}>
          <li className={isConnected ? 'is-done' : 'is-active'}>
            <span className="hg-buy-land__step-num">1</span>
            <span>{t('landing.buyPage.stepConnect')}</span>
          </li>
          <li className={isConnected ? 'is-active' : ''}>
            <span className="hg-buy-land__step-num">2</span>
            <span>{t('landing.buyPage.stepBuy')}</span>
          </li>
          <li>
            <span className="hg-buy-land__step-num">3</span>
            <span>{t('landing.buyPage.stepTrade')}</span>
          </li>
        </ol>

        <div className="hg-buy-land__next">
          <h2 className="hg-buy-land__next-title">{t('landing.buyPage.afterTitle')}</h2>
          <p className="hg-buy-land__next-lead">{t('landing.buyPage.afterLead')}</p>
          <div className="hg-buy-land__next-actions">
            {!isAuthenticated ? (
              <button
                type="button"
                className="hg-buy-land__primary"
                onClick={() => goToOpenAppRegister(false)}
              >
                {t('landing.buyPage.registerCta')}
              </button>
            ) : null}
            <button
              type="button"
              className="hg-buy-land__secondary"
              onClick={() => goToOpenApp('?section=bot', false)}
            >
              {t('landing.buyPage.startBotCta')}
            </button>
          </div>
          <p className="hg-buy-land__foot">
            <Link to="/how-it-works">{t('common.howItWorks')}</Link>
            {' · '}
            <Link to="/docs">{t('footer.docs')}</Link>
          </p>
        </div>
      </section>
    </MarketingPageLayout>
  );
};

export default BuyCryptoLandingPage;
