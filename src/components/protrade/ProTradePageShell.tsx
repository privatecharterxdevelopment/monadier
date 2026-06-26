import React from 'react';

type Props = {
  children: React.ReactNode;
  className?: string;
};

/** Full-width linear shell for Profile / Portfolio / News — matches trading terminal. */
const ProTradePageShell: React.FC<Props> = ({ children, className = '' }) => (
  <div className={`hl-meta-page-shell hl-page-shell ${className}`.trim()}>
    <div className="hl-meta-page hl-page-card">{children}</div>
  </div>
);

export default ProTradePageShell;
