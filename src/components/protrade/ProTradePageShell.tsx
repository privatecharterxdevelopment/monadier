import React from 'react';

type Props = {
  children: React.ReactNode;
  className?: string;
};

/** Grey canvas + white cards for Profile / Portfolio / News meta pages. */
const ProTradePageShell: React.FC<Props> = ({ children, className = '' }) => (
  <div className={`hl-meta-page-shell hl-page-shell ${className}`.trim()}>
    <div className="hl-meta-page">
      <div className="hl-meta-canvas">{children}</div>
    </div>
  </div>
);

export default ProTradePageShell;
