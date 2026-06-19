import React, { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import type { VaultSettingsSnapshot } from '../../lib/vaultSettingsSnapshot';
import { HL_BOT_STRATEGY_LABELS, type HlBotStrategy } from '../../lib/hlBotStrategy';
import { persistVaultSettings } from '../../lib/syncVaultSettings';

type Props = {
  settings: VaultSettingsSnapshot;
  walletAddress?: string;
  disabled?: boolean;
  onSaved: () => void;
};

/** Always visible on Bot tab — switch Standard vs Profit Grabber without opening LVRG. */
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
      try {
        await persistVaultSettings({
          settings: {
            walletAddress: wallet,
            autoTradeEnabled: settings.autoTradeEnabled,
            riskPct: settings.riskPct,
            leverage: settings.leverage,
            takeProfit: settings.takeProfit,
            stopLoss: settings.stopLoss,
            askPermission: settings.askPermission,
            minWinRate: settings.minWinRate,
            minTradesForWinRate: settings.minTradesForWinRate,
            hlBotStrategy: next,
          },
          planTier,
          publicClient,
          walletClient,
          userAddress: wallet as `0x${string}`,
          isDemoUser,
          syncTradingParams: false,
          syncAutoTrade: false,
        });
        onSaved();
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
      <span className="term-panel-card-hint">
        {mode === 'profit_grabber'
          ? 'Profit Grabber: at +$0.02 uPnL → lock +$0.01, exit via trail (no % TP).'
          : 'Standard: MTF trend scan + profit lock + TP/SL.'}
      </span>
      {error ? <span className="term-panel-card-hint term-panel-card-hint--warn">{error}</span> : null}
    </div>
  );
};

export default TerminalBotModeRow;
