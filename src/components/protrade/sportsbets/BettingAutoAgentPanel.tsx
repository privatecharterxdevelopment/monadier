import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { useWalletClient } from 'wagmi';
import { useAuth } from '../../../contexts/AuthContext';
import { useBettingFeeGate } from '../../../contexts/BettingFeeContext';
import { fmtUsdSymbol } from '../../../lib/hyperliquid/format';
import {
  checkHlBotAgentApproved,
} from '../../../lib/hyperliquid/hlBotAgent';
import { ensureHlAgentForTrading } from '../../../lib/hyperliquid/ensureHlAgentForTrading';
import {
  loadAutoBettingEnabled,
  saveAutoBettingEnabled,
} from '../../../lib/betting/saveAutoBettingEnabled';

type Props = {
  walletAddress?: string;
  walletConnected: boolean;
  signedIn: boolean;
  onRequireSignIn?: (reason: string) => void;
};

const BettingAutoAgentPanel: React.FC<Props> = ({
  walletAddress,
  walletConnected,
  signedIn,
  onRequireSignIn,
}) => {
  const { user } = useAuth();
  const { data: walletClient } = useWalletClient();
  const bettingFees = useBettingFeeGate();
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [agentApproved, setAgentApproved] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wallet = walletAddress?.trim().toLowerCase();

  const refresh = useCallback(async () => {
    if (!wallet) {
      setAutoEnabled(false);
      setAgentApproved(false);
      return;
    }
    setSettingsLoading(true);
    try {
      const [enabled, agent] = await Promise.all([
        loadAutoBettingEnabled(wallet),
        checkHlBotAgentApproved(wallet),
      ]);
      setAutoEnabled(enabled);
      setAgentApproved(agent.approved);
    } finally {
      setSettingsLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleApproveAgent = async () => {
    if (!signedIn) {
      onRequireSignIn?.('Sign in to enable AI betting');
      return;
    }
    if (!walletConnected || !walletClient) {
      setError('Connect your wallet first');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ensureHlAgentForTrading(walletClient);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Agent approval failed');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAuto = async () => {
    if (!signedIn) {
      onRequireSignIn?.('Sign in to enable AI betting');
      return;
    }
    if (!wallet) return;
    if (bettingFees.bettingBlocked) {
      bettingFees.openPayModal();
      return;
    }
    if (!agentApproved) {
      await handleApproveAgent();
      return;
    }
    setAgentLoading(true);
    setError(null);
    try {
      const next = !autoEnabled;
      await saveAutoBettingEnabled(wallet, next);
      setAutoEnabled(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save setting');
    } finally {
      setAgentLoading(false);
    }
  };

  return (
    <section className="hl-sb-agent-panel" aria-label="AI betting agent">
      <header className="hl-sb-agent-head">
        <Sparkles size={16} aria-hidden />
        <div>
          <h3>AI betting agent</h3>
          <p>Same Hyperliquid agent as the trading bot — separate on/off switch.</p>
        </div>
      </header>

      <ul className="hl-sb-agent-points">
        <li>Bot auto-trading and AI betting can run together on one HL account.</li>
        <li>0.5% fee per bet · 2.5% on cash-out — pay after each event before the next bet.</li>
        <li>Auto-betting places orders via your approved agent (coming soon).</li>
      </ul>

      {bettingFees.feesDue ? (
        <button
          type="button"
          className="hl-sb-agent-fee-banner"
          onClick={bettingFees.openPayModal}
        >
          Betting fees due: <strong>{fmtUsdSymbol(bettingFees.accruedUsd)}</strong> — pay to bet again
        </button>
      ) : null}

      <div className="hl-sb-agent-status">
        <span className={`hl-sb-agent-pill${agentApproved ? ' hl-sb-agent-pill--on' : ''}`}>
          <ShieldCheck size={12} aria-hidden />
          Agent {agentApproved ? 'approved' : 'not approved'}
        </span>
        <span className={`hl-sb-agent-pill${autoEnabled ? ' hl-sb-agent-pill--on' : ''}`}>
          Auto-betting {autoEnabled ? 'on' : 'off'}
        </span>
      </div>

      {error ? (
        <p className="hl-sb-agent-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="hl-sb-agent-actions">
        {!agentApproved ? (
          <button
            type="button"
            className="hl-sb-agent-btn hl-sb-agent-btn--primary"
            onClick={() => void handleApproveAgent()}
            disabled={busy || !walletConnected}
          >
            {busy ? <Loader2 size={14} className="hl-spin" aria-hidden /> : null}
            Approve trading agent
          </button>
        ) : (
          <button
            type="button"
            className={`hl-sb-agent-btn${autoEnabled ? ' hl-sb-agent-btn--danger' : ' hl-sb-agent-btn--primary'}`}
            onClick={() => void handleToggleAuto()}
            disabled={agentLoading || settingsLoading || bettingFees.bettingBlocked}
          >
            {agentLoading ? <Loader2 size={14} className="hl-spin" aria-hidden /> : null}
            {autoEnabled ? 'Turn off AI betting' : 'Enable AI betting'}
          </button>
        )}
      </div>
    </section>
  );
};

export default BettingAutoAgentPanel;
