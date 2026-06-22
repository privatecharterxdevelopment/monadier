/** Instant bot on/off for analyzer UI — DB/metrics can lag a few seconds after Stop bot. */
let optimisticAutoTrade: boolean | null = null;
let settingsTick = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeHlBotRunning(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOptimisticHlBotRunning(): boolean | null {
  return optimisticAutoTrade;
}

export function getHlBotSettingsTick(): number {
  return settingsTick;
}

export function setOptimisticHlBotRunning(enabled: boolean | null): void {
  optimisticAutoTrade = enabled;
  emit();
}

export function bumpHlBotSettings(): void {
  settingsTick += 1;
  emit();
}

export function notifyHlBotRunningChange(enabled: boolean): void {
  setOptimisticHlBotRunning(enabled);
  bumpHlBotSettings();
}
