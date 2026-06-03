import React, { useState } from 'react';
import { AlertCircle, Loader2, Save, Settings } from 'lucide-react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { VAULT_CHAIN_ID } from '../../lib/vault';
import { supabase } from '../../lib/supabase';
import type { VaultSettingsSnapshot } from '../../hooks/useTerminalVaultData';
import {
  getLeverageChips,
  getMaxLeverageLabel,
  clampLeverage,
} from '../../lib/leverageLimits';

const RISK_PRESETS = [1, 5, 25, 50, 100] as const;

type Props = {
  settings: VaultSettingsSnapshot;
  vaultUsd: number;
  maxTradeUsd: number;
  disabled?: boolean;
  onSaved: () => void;
  onOpenAdvanced?: () => void;
};

const TerminalLvrgPanel: React.FC<Props> = ({
  settings,
  vaultUsd,
  maxTradeUsd,
  disabled,
  onSaved,
  onOpenAdvanced,
}) => {
  const { address, publicClient, walletClient, chainId } = useWeb3();
  const { planTier } = useSubscription();

  const leverageOptions = getLeverageChips(planTier);
  const maxLevLabel = getMaxLeverageLabel(planTier);

  const [riskPct, setRiskPct] = useState(settings.riskPct);
  const [leverage, setLeverage] = useState(settings.leverage);
  const [takeProfit, setTakeProfit] = useState(settings.takeProfit);
  const [stopLoss, setStopLoss] = useState(settings.stopLoss);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  React.useEffect(() => {
    setRiskPct(settings.riskPct);
    setLeverage(settings.leverage);
    setTakeProfit(settings.takeProfit);
    setStopLoss(settings.stopLoss);
  }, [settings]);

  const estPosition = ((vaultUsd * riskPct) / 100) * leverage;

  const handleSave = async () => {
    if (!address || !publicClient || !walletClient || chainId !== VAULT_CHAIN_ID) {
      setError('Connect on Arbitrum to save.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const payload = {
        wallet_address: address.toLowerCase(),
        chain_id: VAULT_CHAIN_ID,
        auto_trade_enabled: settings.autoTradeEnabled,
        risk_level_bps: Math.round(riskPct * 100),
        take_profit_percent: takeProfit,
        stop_loss_percent: stopLoss,
        leverage_multiplier: clampLeverage(leverage, planTier),
        updated_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from('vault_settings')
        .select('id')
        .eq('wallet_address', address.toLowerCase())
        .eq('chain_id', VAULT_CHAIN_ID)
        .maybeSingle();

      const err = existing
        ? (
            await supabase
              .from('vault_settings')
              .update(payload)
              .eq('wallet_address', address.toLowerCase())
              .eq('chain_id', VAULT_CHAIN_ID)
          ).error
        : (await supabase.from('vault_settings').insert(payload)).error;

      if (err) throw new Error(err.message);
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`term-panel-stack ${disabled ? 'term-panel-stack--locked' : ''}`}>
      <div className="term-panel-card">
        <span className="term-panel-card-label">Leverage</span>
        <strong className="term-panel-card-value">{leverage}x</strong>
        <span className="term-panel-card-hint">
          Max {maxLevLabel} GMX · Est. position ${estPosition.toFixed(0)}
        </span>
      </div>

      <p className="term-hint">
        Risk {riskPct}% · Max trade ${maxTradeUsd.toFixed(2)} · TP +{takeProfit}% · SL −{stopLoss}%
      </p>

      <div className="term-panel-card term-panel-card--flat">
        <span className="term-panel-card-label">Select leverage</span>
        <div className="term-modal-chip-row term-modal-chip-row--wrap">
          {leverageOptions.map((v) => (
            <button
              key={v}
              type="button"
              className={`term-modal-chip ${leverage === v ? 'term-modal-chip--on' : ''}`}
              onClick={() => setLeverage(v)}
              disabled={disabled || busy}
            >
              {v}x
            </button>
          ))}
        </div>
      </div>

      <div className="term-panel-card term-panel-card--flat">
        <span className="term-panel-card-label">Risk per trade</span>
        <div className="term-modal-chip-row term-modal-chip-row--wrap">
          {RISK_PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              className={`term-modal-chip ${riskPct === v ? 'term-modal-chip--on' : ''}`}
              onClick={() => setRiskPct(v)}
              disabled={disabled || busy}
            >
              {v}%
            </button>
          ))}
        </div>
        <input
          type="range"
          min={1}
          max={100}
          value={riskPct}
          onChange={(e) => setRiskPct(parseInt(e.target.value, 10))}
          className="term-modal-range"
          disabled={disabled || busy}
        />
        <div className="term-panel-inputs">
          <label className="term-panel-input-wrap">
            <span>TP %</span>
            <input
              type="number"
              className="term-panel-input"
              value={takeProfit}
              min={0.5}
              step={0.5}
              onChange={(e) => setTakeProfit(parseFloat(e.target.value) || 0)}
              disabled={disabled || busy}
            />
          </label>
          <label className="term-panel-input-wrap">
            <span>SL %</span>
            <input
              type="number"
              className="term-panel-input"
              value={stopLoss}
              min={0.5}
              step={0.5}
              onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
              disabled={disabled || busy}
            />
          </label>
        </div>
      </div>

      {leverage >= 10 && (
        <p className="term-hint term-hint--warn">
          {leverage >= 20
            ? `High leverage: ~${((100 / leverage) * 0.9).toFixed(1)}% move can liquidate.`
            : `+1% price ≈ +${leverage}% on position P/L.`}
        </p>
      )}

      {error && (
        <div className="term-panel-alert">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="term-btn-sm flex-1 justify-center"
          disabled={disabled || busy}
          onClick={handleSave}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saved ? 'Saved' : 'Save LVRG'}
        </button>
      </div>

      {onOpenAdvanced && (
        <button
          type="button"
          className="term-btn-sm term-btn-sm--ghost w-full justify-center"
          onClick={onOpenAdvanced}
        >
          <Settings size={14} />
          All bot settings
        </button>
      )}
    </div>
  );
};

export default TerminalLvrgPanel;
