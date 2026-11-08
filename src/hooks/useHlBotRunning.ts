import { useEffect, useSyncExternalStore } from 'react';
import { resolveHlBotRunning } from '../lib/hlBotGates';
import {
  bumpHlBotSettings,
  getHlBotSettingsTick,
  getLastKnownHlBotAutoTrade,
  getOptimisticHlBotRunning,
  notifyHlBotRunningChange,
  setLastKnownHlBotAutoTrade,
  setOptimisticHlBotRunning,
  subscribeHlBotRunning,
} from '../lib/hlBotRunningStore';
import { useTerminalBotSettings } from './useTerminalBotSettings';

type Options = {
  metricsAutoTrade?: boolean;
  metricsHasSnapshot?: boolean;
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
    metricsHasSnapshot: opts.metricsHasSnapshot,
    lastKnownAutoTrade: getLastKnownHlBotAutoTrade(),
    optimistic,
  });

  useEffect(() => {
    // Never stamp "off" from the empty default snapshot (no wallet yet) —
    // that made SCAN say "Bot off" while the agent panel was still Running.
    if (!isLoading && wallet) {
      setLastKnownHlBotAutoTrade(settings.autoTradeEnabled);
    }
  }, [settings.autoTradeEnabled, isLoading, wallet]);

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
