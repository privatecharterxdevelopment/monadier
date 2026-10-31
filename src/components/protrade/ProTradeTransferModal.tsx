import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Loader2, X } from 'lucide-react';
import { useHyperliquidTrading } from '../../hooks/useHyperliquidTrading';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { toNum } from '../../lib/hyperliquid/parse';

type Props = {
  onClose: () => void;
  onSuccess?: () => void;
  perpAvailable: number;
  spotUsdc: number;
};

const ProTradeTransferModal: React.FC<Props> = ({
  onClose,
  onSuccess,
  perpAvailable,
  spotUsdc,
}) => {
  const { transferUsdClass, busy, error } = useHyperliquidTrading();
  const [direction, setDirection] = useState<'toPerp' | 'toSpot'>('toPerp');
  const [amount, setAmount] = useState('');
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  const maxAmount = useMemo(
    () => (direction === 'toPerp' ? spotUsdc : perpAvailable),
    [direction, spotUsdc, perpAvailable]
  );

  const handleTransfer = async () => {
    setLocalMsg(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    if (n > maxAmount + 1e-9) return;
    try {
      await transferUsdClass(amount, direction === 'toPerp');
      setLocalMsg('Transfer submitted');
      onSuccess?.();
    } catch {
      /* hook error */
    }
  };

  return (
    <div className="term-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="term-modal term-modal--sm"
        role="dialog"
        aria-labelledby="pro-transfer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="term-modal-head">
          <h2 id="pro-transfer-title" className="term-modal-title">
            Perps ⇄ Spot
          </h2>
          <button type="button" className="term-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="term-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`hl-entry-foot-btn ${direction === 'toPerp' ? 'hl-entry-foot-btn--on' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setDirection('toPerp')}
            >
              Spot → Perps
            </button>
            <button
              type="button"
              className={`hl-entry-foot-btn ${direction === 'toSpot' ? 'hl-entry-foot-btn--on' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setDirection('toSpot')}
            >
              Perps → Spot
            </button>
          </div>

          <div style={{ fontSize: 12, color: 'var(--hl-text-muted)' }}>
            {direction === 'toPerp' ? (
              <>Spot USDC available: {fmtUsdSymbol(spotUsdc)}</>
            ) : (
              <>Perp withdrawable: {fmtUsdSymbol(perpAvailable)}</>
            )}
          </div>

          <div>
            <label className="hl-entry-label" htmlFor="transfer-amount">
              Amount (USDC)
            </label>
            <input
              id="transfer-amount"
              className="hl-entry-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
            />
          </div>

          <button
            type="button"
            className="hl-entry-foot-btn"
            onClick={() => setAmount(String(maxAmount))}
            disabled={maxAmount <= 0}
          >
            Max ({fmtUsdSymbol(maxAmount)})
          </button>

          <button
            type="button"
            className="hl-entry-submit"
            disabled={busy || toNum(amount) <= 0 || toNum(amount) > maxAmount}
            onClick={handleTransfer}
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <ArrowLeftRight size={14} style={{ display: 'inline', marginRight: 6 }} />
                Transfer
              </>
            )}
          </button>

          {error ? <p className="hl-entry-err">{error}</p> : null}
          {localMsg ? <p className="hl-entry-ok">{localMsg}</p> : null}
        </div>
      </div>
    </div>
  );
};

export default ProTradeTransferModal;
