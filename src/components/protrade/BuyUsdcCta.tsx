import React from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { onrampProviderLabel } from '../../lib/onramp/buyUsdc';
import PaymentMethodMarks from './PaymentMethodMarks';

type Props = {
  onClick: () => void;
  /** Compact row for funds overview */
  compact?: boolean;
  className?: string;
};

/**
 * Checkout-style “Buy with card” entry — payment network marks + lock,
 * reads like a real on-ramp tile (MoonPay / Stripe pattern), not a promo card.
 */
const BuyUsdcCta: React.FC<Props> = ({ onClick, compact = false, className = '' }) => {
  const { t } = useTranslation();
  const provider = onrampProviderLabel();

  if (compact) {
    return (
      <button
        type="button"
        className={`hl-funds-buy-cta hl-funds-buy-cta--compact ${className}`.trim()}
        onClick={onClick}
      >
        <span className="hl-funds-buy-cta__main">
          <span className="hl-funds-buy-cta__label">{t('app.buyUsdc.ctaShort')}</span>
          <PaymentMethodMarks className="hl-funds-buy-cta__marks" wallets={false} />
        </span>
        <ChevronRight size={14} className="hl-funds-buy-cta__chev" aria-hidden />
      </button>
    );
  }

  return (
    <button type="button" className={`hl-funds-buy-cta ${className}`.trim()} onClick={onClick}>
      <span className="hl-funds-buy-cta__top">
        <span className="hl-funds-buy-cta__title-block">
          <strong>{t('app.buyUsdc.cta')}</strong>
          <em>{t('app.buyUsdc.ctaHint')}</em>
        </span>
        <ChevronRight size={16} className="hl-funds-buy-cta__chev" aria-hidden />
      </span>

      <PaymentMethodMarks className="hl-funds-buy-cta__marks" />

      <span className="hl-funds-buy-cta__trust-row">
        <Lock size={11} strokeWidth={2.25} aria-hidden />
        <span>{t('app.buyUsdc.ctaSecure', { provider })}</span>
      </span>
    </button>
  );
};

export default BuyUsdcCta;
