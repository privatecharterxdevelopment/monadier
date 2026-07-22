import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Share2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import type { AggregatedHlCloseFill } from '../../lib/hyperliquid/hlFillAggregate';
import { fillPositionDirection } from '../../lib/hyperliquid/format';
import { toNum } from '../../lib/hyperliquid/parse';
import { buildReferralShareUrl } from '../../lib/referralCapture';
import {
  downloadTradeSharePng,
  renderTradeShareCardPng,
  shareTradeSharePng,
  tradeShareInputFromCloseFill,
} from '../../lib/tradeShareCard';

type Props = {
  fill: AggregatedHlCloseFill;
  displayName: string;
  avatarUrl?: string | null;
  userId?: string | null;
  leverage?: number | null;
  onClose: () => void;
};

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
      />
    </svg>
  );
}

function XTwitterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.833L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.44-.752-.244-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141a.506.506 0 0 1 .171.325c.016.093.036.306.02.472z"
      />
    </svg>
  );
}

const TradeShareModal: React.FC<Props> = ({
  fill,
  displayName,
  avatarUrl,
  userId,
  leverage,
  onClose,
}) => {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [referralUrl, setReferralUrl] = useState<string>('https://app.hypergain.io');
  const [busy, setBusy] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareText = useMemo(() => {
    const side = fillPositionDirection(fill);
    const pnl = toNum(fill.closedPnl);
    const sign = pnl > 0 ? '+' : '';
    return `My ${fill.coin} ${side} on HyperGain: ${sign}${pnl.toFixed(2)} USD\n${referralUrl}`;
  }, [fill, referralUrl]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const run = async () => {
      setBusy(true);
      setError(null);
      try {
        let referralCode: string | null = null;
        if (userId) {
          const { data } = await supabase.rpc('generate_referral_code', {
            p_user_id: userId,
          });
          if (typeof data === 'string' && data.trim()) {
            referralCode = data.trim().toUpperCase();
          }
        }
        if (!referralCode) {
          throw new Error(t('dock.shareNeedSignIn'));
        }

        const url = buildReferralShareUrl(referralCode);
        const shareInput = tradeShareInputFromCloseFill(fill, {
          displayName,
          avatarUrl,
          referralCode,
          leverage: leverage ?? null,
        });
        const png = await renderTradeShareCardPng(shareInput);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(png);
        setReferralUrl(url);
        setBlob(png);
        setPreviewUrl(objectUrl);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t('dock.shareFailed'));
      } finally {
        if (!cancelled) setBusy(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fill, displayName, avatarUrl, userId, leverage, t]);

  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const shareWhatsApp = () => {
    if (blob) downloadTradeSharePng(blob, fill.coin);
    openExternal(`https://wa.me/?text=${encodeURIComponent(shareText)}`);
  };

  const shareFacebook = () => {
    if (blob) downloadTradeSharePng(blob, fill.coin);
    openExternal(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralUrl)}`
    );
  };

  const shareX = () => {
    openExternal(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`);
  };

  const shareTelegram = () => {
    openExternal(
      `https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent(shareText)}`
    );
  };

  const onDownload = () => {
    if (!blob) return;
    downloadTradeSharePng(blob, fill.coin);
  };

  const onShare = async () => {
    if (!blob || sharing) return;
    setSharing(true);
    try {
      await shareTradeSharePng(blob, fill.coin);
    } catch {
      setError(t('dock.shareFailed'));
    } finally {
      setSharing(false);
    }
  };

  return (
    <div
      className="hl-modal-backdrop hl-trade-share-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="hl-trade-share-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('dock.shareTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="hl-trade-share-close"
          aria-label={t('common.closeMenu')}
          onClick={onClose}
        >
          <X size={16} />
        </button>

        <div className="hl-trade-share-body">
          {busy ? (
            <div className="hl-trade-share-loading">
              <Loader2 size={22} className="animate-spin" aria-hidden />
              <span>{t('dock.shareBuilding')}</span>
            </div>
          ) : null}
          {error ? <p className="hl-trade-share-error">{error}</p> : null}
          {previewUrl ? (
            <div className="hl-trade-share-stage">
              <img
                className="hl-trade-share-preview"
                src={previewUrl}
                alt={t('dock.shareTitle')}
              />
            </div>
          ) : null}
        </div>

        <div className="hl-trade-share-footer">
          <p className="hl-trade-share-via">{t('dock.shareVia')}</p>
          <div className="hl-trade-share-social" aria-label={t('dock.shareVia')}>
            <button
              type="button"
              className="hl-trade-share-social-btn hl-trade-share-social-btn--whatsapp"
              disabled={!blob}
              onClick={shareWhatsApp}
              aria-label="WhatsApp"
              title="WhatsApp"
            >
              <WhatsAppIcon />
            </button>
            <button
              type="button"
              className="hl-trade-share-social-btn hl-trade-share-social-btn--facebook"
              disabled={!blob}
              onClick={shareFacebook}
              aria-label="Facebook"
              title="Facebook"
            >
              <FacebookIcon />
            </button>
            <button
              type="button"
              className="hl-trade-share-social-btn hl-trade-share-social-btn--x"
              disabled={!blob}
              onClick={shareX}
              aria-label="X"
              title="X"
            >
              <XTwitterIcon />
            </button>
            <button
              type="button"
              className="hl-trade-share-social-btn hl-trade-share-social-btn--telegram"
              disabled={!blob}
              onClick={shareTelegram}
              aria-label="Telegram"
              title="Telegram"
            >
              <TelegramIcon />
            </button>
          </div>

          <div className="hl-trade-share-actions">
            <button
              type="button"
              className="hl-trade-share-action hl-trade-share-action--ghost"
              disabled={!blob || sharing}
              onClick={() => void onShare()}
            >
              {sharing ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />}
              {t('dock.shareNative')}
            </button>
            <button
              type="button"
              className="hl-trade-share-action hl-trade-share-action--primary"
              disabled={!blob}
              onClick={onDownload}
            >
              <Download size={15} />
              {t('dock.shareDownload')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradeShareModal;
