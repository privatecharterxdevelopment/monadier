import React, { useMemo, useState } from 'react';
import { AlertCircle, ArrowDownUp, Loader2 } from 'lucide-react';
import { useMonadierAppKit } from '../../hooks/useMonadierAppKit';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useHyperliquidTrading } from '../../hooks/useHyperliquidTrading';
import type { HlSpotBalance } from '../../lib/hyperliquid/user';
import { DEFAULT_SWAP_COIN } from '../../lib/hyperliquid/constants';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { toNum } from '../../lib/hyperliquid/parse';
import { estimateSwapQuote } from '../../lib/hyperliquid/swap';
import type { HlL2Book } from '../../lib/hyperliquid/types';

type Props = {
  spotBalances: HlSpotBalance[];
  markPx: number;
  book: HlL2Book | null;
  onSuccess?: () => void;
};

const ProTradeSwap: React.FC<Props> = ({ spotBalances, markPx, book, onSuccess }) => {
  const { open } = useMonadierAppKit();
  const { isConnected } = useMonadierWallet();
  const { placeOrder, busy, error, walletReady } = useHyperliquidTrading();
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'buyUsde' | 'sellUsde'>('buyUsde');
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  const usdcBal = useMemo(
    () => toNum(spotBalances.find((b) => b.coin === 'USDC')?.total),
    [spotBalances]
  );
  const usdeBal = useMemo(
    () => toNum(spotBalances.find((b) => b.coin === 'USDE')?.total),
    [spotBalances]
  );

  const quote = useMemo(() => {
    const n = toNum(amount);
    if (n <= 0) return null;
    return estimateSwapQuote({ direction, amountIn: n, markPx, book });
  }, [amount, direction, markPx, book]);

  const maxAmount = direction === 'buyUsde' ? usdcBal : usdeBal;

  const handleSwap = async () => {
    setLocalMsg(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0 || markPx <= 0) return;
    try {
      if (direction === 'buyUsde') {
        await placeOrder({
          coin: DEFAULT_SWAP_COIN,
          side: 'long',
          kind: 'market',
          size: n / markPx,
          markPx,
          marketKind: 'spot',
        });
      } else {
        await placeOrder({
          coin: DEFAULT_SWAP_COIN,
          side: 'short',
          kind: 'market',
          size: n,
          markPx,
          marketKind: 'spot',
        });
      }
      setLocalMsg('Swap order submitted');
      onSuccess?.();
    } catch {
      /* hook */
    }
  };

  return (
    <div className="hl-swap">
      <div className="hl-swap-card">
        <h2 className="hl-swap-title">USDC ⇄ USDE</h2>
        <p className="hl-swap-desc">
          Swap stablecoins on Hyperliquid spot ({DEFAULT_SWAP_COIN} · USDE/USDC).
        </p>

        <div className="hl-swap-balances">
          <span>USDC: {fmtUsdSymbol(usdcBal)}</span>
          <span>USDE: {fmtUsdSymbol(usdeBal)}</span>
          <span>Mid: {markPx > 0 ? markPx.toFixed(5) : '—'}</span>
        </div>

        <div className="hl-swap-direction">
          <button
            type="button"
            className={`hl-entry-foot-btn ${direction === 'buyUsde' ? 'hl-entry-foot-btn--on' : ''}`}
            onClick={() => setDirection('buyUsde')}
          >
            USDC → USDE
          </button>
          <button
            type="button"
            className={`hl-entry-foot-btn ${direction === 'sellUsde' ? 'hl-entry-foot-btn--on' : ''}`}
            onClick={() => setDirection('sellUsde')}
          >
            USDE → USDC
          </button>
        </div>

        <label className="hl-entry-label" htmlFor="swap-amount">
          {direction === 'buyUsde' ? 'USDC amount' : 'USDE amount'}
        </label>
        <input
          id="swap-amount"
          className="hl-entry-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
        />

        <button
          type="button"
          className="hl-entry-foot-btn"
          disabled={maxAmount <= 0}
          onClick={() => setAmount(String(maxAmount))}
        >
          Max ({fmtUsdSymbol(maxAmount)})
        </button>

        {quote ? (
          <div className="hl-swap-preview">
            <div>
              Est. received:{' '}
              <strong>
                {fmtUsdSymbol(quote.estimatedOut, 4)}{' '}
                {direction === 'buyUsde' ? 'USDE' : 'USDC'}
              </strong>
            </div>
            <div>
              Min received ({quote.slippageBps} bps):{' '}
              {fmtUsdSymbol(quote.minOut, 4)} {direction === 'buyUsde' ? 'USDE' : 'USDC'}
            </div>
            <div>Exec. price: {quote.executionPx.toFixed(5)}</div>
            {quote.priceImpactBps > 1 ? (
              <div className={quote.priceImpactBps > 50 ? 'hl-down' : ''}>
                Price impact: {(quote.priceImpactBps / 100).toFixed(2)}%
              </div>
            ) : null}
          </div>
        ) : null}

        {!isConnected || !walletReady ? (
          <button type="button" className="hl-entry-submit" onClick={() => open()}>
            Connect wallet
          </button>
        ) : (
          <button
            type="button"
            className="hl-entry-submit"
            disabled={busy || toNum(amount) <= 0 || toNum(amount) > maxAmount}
            onClick={handleSwap}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : (
              <>
                <ArrowDownUp size={14} style={{ display: 'inline', marginRight: 6 }} />
                Swap
              </>
            )}
          </button>
        )}

        {error ? <p className="hl-entry-err"><AlertCircle size={12} /> {error}</p> : null}
        {localMsg ? <p className="hl-entry-ok">{localMsg}</p> : null}
      </div>
    </div>
  );
};

export default ProTradeSwap;
