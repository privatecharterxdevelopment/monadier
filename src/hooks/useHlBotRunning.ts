import { useEffect, useSyncExternalStore } from 'react';
import { resolveHlBotRunning } from '../lib/hlBotGates';
import {
  bumpHlBotSettings,
  getHlBotSettingsTick,
  getOptimisticHlBotRunning,
  notifyHlBotRunningChange,
  setOptimisticHlBotRunning,
  subscribeHlBotRunning,
} from '../lib/hlBotRunningStore';
import { useTerminalBotSettings } from './useTerminalBotSettings';

type Options = {
  metricsAutoTrade?: boolean;
};

export function useHlBotRunning(opts: Options = {}) {
  const settingsTick = useSyncExternalStore(
    subscribeHlBotRunning,
    getHlBotSettingsTick,
    getHlBotSettingsTick
  );
  const optimistic = useSyncExternalStore(
    subscribeHlBotRunning,
    getOptimisticHlBotRunning,
    getOptimisticHlBotRunning
  );
  const { settings, isLoading, reload, wallet } = useTerminalBotSettings(settingsTick);

  const botRunning = resolveHlBotRunning({
    settingsAutoTrade: settings.autoTradeEnabled,
    settingsLoading: isLoading,
    metricsAutoTrade: opts.metricsAutoTrade,
    optimistic,
  });

  useEffect(() => {
    if (optimistic === null || isLoading) return;
    if (settings.autoTradeEnabled === optimistic) {
      setOptimisticHlBotRunning(null);
    }
  }, [settings.autoTradeEnabled, optimistic, isLoading]);

  return {
    botRunning,
    settings,
    settingsLoading: isLoading,
    wallet,
    reloadSettings: reload,
    notifyRunningChange: notifyHlBotRunningChange,
    bumpSettings: bumpHlBotSettings,
  };
}
