import React from 'react';
import { OFFICIAL_X_HANDLE, OFFICIAL_X_URL } from '../../lib/brand';

type Props = {
  /** Icon-only (nav) vs icon + @handle (footer). */
  variant?: 'icon' | 'label';
  className?: string;
};

/** Official X (Twitter) wordmark — not Lucide's generic close "X". */
function XLogo({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** Official HyperGain X / Twitter — @HyperGainAi */
const OfficialXLink: React.FC<Props> = ({ variant = 'icon', className = '' }) => (
  <a
    href={OFFICIAL_X_URL}
    target="_blank"
    rel="noopener noreferrer"
    className={`official-x-link official-x-link--${variant}${className ? ` ${className}` : ''}`}
    aria-label={`HyperGain on X (@${OFFICIAL_X_HANDLE})`}
    title={`@${OFFICIAL_X_HANDLE}`}
  >
    <XLogo size={variant === 'icon' ? 15 : 13} />
    {variant === 'label' ? <span>@{OFFICIAL_X_HANDLE}</span> : null}
  </a>
);

export default OfficialXLink;
