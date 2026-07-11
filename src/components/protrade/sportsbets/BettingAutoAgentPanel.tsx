import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { useWalletClient } from 'wagmi';
import { useBettingFeeGate } from '../../../contexts/BettingFeeContext';
import { fmtUsdSymbol } from '../../../lib/hyperliquid/format';
import { checkHlBotAgentApproved } from '../../../lib/hyperliquid/hlBotAgent';
import { ensureHlAgentForTrading } from '../../../lib/hyperliquid/ensureHlAgentForTrading';
import {
  loadAutoBettingSettings,
  saveAutoBettingSettings,
} from '../../../lib/betting/saveAutoBettingEnabled';
import type { AutoBettingResultPrefs } from '../../../lib/betting/autoBettingPrefs';

const AI_BETTING_VIDEO = '/videos/ai-betting-agent.mp4';

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
  const { data: walletClient } = useWalletClient();
  const bettingFees = useBettingFeeGate();
  const [panelOpen, setPanelOpen] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [prefs, setPrefs] = useState<AutoBettingResultPrefs>({
    allowWin: true,
    allowDraw: true,
    allowLoss: true,
  });
  const [budgetUsd, setBudgetUsd] = useState(0);
  const [budgetDraft, setBudgetDraft] = useState('0');
  const [agentApproved, setAgentApproved] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wallet = walletAddress?.trim().toLowerCase();

  const requireReady = useCallback(
    (reason: string): boolean => {
      if (!signedIn) {
        onRequireSignIn?.(reason);
        return false;
      }
      if (!wallet || !walletConnected) {
        setError('Connect your wallet first');
        return false;
      }
      return true;
    },
    [onRequireSignIn, signedIn, wallet, walletConnected]
  );

  const refresh = useCallback(async () => {
    if (!wallet) {
      setAutoEnabled(false);
      setAgentApproved(false);
      return;
    }
    try {
      const [settings, agent] = await Promise.all([
        loadAutoBettingSettings(wallet),
        checkHlBotAgentApproved(wallet),
      ]);
      setAutoEnabled(settings.enabled);
      setPrefs({
        allowWin: settings.allowWin,
        allowDraw: settings.allowDraw,
        allowLoss: settings.allowLoss,
      });
      setBudgetUsd(settings.budgetUsd);
      setBudgetDraft(String(settings.budgetUsd > 0 ? settings.budgetUsd : 0));
      setAgentApproved(agent.approved);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load AI betting settings');
    }
  }, [wallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleApproveAgent = async () => {
    if (!requireReady('Sign in to enable AI betting')) return;
    if (!walletClient) {
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
    if (!requireReady('Sign in to enable AI betting')) return;
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
      await saveAutoBettingSettings(wallet, { enabled: next });
      setAutoEnabled(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save setting');
    } finally {
      setAgentLoading(false);
    }
  };

  const persistBudget = async (raw: string) => {
    if (!requireReady('Sign in to set betting budget')) return;
    if (!wallet) return;
    const n = Math.max(0, Math.round(Number.parseFloat(raw) * 100) / 100);
    if (!Number.isFinite(n)) {
      setError('Enter a valid budget in USD');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveAutoBettingSettings(wallet, { budgetUsd: n });
      setBudgetUsd(n);
      setBudgetDraft(String(n));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save budget');
    } finally {
      setSaving(false);
    }
  };

  const togglePref = async (key: keyof AutoBettingResultPrefs) => {
    if (!requireReady('Sign in to change AI betting options')) return;
    if (!wallet) return;
    const prev = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    if (!next.allowWin && !next.allowDraw && !next.allowLoss) {
      setError('Keep at least one of Win, Draw, or Loss enabled.');
      return;
    }
    setPrefs(next);
    setError(null);
    setSaving(true);
    try {
      await saveAutoBettingSettings(wallet, next);
    } catch (err: unknown) {
      setPrefs(prev);
      setError(err instanceof Error ? err.message : 'Could not save options');
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="hl-sb-order hl-sb-agent" aria-label="AI betting">
      <button
        type="button"
        className={`hl-sb-agent-toggle${panelOpen ? ' hl-sb-agent-toggle--open' : ''}${autoEnabled ? ' hl-sb-agent-toggle--live' : ''}`}
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen((v) => !v)}
      >
        <span className="hl-sb-agent-toggle-left">
          <Sparkles size={14} className="hl-sb-agent-rainbow-icon" aria-hidden />
          <span className="hl-sb-agent-toggle-title hl-sb-agent-rainbow-text">AI betting</span>
          {autoEnabled ? <span className="hl-sb-agent-toggle-live">On</span> : null}
        </span>
        <ChevronDown
          size={16}
          className={`hl-sb-agent-toggle-chevron${panelOpen ? ' hl-sb-agent-toggle-chevron--open' : ''}`}
          aria-hidden
        />
      </button>

      {panelOpen ? (
        <>
          <div className="hl-sb-order-head">
            <div className="hl-sb-order-pick-box hl-sb-agent-video-box">
              <video
                className="hl-sb-agent-video"
                src={AI_BETTING_VIDEO}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label="AI betting"
              />
            </div>
          </div>

          {bettingFees.feesDue ? (
            <button
              type="button"
              className="hl-sb-order-context-banner hl-sb-order-context-banner--warn hl-sb-agent-fee-btn"
              onClick={bettingFees.openPayModal}
            >
              Betting fees due: <strong>{fmtUsdSymbol(bettingFees.accruedUsd)}</strong> — pay to bet
              again
            </button>
          ) : null}

          <label className="hl-sb-field hl-sb-field--stake">
            <span>Betting budget (USDC)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={budgetDraft}
              onChange={(e) => setBudgetDraft(e.target.value)}
              onBlur={() => void persistBudget(budgetDraft)}
              placeholder="50"
              aria-label="Max USDC for AI betting"
            />
          </label>

          <div className="hl-sb-quick-stakes" role="group" aria-label="Save budget">
            <button
              type="button"
              className="hl-sb-quick-stake hl-sb-quick-stake--on"
              disabled={saving}
              onClick={() => void persistBudget(budgetDraft)}
            >
              Save
            </button>
            {([10, 25, 50, 100] as const).map((amt) => (
              <button
                key={amt}
                type="button"
                className={
                  Number(budgetDraft) === amt ? 'hl-sb-quick-stake hl-sb-quick-stake--on' : 'hl-sb-quick-stake'
                }
                disabled={saving}
                onClick={() => {
                  setBudgetDraft(String(amt));
                  void persistBudget(String(amt));
                }}
              >
                ${amt}
              </button>
            ))}
          </div>

          <div
            className="hl-sb-order-controls hl-sb-order-controls--compact"
            role="group"
            aria-label="Bot may bet on"
          >
            {(
              [
                ['allowWin', 'Win'],
                ['allowDraw', 'Draw'],
                ['allowLoss', 'Loss'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={prefs[key] ? 'hl-sb-pill hl-sb-pill--on' : 'hl-sb-pill'}
                aria-pressed={prefs[key]}
                disabled={saving}
                onClick={() => void togglePref(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="hl-sb-order-context">
            <div className="hl-sb-order-context-stats">
              <div className="hl-sb-order-context-stat">
                <span className="hl-sb-order-context-label">Agent</span>
                <strong>{agentApproved ? 'Yes' : 'No'}</strong>
              </div>
              <div className="hl-sb-order-context-stat">
                <span className="hl-sb-order-context-label">Auto</span>
                <strong>{autoEnabled ? 'On' : 'Off'}</strong>
              </div>
              <div className="hl-sb-order-context-stat">
                <span className="hl-sb-order-context-label">Budget</span>
                <strong>{fmtUsdSymbol(budgetUsd)}</strong>
              </div>
            </div>

            {error ? (
              <div className="hl-sb-order-context-banner hl-sb-order-context-banner--err" role="alert">
                {error}
              </div>
            ) : budgetUsd < 10 ? (
              <p className="hl-sb-order-context-fee">
                Set at least $10 to allow AI bets.
              </p>
            ) : null}
          </div>

          {!agentApproved ? (
            <button
              type="button"
              className="hl-sb-order-submit"
              onClick={() => void handleApproveAgent()}
              disabled={busy}
            >
              {busy ? <Loader2 size={16} className="hl-spin" aria-hidden /> : null}
              Approve agent
            </button>
          ) : (
            <button
              type="button"
              className={`hl-sb-order-submit${autoEnabled ? ' hl-sb-order-submit--sell' : ''}`}
              onClick={() => void handleToggleAuto()}
              disabled={agentLoading || bettingFees.bettingBlocked}
            >
              {agentLoading ? <Loader2 size={16} className="hl-spin" aria-hidden /> : null}
              {autoEnabled ? 'Turn off AI betting' : 'Enable AI betting'}
            </button>
          )}
        </>
      ) : null}
    </aside>
  );
};

export default BettingAutoAgentPanel;
