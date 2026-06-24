import React from 'react';

type Props = {
  children: React.ReactNode;
  className?: string;
};

/** Glass card wrapper for Portfolio / Profile / News subpages only. */
const ProTradePageShell: React.FC<Props> = ({ children, className = '' }) => (
  <div className={`hl-page-shell ${className}`.trim()}>
    <article className="hl-page-card">{children}</article>
  </div>
);

export default ProTradePageShell;
