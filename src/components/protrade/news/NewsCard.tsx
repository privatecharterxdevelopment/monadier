import React from 'react';
import { ExternalLink, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { NewsItemDto } from '../../lib/newsFeed';

type Props = {
  item: NewsItemDto;
  variant: 'crypto' | 'sports';
  onTradeCrypto?: (coin: string) => void;
  onTradeSports?: (outcomeId: number, eventName: string) => void;
};

function impactClass(impact: string): string {
  if (impact === 'critical') return 'hl-news-impact--critical';
  if (impact === 'high') return 'hl-news-impact--high';
  if (impact === 'medium') return 'hl-news-impact--medium';
  return 'hl-news-impact--low';
}

function biasIcon(bias: string) {
  if (bias === 'bullish') return <TrendingUp size={14} aria-hidden />;
  if (bias === 'bearish' || bias === 'risk_off') return <TrendingDown size={14} aria-hidden />;
  return <Minus size={14} aria-hidden />;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function resolvePrimaryCoin(item: NewsItemDto): string | null {
  const a = item.analysis;
  if (a.primaryAsset) return a.primaryAsset;
  const alts = item.assets.filter((t) => t !== 'BTC' && t !== 'ETH');
  if (alts.length === 1) return alts[0];
  if (a.affectedAssets?.length === 1) return a.affectedAssets[0];
  if (item.assets.length === 1) return item.assets[0];
  return null;
}

const NewsCard: React.FC<Props> = ({ item, variant, onTradeCrypto, onTradeSports }) => {
  const a = item.analysis;
  const primaryCoin = resolvePrimaryCoin(item);
  const assetTags =
    a.affectedAssets?.length > 0
      ? a.affectedAssets
      : item.assets.length > 0
        ? item.assets
        : [];
  const actionable =
    primaryCoin &&
    (a.suggestedAction === 'LONG' || a.suggestedAction === 'SHORT' || a.suggestedAction === 'FADE');

  return (
    <article className={`hl-news-card hl-news-card--${variant}`}>
      <header className="hl-news-card__head">
        <div className="hl-news-card__tags">
          <span className={`hl-news-impact ${impactClass(a.impact)}`}>{a.impact}</span>
          {variant === 'crypto' && assetTags.length > 0 ? (
            assetTags.slice(0, 3).map((ticker) => (
              <span
                key={ticker}
                className={`hl-news-card__asset${ticker === primaryCoin ? ' hl-news-card__asset--primary' : ''}`}
              >
                {ticker}
              </span>
            ))
          ) : null}
          {variant === 'crypto' && assetTags.length === 0 ? (
            <span className="hl-news-card__asset hl-news-card__asset--macro">Macro</span>
          ) : null}
        </div>
        <span className="hl-news-card__meta">
          {item.source} · {timeAgo(item.publishedAt)}
        </span>
      </header>

      <div className="hl-news-card__body">
        <h3 className="hl-news-card__title">{item.headline}</h3>

        {item.snippet && item.snippet !== item.headline ? (
          <p className="hl-news-card__snippet">{item.snippet}</p>
        ) : null}

        <div className="hl-news-ai">
          <div className="hl-news-ai__row">
            <span className={`hl-news-bias hl-news-bias--${a.bias}`}>
              {biasIcon(a.bias)}
              {a.engine === 'openai' ? 'GPT' : 'Desk'}: {a.bias.replace(/_/g, ' ')} · {a.confidence}%
            </span>
            <span className="hl-news-ai__horizon">{a.horizon} horizon</span>
          </div>
          <p className="hl-news-ai__hint">{a.priceHint}</p>
          <p className="hl-news-ai__reason">{a.reasoning}</p>
          {a.suggestedAction && a.suggestedAction !== 'NONE' ? (
            <p className="hl-news-ai__action">
              Suggested:{' '}
              <strong>
                {a.suggestedAction}
                {primaryCoin ? ` ${primaryCoin}` : ''}
              </strong>
            </p>
          ) : null}
        </div>

        {variant === 'sports' && item.prognosis ? (
          <div className="hl-news-prognosis">
            <p className="hl-news-prognosis__event">{item.prognosis.eventName}</p>
            <p className="hl-news-prognosis__pick">
              <strong>{item.prognosis.favoredLeg}</strong> — AI prognosis{' '}
              <strong>{item.prognosis.prognosisPct}%</strong>
            </p>
            <p className="hl-news-prognosis__why">{item.prognosis.reasoning}</p>
          </div>
        ) : null}
      </div>

      <footer className="hl-news-card__foot">
        {variant === 'crypto' && onTradeCrypto && actionable ? (
          <button
            type="button"
            className="hl-news-btn hl-news-btn--primary"
            onClick={() => onTradeCrypto(primaryCoin!)}
          >
            {a.suggestedAction} {primaryCoin}
          </button>
        ) : null}
        {variant === 'crypto' && onTradeCrypto && primaryCoin && !actionable ? (
          <button
            type="button"
            className="hl-news-btn hl-news-btn--ghost"
            onClick={() => onTradeCrypto(primaryCoin)}
          >
            Chart {primaryCoin}
          </button>
        ) : null}
        {variant === 'sports' && item.prognosis?.outcomeId && onTradeSports ? (
          <button
            type="button"
            className="hl-news-btn hl-news-btn--primary"
            onClick={() => onTradeSports(item.prognosis!.outcomeId!, item.prognosis!.eventName)}
          >
            Open bet · {item.prognosis.favoredLeg}
          </button>
        ) : null}
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hl-news-btn hl-news-btn--ghost"
          >
            Source
            <ExternalLink size={12} aria-hidden />
          </a>
        ) : null}
      </footer>
    </article>
  );
};

export default NewsCard;
