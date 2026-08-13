import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMonadierAppKit } from '../../hooks/useMonadierAppKit';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useProTradeThemeOptional } from '../../contexts/ProTradeThemeContext';
import {
  isOnrampComingSoon,
  onrampProviderLabel,
  resolveOnrampBuyUrl,
} from '../../lib/onramp/buyUsdc';
import PaymentMethodMarks from './PaymentMethodMarks';

/**
 * Dedicated Buy Crypto page — centered MoonPay widget, partners below.
 */
const ProTradeBuyCryptoPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const theme = useProTradeThemeOptional();
  const { open } = useMonadierAppKit();
  const { address, isConnected } = useMonadierWallet();
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

  const short =
    address && address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;

  return (
    <div className="hl-buy-page">
      <header className="hl-buy-page__hero">
        <h1 className="hl-buy-page__title">
          {t('app.buyCrypto.titleBefore')}
          <span className="hl-buy-page__crypto">{t('app.buyCrypto.cryptoWord')}</span>
          {t('app.buyCrypto.titleAfter', { provider })}
        </h1>
        <p className="hl-buy-page__lead">{t('app.buyCrypto.lead')}</p>
      </header>

      <div className="hl-buy-page__stage">
        <div className="hl-buy-page__card" role="region" aria-label={t('app.buyCrypto.widgetLabel')}>
          <div className="hl-buy-page__secure">
            <Lock size={12} strokeWidth={2.25} aria-hidden />
            <span>{t('app.buyUsdc.ctaSecure', { provider })}</span>
          </div>

          {comingSoon ? (
            <div className="hl-buy-page__empty hl-buy-usdc__coming-soon">
              <p className="hl-buy-usdc__coming-soon-badge">{t('app.buyUsdc.comingSoon')}</p>
              <p>{t('app.buyUsdc.comingSoonHint', { provider })}</p>
            </div>
          ) : !isConnected || !address ? (
            <div className="hl-buy-page__empty">
              <p>{t('app.buyUsdc.connectFirst')}</p>
              <button
                type="button"
                className="hl-funds-overview__btn hl-funds-overview__btn--primary"
                onClick={() => open()}
              >
                {t('common.connect')}
              </button>
            </div>
          ) : loadError && !widgetUrl ? (
            <div className="hl-buy-page__empty">
              <p>{t('app.buyUsdc.notConfigured')}</p>
              <p className="hl-buy-usdc__hint">{t('app.buyUsdc.notConfiguredHint')}</p>
            </div>
          ) : (
            <>
              {needsPasteAddress && address ? (
                <div className="hl-buy-usdc__wallet hl-buy-page__wallet">
                  <p>{t('app.buyUsdc.pasteWallet')}</p>
                  <button type="button" className="hl-buy-usdc__copy" onClick={() => void copyAddress()}>
                    <code>{short}</code>
                    {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                    <span>{copied ? t('app.buyUsdc.copied') : t('app.buyUsdc.copy')}</span>
                  </button>
                </div>
              ) : null}

              <div className="hl-buy-page__frame-wrap">
                {loadingUrl || !iframeReady ? (
                  <div className="hl-buy-page__loading" aria-live="polite">
                    <Loader2 size={22} className="animate-spin" aria-hidden />
                    <span>{t('app.buyUsdc.loading')}</span>
                  </div>
                ) : null}
                {widgetUrl ? (
                  <iframe
                    key={widgetUrl}
                    title={t('app.buyCrypto.widgetLabel')}
                    className={`hl-buy-page__frame${iframeReady ? ' is-ready' : ''}`}
                    src={widgetUrl}
                    allow="accelerometer; autoplay; camera; gyroscope; payment; clipboard-write"
                    referrerPolicy="strict-origin-when-cross-origin"
                    onLoad={() => setIframeReady(true)}
                  />
                ) : null}
              </div>
            </>
          )}

          {widgetUrl && !comingSoon ? (
            <div className="hl-buy-page__card-foot">
              <a
                href={widgetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hl-buy-usdc__external"
              >
                <ExternalLink size={13} aria-hidden />
                {t('app.buyUsdc.openExternal')}
              </a>
              <p>{t('app.buyUsdc.afterBuy')}</p>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="hl-buy-page__partners">
        <p className="hl-buy-page__partners-label">{t('app.buyCrypto.partners')}</p>
        <PaymentMethodMarks className="hl-buy-page__marks" />
      </footer>
    </div>
  );
};

export default ProTradeBuyCryptoPage;
