import { supabase } from '../supabase';
import { getAuthUserId } from '../userWallets';
import {
  DEFAULT_AUTO_BETTING_RESULT_PREFS,
  type AutoBettingResultPrefs,
} from './autoBettingPrefs';

const ARBITRUM_CHAIN_ID = 42161;

export type AutoBettingSettings = AutoBettingResultPrefs & {
  enabled: boolean;
  /** Max spot USDC for AI betting agent. 0 = paused until set. */
  budgetUsd: number;
};

export async function loadAutoBettingSettings(
  walletAddress: string
): Promise<AutoBettingSettings> {
  const wallet = walletAddress.trim().toLowerCase();
  if (!wallet) {
    return { enabled: false, budgetUsd: 0, ...DEFAULT_AUTO_BETTING_RESULT_PREFS };
  }

  const full = await supabase
    .from('vault_settings')
    .select(
      'auto_betting_enabled, auto_betting_allow_win, auto_betting_allow_draw, auto_betting_allow_loss, auto_betting_budget_usd'
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
      budgetUsd: 0,
      ...DEFAULT_AUTO_BETTING_RESULT_PREFS,
    };
  }

  const data = full.data;
  return {
    enabled: Boolean(data?.auto_betting_enabled),
    allowWin: data?.auto_betting_allow_win !== false,
    allowDraw: data?.auto_betting_allow_draw !== false,
    allowLoss: data?.auto_betting_allow_loss !== false,
    budgetUsd: Math.max(0, Number(data?.auto_betting_budget_usd) || 0),
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
  if (patch.budgetUsd != null) {
    row.auto_betting_budget_usd = Math.max(0, Math.min(1_000_000, Number(patch.budgetUsd) || 0));
  }

  const { error } = await supabase.from('vault_settings').upsert(row, {
    onConflict: 'wallet_address,chain_id',
  });
  if (error) {
    if (patch.enabled != null) {
      const fallback: Record<string, unknown> = {
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
      if (patch.budgetUsd != null || patch.allowWin != null) {
        throw new Error('Apply DB migration for betting budget / prefs, then retry.');
      }
      return;
    }
    throw new Error(error.message);
  }
}
