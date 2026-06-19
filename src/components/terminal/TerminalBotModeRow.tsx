import React, { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import type { VaultSettingsSnapshot } from '../../lib/vaultSettingsSnapshot';
import { HL_BOT_STRATEGY_HINTS, HL_BOT_STRATEGY_LABELS, type HlBotStrategy } from '../../lib/hlBotStrategy';
import { saveHlBotStrategyMode } from '../../lib/saveHlBotStrategyMode';

type Props = {
  settings: VaultSettingsSnapshot;
  walletAddress?: string;
  disabled?: boolean;
  onSaved: () => void;
};

/** Bot tab — switch Standard ↔ Aggressive instantly (no stop/restart). */
const TerminalBotModeRow: React.FC<Props> = ({
  settings,
  walletAddress,
  disabled,
  onSaved,
}) => {
  const { publicClient, walletClient } = useWeb3();
  const { isDemoUser } = useAuth();
  const { planTier } = useSubscription();
  const [mode, setMode] = useState<HlBotStrategy>(settings.hlBotStrategy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  React.useEffect(() => {
    setMode(settings.hlBotStrategy);
  }, [settings.hlBotStrategy]);

  const saveMode = useCallback(
    async (next: HlBotStrategy) => {
      setMode(next);
      const wallet = walletAddress?.toLowerCase();
      if (!wallet || next === settings.hlBotStrategy) return;

      setBusy(true);
      setError(null);
      setSaved(false);
      try {
        await saveHlBotStrategyMode(wallet, settings, next, {
          planTier,
          publicClient,
          walletClient,
          userAddress: wallet as `0x${string}`,
          isDemoUser,
        });
        setSaved(true);
        onSaved();
        window.setTimeout(() => setSaved(false), 2500);
      } catch (e: unknown) {
        setMode(settings.hlBotStrategy);
        setError(e instanceof Error ? e.message : 'Could not save bot mode');
      } finally {
        setBusy(false);
      }
    },
    [
      walletAddress,
      settings,
      planTier,
      publicClient,
      walletClient,
      isDemoUser,
      onSaved,
    ]
  );

  return (
    <div className="term-panel-card term-panel-card--muted term-bot-mode-row">
      <span className="term-panel-card-label">Bot mode</span>
      <div className="term-bot-mode-toggle" role="group" aria-label="Bot strategy mode">
        {(['standard', 'profit_grabber'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`term-btn-sm ${mode === m ? 'term-btn-sm--primary' : ''}`}
            disabled={disabled || busy}
            onClick={() => void saveMode(m)}
          >
            {busy && mode === m ? <Loader2 size={14} className="animate-spin" /> : null}
            {HL_BOT_STRATEGY_LABELS[m]}
          </button>
        ))}
      </div>
      <span className="term-panel-card-hint">{HL_BOT_STRATEGY_HINTS[mode]}</span>
      {saved ? (
        <span className="term-panel-card-hint term-panel-card-hint--ok">
          Saved — active now (no stop/restart needed).
        </span>
      ) : null}
      {error ? <span className="term-panel-card-hint term-panel-card-hint--warn">{error}</span> : null}
    </div>
  );
};

export default TerminalBotModeRow;
