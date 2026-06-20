import React from 'react';
import SportsbetsOrderPanel from './SportsbetsOrderPanel';
import SportsbetsBetSlip from './SportsbetsBetSlip';
import type { HlOpenOrder, HlUserFill } from '../../../lib/hyperliquid/user';
import type { HlOutcomeMarket, HlOutcomePosition, OutcomeLegQuote, OutcomeSideIndex } from '../../../lib/hyperliquid/outcomes/types';
import type { useHyperliquidOutcomeTrading } from '../../../hooks/useHyperliquidOutcomeTrading';

type Trading = ReturnType<typeof useHyperliquidOutcomeTrading>;

type Props = {
  market: HlOutcomeMarket | null;
  side: OutcomeSideIndex;
  quote: OutcomeLegQuote | null;
  quoteLoading: boolean;
  bettingBalance: number;
  walletConnected: boolean;
  signedIn: boolean;
  onRequireSignIn?: (reason: string) => void;
  trading: Trading;
  positionSize: number;
  positions: HlOutcomePosition[];
  openOrders: HlOpenOrder[];
  fills: HlUserFill[];
  positionsLoading?: boolean;
  onSuccess?: () => void;
  onCancelOrder?: (outcomeId: number, side: 0 | 1, oid: number) => void;
};

const SportsbetsRightRail: React.FC<Props> = ({
  market,
  side,
  quote,
  quoteLoading,
  bettingBalance,
  walletConnected,
  signedIn,
  onRequireSignIn,
  trading,
  positionSize,
  positions,
  openOrders,
  fills,
  positionsLoading,
  onSuccess,
  onCancelOrder,
}) => (
  <div className="hl-sb-rail">
    <div className="hl-sb-rail-order">
      <SportsbetsOrderPanel
        market={market}
        side={side}
        quote={quote}
        quoteLoading={quoteLoading}
        bettingBalance={bettingBalance}
        walletConnected={walletConnected}
        signedIn={signedIn}
        onRequireSignIn={onRequireSignIn}
        trading={trading}
        positionSize={positionSize}
        onSuccess={onSuccess}
      />
    </div>
    <SportsbetsBetSlip
      positions={positions}
      openOrders={openOrders}
      fills={fills}
      loading={positionsLoading}
      signedIn={signedIn}
      walletConnected={walletConnected}
      onRequireSignIn={onRequireSignIn}
      onCancelOrder={onCancelOrder}
      cancelBusy={trading.busy}
    />
  </div>
);

export default SportsbetsRightRail;
