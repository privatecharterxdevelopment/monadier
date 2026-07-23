import React from 'react';

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Full-width terminal layout — no 1120px center column / gray meta canvas. */
  bleed?: boolean;
};

/** Meta pages (news/portfolio) use centered canvas; bleed = edge-to-edge terminal. */
const ProTradePageShell: React.FC<Props> = ({ children, className = '', bleed = false }) => {
  if (bleed) {
    return <div className={`hl-bleed-page ${className}`.trim()}>{children}</div>;
  }
  return (
    <div className={`hl-meta-page-shell hl-page-shell ${className}`.trim()}>
      <div className="hl-meta-page">
        <div className="hl-meta-canvas">{children}</div>
      </div>
    </div>
  );
};

export default ProTradePageShell;
