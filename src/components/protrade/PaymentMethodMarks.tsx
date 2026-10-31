import React from 'react';

/**
 * Checkout acceptance marks — flat brand colors, Stripe/MoonPay-style rail.
 */

export const VisaMark: React.FC = () => (
  <svg viewBox="0 0 48 32" width="36" height="24" aria-hidden focusable="false">
    <rect width="48" height="32" rx="3.5" fill="#1A1F71" />
    <text
      x="24"
      y="20.5"
      textAnchor="middle"
      fill="#fff"
      fontFamily="Arial Narrow, Arial, Helvetica, sans-serif"
      fontSize="13"
      fontWeight="700"
      letterSpacing="1.2"
    >
      VISA
    </text>
  </svg>
);

export const MastercardMark: React.FC = () => (
  <svg viewBox="0 0 48 32" width="36" height="24" aria-hidden focusable="false">
    <rect width="48" height="32" rx="3.5" fill="#fff" stroke="#DADCE0" strokeWidth="1" />
    <circle cx="19.5" cy="16" r="7.5" fill="#EB001B" />
    <circle cx="28.5" cy="16" r="7.5" fill="#F79E1B" />
    <path d="M24 10.2a7.5 7.5 0 0 1 0 11.6 7.5 7.5 0 0 1 0-11.6z" fill="#FF5F00" />
  </svg>
);

export const ApplePayMark: React.FC = () => (
  <svg viewBox="0 0 54 32" width="40" height="24" aria-hidden focusable="false">
    <rect width="54" height="32" rx="3.5" fill="#000" />
    {/* Apple logo */}
    <path
      fill="#fff"
      d="M14.6 9.4c.1-1 .6-1.9 1.4-2.5-.8-.9-2-1.4-3.1-1.2-1.3.2-2.4 1-2.9 2.1-1.2 2.1-.3 5.2.9 6.9.6.8 1.3 1.7 2.2 1.7.8 0 1.1-.5 2.1-.5s1.3.5 2.1.5c.9 0 1.5-.8 2.1-1.7.3-.5.6-1 .8-1.5-2-.8-2.3-3.1-1.6-4.3-.9.5-1.9.6-2 .5z"
    />
    <path
      fill="#fff"
      d="M16.3 6.2c.5-.6.8-1.4.7-2.2-.7.1-1.6.5-2.1 1.1-.5.6-.8 1.4-.7 2.2.8 0 1.6-.4 2.1-1.1z"
    />
    <text
      x="36"
      y="20.5"
      textAnchor="middle"
      fill="#fff"
      fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
      fontSize="12"
      fontWeight="500"
    >
      Pay
    </text>
  </svg>
);

export const GooglePayMark: React.FC = () => (
  <svg viewBox="0 0 54 32" width="40" height="24" aria-hidden focusable="false">
    <rect width="54" height="32" rx="3.5" fill="#fff" stroke="#DADCE0" strokeWidth="1" />
    {/* Multicolor G */}
    <path
      fill="#4285F4"
      d="M25.4 16.2v-2h5.5c.05.45.08.95.08 1.5 0 2.1-.55 3.75-1.65 4.9-1.1 1.15-2.6 1.75-4.55 1.75-1.9 0-3.5-.7-4.7-1.9a6.4 6.4 0 0 1-1.85-4.65c0-1.8.65-3.35 1.9-4.55 1.2-1.2 2.8-1.8 4.65-1.8 1.75 0 3.15.6 4.2 1.75l-1.45 1.45c-.65-.65-1.5-1.05-2.7-1.05-1.4 0-2.6.5-3.45 1.4-.85.9-1.3 2.05-1.3 3.35s.45 2.45 1.3 3.35c.85.9 2 1.35 3.45 1.35 1.25 0 2.2-.35 2.8-1 .5-.5.8-1.2.9-2.05h-4.43z"
    />
    <text
      x="41"
      y="20.5"
      textAnchor="middle"
      fill="#3C4043"
      fontFamily="Arial, Helvetica, sans-serif"
      fontSize="11"
      fontWeight="500"
    >
      Pay
    </text>
  </svg>
);

type MarksProps = {
  className?: string;
  wallets?: boolean;
};

export const PaymentMethodMarks: React.FC<MarksProps> = ({ className = '', wallets = true }) => (
  <div
    className={`hl-pay-marks ${className}`.trim()}
    role="img"
    aria-label="Visa, Mastercard, Apple Pay, Google Pay"
  >
    <span className="hl-pay-marks__chip">
      <VisaMark />
    </span>
    <span className="hl-pay-marks__chip">
      <MastercardMark />
    </span>
    {wallets ? (
      <>
        <span className="hl-pay-marks__chip">
          <ApplePayMark />
        </span>
        <span className="hl-pay-marks__chip">
          <GooglePayMark />
        </span>
      </>
    ) : null}
  </div>
);

export default PaymentMethodMarks;
