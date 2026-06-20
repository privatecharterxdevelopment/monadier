import React from 'react';
import SportsbetsOrderPanel from './SportsbetsOrderPanel';
import SportsbetsBetSlip from './SportsbetsBetSlip';
import type { HlOpenOrder, HlUserFill } from '../../../lib/hyperliquid/user';
import type { HlOutcomeMarket, HlOutcomeQuestion, HlOutcomePosition, OutcomeLegQuote, OutcomeSideIndex } from '../../../lib/hyperliquid/outcomes/types';
import type { useHyperliquidOutcomeTrading } from '../../../hooks/useHyperliquidOutcomeTrading';

type Trading = ReturnType<typeof useHyperliquidOutcomeTrading>;

type Props = {
  market: HlOutcomeMarket | null;
  question?: HlOutcomeQuestion | null;
  side: OutcomeSideIndex;
  quote: OutcomeLegQuote | null;
  quoteLoading: boolean;
  bettingBalance: number;
  walletConnected: boolean;
  signedIn: boolean;
  walletAddress?: string;
  onRequireSignIn?: (reason: string) => void;
  trading: Trading;
  positionSize: number;
  positions: HlOutcomePosition[];
  openOrders: HlOpenOrder[];
  fills: HlUserFill[];
  positionsLoading?: boolean;
  onSuccess?: () => void;
  onCancelOrder?: (outcomeId: number, side: 0 | 1, oid: number) => void;
  orderAction?: 'buy' | 'sell';
  onOrderActionChange?: (action: 'buy' | 'sell') => void;
  onCashOutPosition?: (position: HlOutcomePosition) => void;
};

const SportsbetsRightRail: React.FC<Props> = ({
  market,
  question,
  side,
  quote,
  quoteLoading,
  bettingBalance,
  walletConnected,
  signedIn,
  walletAddress,
  onRequireSignIn,
  trading,
  positionSize,
  positions,
  openOrders,
  fills,
  positionsLoading,
  onSuccess,
  onCancelOrder,
  orderAction,
  onOrderActionChange,
  onCashOutPosition,
}) => (
  <div className="hl-sb-rail">
    <div className="hl-sb-rail-scroll">
      <SportsbetsOrderPanel
        market={market}
        question={question}
        side={side}
        quote={quote}
        quoteLoading={quoteLoading}
        bettingBalance={bettingBalance}
        walletAddress={walletAddress}
        walletConnected={walletConnected}
        signedIn={signedIn}
        onRequireSignIn={onRequireSignIn}
        trading={trading}
        positionSize={positionSize}
        onSuccess={onSuccess}
        orderAction={orderAction}
        onOrderActionChange={onOrderActionChange}
      />
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
        onCashOutPosition={onCashOutPosition}
      />
    </div>
  </div>
);

export default SportsbetsRightRail;
