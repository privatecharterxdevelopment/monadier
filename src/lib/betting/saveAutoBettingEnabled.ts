import { supabase } from '../supabase';
import { getAuthUserId } from '../userWallets';
import {
  DEFAULT_AUTO_BETTING_RESULT_PREFS,
  type AutoBettingResultPrefs,
} from './autoBettingPrefs';

const ARBITRUM_CHAIN_ID = 42161;

export type AutoBettingSettings = AutoBettingResultPrefs & {
  enabled: boolean;
};

export async function loadAutoBettingSettings(
  walletAddress: string
): Promise<AutoBettingSettings> {
  const wallet = walletAddress.trim().toLowerCase();
  if (!wallet) {
    return { enabled: false, ...DEFAULT_AUTO_BETTING_RESULT_PREFS };
  }

  const full = await supabase
    .from('vault_settings')
    .select(
      'auto_betting_enabled, auto_betting_allow_win, auto_betting_allow_draw, auto_betting_allow_loss'
    )
    .eq('wallet_address', wallet)
    .eq('chain_id', ARBITRUM_CHAIN_ID)
    .maybeSingle();

  if (full.error) {
    const legacy = await supabase
      .from('vault_settings')
      .select('auto_betting_enabled')
      .eq('wallet_address', wallet)
      .eq('chain_id', ARBITRUM_CHAIN_ID)
      .maybeSingle();
    return {
      enabled: Boolean(legacy.data?.auto_betting_enabled),
      ...DEFAULT_AUTO_BETTING_RESULT_PREFS,
    };
  }

  const data = full.data;
  return {
    enabled: Boolean(data?.auto_betting_enabled),
    allowWin: data?.auto_betting_allow_win !== false,
    allowDraw: data?.auto_betting_allow_draw !== false,
    allowLoss: data?.auto_betting_allow_loss !== false,
  };
}

/** @deprecated Prefer loadAutoBettingSettings */
export async function loadAutoBettingEnabled(walletAddress: string): Promise<boolean> {
  const s = await loadAutoBettingSettings(walletAddress);
  return s.enabled;
}

export async function saveAutoBettingEnabled(
  walletAddress: string,
  enabled: boolean
): Promise<void> {
  await saveAutoBettingSettings(walletAddress, { enabled });
}

export async function saveAutoBettingSettings(
  walletAddress: string,
  patch: Partial<AutoBettingSettings>
): Promise<void> {
  const wallet = walletAddress.trim().toLowerCase();
  if (!wallet) throw new Error('Wallet required');

  const userId = await getAuthUserId();
  if (!userId) throw new Error('Sign in to change auto-betting settings');

  const row: Record<string, unknown> = {
    wallet_address: wallet,
    chain_id: ARBITRUM_CHAIN_ID,
    user_id: userId,
    updated_at: new Date().toISOString(),
    synced_at: new Date().toISOString(),
  };

  if (patch.enabled != null) row.auto_betting_enabled = patch.enabled;
  if (patch.allowWin != null) row.auto_betting_allow_win = patch.allowWin;
  if (patch.allowDraw != null) row.auto_betting_allow_draw = patch.allowDraw;
  if (patch.allowLoss != null) row.auto_betting_allow_loss = patch.allowLoss;

  const { error } = await supabase.from('vault_settings').upsert(row, {
    onConflict: 'wallet_address,chain_id',
  });
  if (error) {
    // Pref columns may not exist until migration — still save enabled flag.
    if (
      patch.enabled != null &&
      (patch.allowWin != null || patch.allowDraw != null || patch.allowLoss != null)
    ) {
      const fallback = {
        wallet_address: wallet,
        chain_id: ARBITRUM_CHAIN_ID,
        user_id: userId,
        auto_betting_enabled: patch.enabled,
        updated_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      };
      const { error: err2 } = await supabase
        .from('vault_settings')
        .upsert(fallback, { onConflict: 'wallet_address,chain_id' });
      if (err2) throw new Error(err2.message);
      return;
    }
    throw new Error(error.message);
  }
}
