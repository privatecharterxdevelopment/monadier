import { useMemo } from 'react';
import { useMonadierWallet } from './useMonadierWallet';
import { useTerminalBotSettings } from './useTerminalBotSettings';

/** One HL wallet for balances, fills, bot settings, and agent closes. */
export function useHlActiveWallet(propWallet?: string | null) {
  const { address, isConnected } = useMonadierWallet();
  const { wallet: settingsWallet } = useTerminalBotSettings();

  return useMemo(() => {
    const connected = address?.toLowerCase();
    const settings = settingsWallet?.toLowerCase();
    const prop = propWallet?.toLowerCase();
    const wallet = prop ?? connected ?? settings;

    const walletMismatch =
      Boolean(connected && settings && connected !== settings) ||
      Boolean(prop && settings && prop !== settings);

    return {
      wallet: wallet as `0x${string}` | undefined,
      connectedWallet: connected as `0x${string}` | undefined,
      settingsWallet: settings as `0x${string}` | undefined,
      isConnected,
      walletMismatch,
    };
  }, [address, isConnected, propWallet, settingsWallet]);
}

export function fmtHlWalletShort(wallet: string): string {
  const w = wallet.toLowerCase();
  if (w.length < 12) return w;
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}
