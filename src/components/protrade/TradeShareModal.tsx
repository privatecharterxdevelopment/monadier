import React, { useEffect, useState } from 'react';
import { Download, Loader2, Share2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import type { AggregatedHlCloseFill } from '../../lib/hyperliquid/hlFillAggregate';
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
  onClose: () => void;
};

const TradeShareModal: React.FC<Props> = ({
  fill,
  displayName,
  avatarUrl,
  userId,
  onClose,
}) => {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          if (typeof data === 'string' && data.trim()) referralCode = data.trim().toUpperCase();
        }
        if (!referralCode) {
          throw new Error(t('dock.shareNeedSignIn'));
        }

        const input = tradeShareInputFromCloseFill(fill, {
          displayName,
          avatarUrl,
          referralCode,
        });
        const png = await renderTradeShareCardPng(input);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(png);
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
  }, [fill, displayName, avatarUrl, userId, t]);

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
    <div className="hl-modal-backdrop hl-trade-share-backdrop" role="presentation" onClick={onClose}>
      <div
        className="hl-trade-share-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('dock.shareTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="hl-trade-share-head">
          <h2>{t('dock.shareTitle')}</h2>
          <button type="button" className="hl-topnav-icon-btn" aria-label={t('common.closeMenu')} onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="hl-trade-share-body">
          {busy ? (
            <div className="hl-trade-share-loading">
              <Loader2 size={22} className="animate-spin" aria-hidden />
              <span>{t('dock.shareBuilding')}</span>
            </div>
          ) : null}
          {error ? <p className="hl-trade-share-error">{error}</p> : null}
          {previewUrl ? (
            <img className="hl-trade-share-preview" src={previewUrl} alt={t('dock.shareTitle')} />
          ) : null}
        </div>

        <footer className="hl-trade-share-actions">
          <button type="button" className="term-btn-sm" disabled={!blob || sharing} onClick={() => void onShare()}>
            {sharing ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
            {t('dock.shareNative')}
          </button>
          <button
            type="button"
            className="term-btn-sm term-btn-sm--primary"
            disabled={!blob}
            onClick={onDownload}
          >
            <Download size={14} />
            {t('dock.shareDownload')}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default TradeShareModal;
