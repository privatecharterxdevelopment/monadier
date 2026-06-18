import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppKit } from '@reown/appkit/react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { persistVaultSettings } from '../../lib/syncVaultSettings';
import type { VaultSettingsSnapshot } from '../../lib/vaultSettingsSnapshot';
import { snapLeverageToStep } from '../../lib/leverageLimits';

export type BotSettingsEditorOptions = {
  settings: VaultSettingsSnapshot;
  walletAddress?: string;
  startMode?: boolean;
  hlSliderMax?: number;
  onSaved: () => void;
};

function applySnapshotToState(
  snapshot: VaultSettingsSnapshot,
  planTier: string,
  startMode: boolean,
  hlSliderMax: number | undefined,
  setters: {
    setRiskLevel: (v: number) => void;
    setAutoTrade: (v: boolean) => void;
    setTakeProfit: (v: number) => void;
    setStopLoss: (v: number) => void;
    setLeverage: (v: number) => void;
    setAskPermission: (v: boolean) => void;
    setMinWinRate: (v: number) => void;
    setMinTradesForWinRate: (v: number) => void;
  }
) {
  setters.setRiskLevel(snapshot.riskPct);
  setters.setAutoTrade(startMode ? true : snapshot.autoTradeEnabled);
  setters.setTakeProfit(snapshot.takeProfit);
  setters.setStopLoss(snapshot.stopLoss);
  setters.setLeverage(snapLeverageToStep(snapshot.leverage, planTier, hlSliderMax));
  setters.setAskPermission(snapshot.askPermission);
  setters.setMinWinRate(snapshot.minWinRate);
  setters.setMinTradesForWinRate(snapshot.minTradesForWinRate);
}

