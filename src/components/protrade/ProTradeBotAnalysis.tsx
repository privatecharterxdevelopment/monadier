import React from 'react';

type Props = {
  walletConnected: boolean;
  perpCoin: string;
  scanCoin?: string;
  openPositionCoins?: string[];
};

/** Live bot scan bar — hidden; status lives in the positions dock only. */
const ProTradeBotAnalysis: React.FC<Props> = () => null;

export default ProTradeBotAnalysis;
