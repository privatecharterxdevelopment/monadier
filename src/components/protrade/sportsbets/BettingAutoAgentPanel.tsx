import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { useWalletClient } from 'wagmi';
import { useAuth } from '../../../contexts/AuthContext';
import { useBettingFeeGate } from '../../../contexts/BettingFeeContext';
import { fmtUsdSymbol } from '../../../lib/hyperliquid/format';
import { checkHlBotAgentApproved } from '../../../lib/hyperliquid/hlBotAgent';
import { ensureHlAgentForTrading } from '../../../lib/hyperliquid/ensureHlAgentForTrading';
import {
  loadAutoBettingSettings,
  saveAutoBettingSettings,
} from '../../../lib/betting/saveAutoBettingEnabled';
import type { AutoBettingResultPrefs } from '../../../lib/betting/autoBettingPrefs';

type Props = {
  walletAddress?: string;
  walletConnected: boolean;
  signedIn: boolean;
  onRequireSignIn?: (reason: string) => void;
};

const AGENT_INFO_LINES = [
  'Same Hyperliquid agent as the trading bot — separate on/off switch.',
  'Bot auto-trading and AI betting can run together on one HL account.',
  '0.5% fee per bet · 2.5% on cash-out — pay after each event before the next bet.',
  'Auto-betting places orders via your approved agent when enabled.',
] as const;

const BettingAgentInfoHint: React.FC = () => {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'top' | 'bottom' } | null>(
    null
  );

  const updatePos = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 10;
    const estHeight = 200;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement: 'top' | 'bottom' =
      spaceAbove >= estHeight + gap || spaceAbove >= spaceBelow ? 'top' : 'bottom';
    setPos({
      top: placement === 'top' ? rect.top - gap : rect.bottom + gap,
      left: rect.left + rect.width / 2,
      placement,
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    const onScroll = () => updatePos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, updatePos]);

  const show = () => {
    setOpen(true);
    updatePos();
  };
  const hide = () => setOpen(false);

  const popover =
    open && pos
      ? createPortal(
          <div
            className={`term-trade-reason-popover term-trade-reason-popover--${pos.placement} hl-sb-agent-info-popover`}
            style={{ top: pos.top, left: pos.left }}
            role="tooltip"
          >
            <strong className="term-trade-reason-popover__title">AI betting agent</strong>
            <ul className="hl-sb-agent-info-list">
              {AGENT_INFO_LINES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="hl-sb-agent-info-btn"
        aria-label="AI betting agent info"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <Info size={14} strokeWidth={2} aria-hidden />
      </button>
      {popover}
    </>
  );
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
  const [prefs, setPrefs] = useState<AutoBettingResultPrefs>({
    allowWin: true,
    allowDraw: true,
    allowLoss: true,
  });
  const [budgetUsd, setBudgetUsd] = useState(0);
  const [budgetDraft, setBudgetDraft] = useState('0');
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
      await saveAutoBettingSettings(wallet, { enabled: next });
      setAutoEnabled(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save setting');
    } finally {
      setAgentLoading(false);
    }
  };

  const saveBudget = async () => {
    if (!signedIn) {
      onRequireSignIn?.('Sign in to set betting budget');
      return;
    }
    if (!wallet) return;
    const n = Math.max(0, Math.round(Number.parseFloat(budgetDraft) * 100) / 100);
    if (!Number.isFinite(n)) {
      setError('Enter a valid budget in USD');
      return;
    }
    setError(null);
    try {
      await saveAutoBettingSettings(wallet, { budgetUsd: n });
      setBudgetUsd(n);
      setBudgetDraft(String(n));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save budget');
    }
  };

  const togglePref = async (key: keyof AutoBettingResultPrefs) => {
    if (!signedIn) {
      onRequireSignIn?.('Sign in to change AI betting options');
      return;
    }
    if (!wallet) return;
    const next = { ...prefs, [key]: !prefs[key] };
    if (!next.allowWin && !next.allowDraw && !next.allowLoss) {
      setError('Keep at least one of Win, Draw, or Loss enabled.');
      return;
    }
    setPrefs(next);
    setError(null);
    try {
      await saveAutoBettingSettings(wallet, next);
    } catch (err: unknown) {
      setPrefs(prefs);
      setError(err instanceof Error ? err.message : 'Could not save options');
    }
  };

  return (
    <section className="hl-sb-agent-panel" aria-label="AI betting agent">
      <header className="hl-sb-agent-head">
        <Sparkles size={16} aria-hidden />
        <div className="hl-sb-agent-head-text">
          <div className="hl-sb-agent-title-row">
            <h3>AI betting agent</h3>
            <BettingAgentInfoHint />
          </div>
          <p>Same agent as the trading bot — separate on/off.</p>
        </div>
      </header>

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

      <div className="hl-sb-agent-prefs" aria-label="Betting budget">
        <p className="hl-sb-agent-prefs-label">Betting budget (USDC)</p>
        <div className="hl-sb-agent-budget-row">
          <input
            type="number"
            min={0}
            step={1}
            className="hl-sb-agent-budget-input"
            value={budgetDraft}
            disabled={!wallet || settingsLoading || !user}
            onChange={(e) => setBudgetDraft(e.target.value)}
            onBlur={() => void saveBudget()}
            aria-label="Max USDC for AI betting"
          />
          <button
            type="button"
            className="hl-sb-agent-btn hl-sb-agent-btn--primary"
            disabled={!wallet || settingsLoading || !user}
            onClick={() => void saveBudget()}
          >
            Save
          </button>
        </div>
        <p className="hl-sb-agent-prefs-hint">
          Caps how much of your Hyperliquid spot USDC the betting agent may use (e.g. $50 of
          $150). Perp bot risk % is unchanged. Current budget:{' '}
          <strong>{fmtUsdSymbol(budgetUsd)}</strong>
          {budgetUsd < 10 ? ' — set at least $10 to allow AI bets.' : ''}.
        </p>
      </div>

      <div className="hl-sb-agent-prefs" aria-label="Bet on result types">
        <p className="hl-sb-agent-prefs-label">Bot may bet on</p>
        <div className="hl-sb-agent-prefs-row">
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
              className={`hl-sb-agent-pref-chip${prefs[key] ? ' hl-sb-agent-pref-chip--on' : ''}`}
              aria-pressed={prefs[key]}
              disabled={!wallet || settingsLoading || !user}
              onClick={() => void togglePref(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="hl-sb-agent-prefs-hint">
          Yes/No markets: Win = Yes, Loss = No. Draw applies when the event has a Draw leg.
        </p>
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
