import React, { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { HlPosition } from '../../lib/hyperliquid/user';
import { marginPctFromStopPrice, type ActiveSlDisplay } from '../../lib/hlTrailingStopChart';

type Props = {
  position: HlPosition;
  activeSl: ActiveSlDisplay;
  entryPx: number;
  szi: number;
  markPx: number;
  leverage: number;
  onClose: () => void;
  onSave: (stopLossPct: number) => Promise<{ ok: boolean; error?: string }>;
};

const MIN_SL_PCT = 0.1;
const MAX_SL_PCT = 50;

const PositionStopEditModal: React.FC<Props> = ({
  position,
  activeSl,
  entryPx,
  szi,
  markPx,
  leverage,
  onClose,
  onSave,
}) => {
  const side = szi >= 0 ? ('long' as const) : ('short' as const);
  const absSize = Math.abs(szi);
  const notional = absSize * (markPx > 0 ? markPx : entryPx);
  const collateral = notional / Math.max(1, leverage);

  const initialPx = activeSl.stopPx ?? entryPx;
  const [price, setPrice] = useState(initialPx > 0 ? String(initialPx) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedPx = Number.parseFloat(price);
  const previewPct = useMemo(() => {
    if (!Number.isFinite(parsedPx) || parsedPx <= 0) return null;
    return marginPctFromStopPrice(side, entryPx, absSize, collateral, parsedPx);
  }, [parsedPx, side, entryPx, absSize, collateral]);

  const profitManaged = activeSl.kind === 'profit' || activeSl.kind === 'close_now';

  const validationError = useMemo(() => {
    if (!Number.isFinite(parsedPx) || parsedPx <= 0) return 'Enter a valid stop price.';
    if (side === 'long' && parsedPx >= entryPx) {
      return 'Long stop must be below entry for max loss.';
    }
    if (side === 'short' && parsedPx <= entryPx) {
      return 'Short stop must be above entry for max loss.';
    }
    if (previewPct == null) return 'Stop price is too close to entry.';
    if (previewPct < MIN_SL_PCT) return `Stop is tighter than ${MIN_SL_PCT}% margin.`;
    if (previewPct > MAX_SL_PCT) return `Stop is wider than ${MAX_SL_PCT}% margin.`;
    return null;
  }, [parsedPx, side, entryPx, previewPct]);

  const handleSave = async () => {
    if (validationError || previewPct == null) {
      setError(validationError ?? 'Invalid stop price.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await onSave(Math.round(previewPct * 100) / 100);
      if (result.ok) {
        onClose();
        return;
      }
      setError(result.error ?? 'Failed to save stop loss.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save stop loss.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="term-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="term-modal term-modal--sm"
        role="dialog"
        aria-labelledby="position-stop-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="term-modal-head">
          <h2 id="position-stop-title" className="term-modal-title">
            Stop — {position.coin}
          </h2>
          <button type="button" className="term-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="term-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {profitManaged ? (
            <p className="term-modal-hint">
              Active profit stop ({activeSl.label}) is managed by the bot. Set max-loss price below —
              applies immediately when the position is in loss.
            </p>
          ) : (
            <p className="term-modal-hint">
              Bot closes this {side.toUpperCase()} if mark crosses this price.
            </p>
          )}

          <label className="term-modal-label" htmlFor="position-stop-price">
            Stop price
          </label>
          <input
            id="position-stop-price"
            type="text"
            inputMode="decimal"
            className="term-modal-input"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            autoFocus
          />

          {previewPct != null && !validationError ? (
            <p className="term-modal-hint term-modal-hint--ok">
              ≈ {previewPct.toFixed(2)}% of margin — saved to bot settings
            </p>
          ) : null}

          {error || validationError ? (
            <p className="term-modal-hint term-modal-hint--warn">{error ?? validationError}</p>
          ) : null}

          <button
            type="button"
            className="term-modal-primary"
            disabled={busy || Boolean(validationError)}
            onClick={() => void handleSave()}
          >
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : 'Save & apply'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PositionStopEditModal;