export function useBotSettingsEditor({
  settings,
  walletAddress,
  startMode = false,
  hlSliderMax,
  onSaved,
}: BotSettingsEditorOptions) {
  const { open } = useAppKit();
  const { address, publicClient, walletClient } = useWeb3();
  const { isDemoUser } = useAuth();
  const { linkWallet, planTier } = useSubscription();

  const saveWallet = (walletAddress ?? address)?.toLowerCase();
  const walletConnected = Boolean(saveWallet);

  const [riskLevel, setRiskLevel] = useState(settings.riskPct);
  const [autoTrade, setAutoTrade] = useState(startMode ? true : settings.autoTradeEnabled);
  const [takeProfit, setTakeProfit] = useState(settings.takeProfit);
  const [stopLoss, setStopLoss] = useState(settings.stopLoss);
  const [leverage, setLeverage] = useState(
    snapLeverageToStep(settings.leverage, planTier, hlSliderMax)
  );
  const [askPermission, setAskPermission] = useState(settings.askPermission);
  const [minWinRate, setMinWinRate] = useState(settings.minWinRate);
  const [minTradesForWinRate, setMinTradesForWinRate] = useState(settings.minTradesForWinRate);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const userEditedRef = useRef(false);
  const baselineRef = useRef(settings);

  const markEdited = useCallback(() => {
    userEditedRef.current = true;
  }, []);

  const setRiskLevelTracked = useCallback((v: number) => {
    markEdited();
    setRiskLevel(v);
  }, [markEdited]);
  const setAutoTradeTracked = useCallback((v: boolean) => {
    markEdited();
    setAutoTrade(v);
  }, [markEdited]);
  const setTakeProfitTracked = useCallback((v: number) => {
    markEdited();
    setTakeProfit(v);
  }, [markEdited]);
  const setStopLossTracked = useCallback((v: number) => {
    markEdited();
    setStopLoss(v);
  }, [markEdited]);
  const setLeverageTracked = useCallback((v: number) => {
    markEdited();
    setLeverage(v);
  }, [markEdited]);
  const setAskPermissionTracked = useCallback((v: boolean) => {
    markEdited();
    setAskPermission(v);
  }, [markEdited]);
  const setMinWinRateTracked = useCallback((v: number) => {
    markEdited();
    setMinWinRate(v);
  }, [markEdited]);
  const setMinTradesForWinRateTracked = useCallback((v: number) => {
    markEdited();
    setMinTradesForWinRate(v);
  }, [markEdited]);

  const applySavedSnapshot = useCallback(
    (snapshot: VaultSettingsSnapshot) => {
      applySnapshotToState(snapshot, planTier, startMode, hlSliderMax, {
        setRiskLevel,
        setAutoTrade,
        setTakeProfit,
        setStopLoss,
        setLeverage,
        setAskPermission,
        setMinWinRate,
        setMinTradesForWinRate,
      });
      baselineRef.current = snapshot;
      userEditedRef.current = false;
    },
    [planTier, startMode, hlSliderMax]
  );

  useEffect(() => {
    setLeverage((v) => snapLeverageToStep(v, planTier, hlSliderMax));
  }, [hlSliderMax, planTier]);

  useEffect(() => {
    if (userEditedRef.current || isLoading) return;
    applySavedSnapshot(settings);
    setError(null);
    setNotice(null);
    setSuccess(false);
  }, [settings, isLoading, applySavedSnapshot]);

  const numChanged = (a: number, b: number) => Math.abs(a - b) > 0.001;
  const baseline = baselineRef.current;

  const tradingParamsChanged =
    riskLevel !== baseline.riskPct ||
    numChanged(takeProfit, baseline.takeProfit) ||
    numChanged(stopLoss, baseline.stopLoss) ||
    leverage !== snapLeverageToStep(baseline.leverage, planTier, hlSliderMax);

  const hasChanges =
    tradingParamsChanged ||
    autoTrade !== baseline.autoTradeEnabled ||
    askPermission !== baseline.askPermission ||
    minWinRate !== baseline.minWinRate ||
    minTradesForWinRate !== baseline.minTradesForWinRate;

  const save = useCallback(async (): Promise<{ ok: boolean; notice?: string | null }> => {
    if (!walletConnected || !saveWallet) {
      open();
      return { ok: false };
    }
    if (!hasChanges) {
      return { ok: true };
    }

    try {
      setIsLoading(true);
      setError(null);
      setNotice(null);

      const savedLeverage = snapLeverageToStep(leverage, planTier, hlSliderMax);

      const result = await persistVaultSettings({
        settings: {
          walletAddress: saveWallet,
          autoTradeEnabled: autoTrade,
          riskPct: riskLevel,
          leverage: savedLeverage,
          takeProfit,
          stopLoss,
          askPermission,
          minWinRate,
          minTradesForWinRate,
        },
        planTier,
        publicClient,
        walletClient,
        userAddress: saveWallet as `0x${string}`,
        isDemoUser,
        syncTradingParams: false,
        syncAutoTrade: false,
      });

      applySavedSnapshot(result.settings);

      if (autoTrade && autoTrade !== baseline.autoTradeEnabled) {
        await linkWallet(saveWallet);
      }

      let savedNotice: string | null = null;
      if (result.chainWarning) {
        savedNotice = result.chainWarning;
        setNotice(result.chainWarning);
      }

      setSuccess(true);
      onSaved();
      setTimeout(() => setSuccess(false), 2000);
      return { ok: true, notice: savedNotice };
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
      return { ok: false };
    } finally {
      setIsLoading(false);
    }
  }, [
    walletConnected,
    saveWallet,
    hasChanges,
    isDemoUser,
    publicClient,
    walletClient,
    autoTrade,
    riskLevel,
    leverage,
    takeProfit,
    stopLoss,
    askPermission,
    minWinRate,
    minTradesForWinRate,
    planTier,
    hlSliderMax,
    tradingParamsChanged,
    applySavedSnapshot,
    onSaved,
    open,
    linkWallet,
    baseline.autoTradeEnabled,
  ]);

  return {
    planTier,
    walletConnected,
    riskLevel,
    setRiskLevel: setRiskLevelTracked,
    autoTrade,
    setAutoTrade: setAutoTradeTracked,
    takeProfit,
    setTakeProfit: setTakeProfitTracked,
    stopLoss,
    setStopLoss: setStopLossTracked,
    leverage,
    setLeverage: setLeverageTracked,
    askPermission,
    setAskPermission: setAskPermissionTracked,
    minWinRate,
    setMinWinRate: setMinWinRateTracked,
    minTradesForWinRate,
    setMinTradesForWinRate: setMinTradesForWinRateTracked,
    isLoading,
    error,
    notice,
    success,
    hasChanges,
    save,
  };
}
