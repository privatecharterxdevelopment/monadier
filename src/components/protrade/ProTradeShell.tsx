import React from 'react';
import '../../styles/pro-trade-hl.css';

type Props = {
  children: React.ReactNode;
};

/** Full-viewport Hyperliquid-style shell — no Monadier sidebar. */
const ProTradeShell: React.FC<Props> = ({ children }) => {
  return <div className="hl-root">{children}</div>;
};

export default ProTradeShell;
