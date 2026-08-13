import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, CreditCard, ExternalLink, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProTradeThemeOptional } from '../../contexts/ProTradeThemeContext';
import {
  onrampProviderLabel,
  resolveOnrampBuyUrl,
} from '../../lib/onramp/buyUsdc';
import PaymentMethodMarks from './PaymentMethodMarks';

type Props = {
  open: boolean;
  onClose: () => void;
  walletAddress?: string | null;
  /** Prefill fiat amount when known */
  fiatAmount?: number;
  onRequireWallet?: () => void;
};

const BuyUsdcModal: React.FC<Props> = ({
  open,
  onClose,
  walletAddress,
  fiatAmount,
  onRequireWallet,
}) => {
  const { t, i18n } = useTranslation();
  const theme = useProTradeThemeOptional();
  const [iframeReady, setIframeReady] = useState(false);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const [needsPasteAddress, setNeedsPasteAddress] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [copied, setCopied] = useState(false);
  const provider = onrampProviderLabel();

  useEffect(() => {
    if (!open) {
      setIframeReady(false);
      setWidgetUrl(null);
      setNeedsPasteAddress(false);
      setLoadError(false);
      setLoadingUrl(false);
      setCopied(false);
      return;
    }
    if (!walletAddress) return;

    let cancelled = false;
    setLoadingUrl(true);
    setLoadError(false);
    setIframeReady(false);

    void (async () => {
      try {
        const resolved = await resolveOnrampBuyUrl({
          walletAddress,
          fiatAmount,
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
  }, [open, walletAddress, fiatAmount, theme, i18n.language]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const short =
    walletAddress && walletAddress.length > 12
      ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
      : walletAddress;

  const modal = (
    <div
      className={`hl-root hl-root--${theme} hl-modal-backdrop hl-modal-backdrop--funds`}
      role="presentation"
      onClick={onClose}
    >
      <div
        className="hl-modal hl-modal--buy-usdc"
        role="dialog"
        aria-labelledby="buy-usdc-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hl-modal-head hl-modal-head--compact">
          <div className="hl-buy-usdc__title-row">
            <span className="hl-buy-usdc__badge" aria-hidden>
              <CreditCard size={14} strokeWidth={2.25} />
            </span>
            <div>
              <h2 id="buy-usdc-title" className="hl-modal-title">
                {t('app.buyUsdc.title')}
              </h2>
              <PaymentMethodMarks className="hl-buy-usdc__marks" />
              <p className="hl-buy-usdc__sub">{t('app.buyUsdc.sub', { provider })}</p>
            </div>
          </div>
          <button type="button" className="hl-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="hl-buy-usdc__body">
          {!walletAddress ? (
            <div className="hl-buy-usdc__empty">
              <p>{t('app.buyUsdc.connectFirst', { provider })}</p>
              <button
                type="button"
                className="hl-funds-overview__btn hl-funds-overview__btn--primary"
                onClick={() => onRequireWallet?.()}
              >
                {t('common.connect')}
              </button>
            </div>
          ) : loadError && !widgetUrl ? (
            <div className="hl-buy-usdc__empty">
              <p>{t('app.buyUsdc.notConfigured')}</p>
              <p className="hl-buy-usdc__empty-note">{t('app.buyUsdc.notConfiguredHint')}</p>
            </div>
          ) : (
            <>
              <p className="hl-buy-usdc__note">{t('app.buyUsdc.trust', { provider })}</p>
              {needsPasteAddress && walletAddress ? (
                <div className="hl-buy-usdc__wallet">
                  <p>{t('app.buyUsdc.pasteWallet')}</p>
                  <button type="button" className="hl-buy-usdc__copy" onClick={() => void copyAddress()}>
                    <code>{short}</code>
                    {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                    <span>{copied ? t('app.buyUsdc.copied') : t('app.buyUsdc.copy')}</span>
                  </button>
                </div>
              ) : null}

              <div className="hl-buy-usdc__frame-wrap">
                {loadingUrl || !iframeReady ? (
                  <div className="hl-buy-usdc__loading" aria-live="polite">
                    <Loader2 size={20} className="animate-spin" aria-hidden />
                    <span>{t('app.buyUsdc.loading')}</span>
                  </div>
                ) : null}
                {widgetUrl ? (
                  <iframe
                    key={widgetUrl}
                    title={t('app.buyUsdc.title')}
                    className={`hl-buy-usdc__frame${iframeReady ? ' is-ready' : ''}`}
                    src={widgetUrl}
                    allow="accelerometer; autoplay; camera; gyroscope; payment; clipboard-write"
                    referrerPolicy="strict-origin-when-cross-origin"
                    onLoad={() => setIframeReady(true)}
                  />
                ) : null}
              </div>
            </>
          )}
        </div>

        {widgetUrl ? (
          <div className="hl-buy-usdc__foot">
            <a
              href={widgetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hl-buy-usdc__external"
            >
              <ExternalLink size={13} aria-hidden />
              {t('app.buyUsdc.openExternal')}
            </a>
            <p className="hl-buy-usdc__foot-note">{t('app.buyUsdc.afterBuy')}</p>
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default BuyUsdcModal;
