import { getSupabaseClient, getAuthRedirectBase, supabase } from './supabaseClient';
import { normalizeUsernameInput } from './username';
import { ensureUserProfile, patchUserProfile } from './profile';

export { supabase };

/** Production password-reset landing — never localhost (Supabase Site URL may still be wrong). */
export const PRODUCTION_PASSWORD_RESET_URL = 'https://monadier.vercel.app/reset-password';

function passwordResetRedirectUrl(): string {
  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${origin}/reset-password`;
    }
  }
  if (import.meta.env.DEV) {
    return `${getAuthRedirectBase()}/reset-password`;
  }
  return PRODUCTION_PASSWORD_RESET_URL;
}

// Auth helpers
export const signUp = async (
  email: string,
  password: string,
  fullName: string,
  country: string,
  username: string
) => {
  const emailRedirectTo = `${getAuthRedirectBase()}/auth/callback`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
        full_name: fullName,
        country,
        username: normalizeUsernameInput(username),
      },
    },
  });

  return { data, error };
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error?.message?.toLowerCase().includes('email not confirmed')) {
    return {
      data,
      error: {
        ...error,
        message:
          'Please confirm your email first (check inbox/spam), then sign in again.',
      },
    };
  }

  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const signInWithGoogle = async () => {
  const redirectTo = `${getAuthRedirectBase()}/auth/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: false,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });
  return { data, error };
};

// Password reset — edge function builds link with hardcoded production URL (no localhost)
export const resetPassword = async (email: string) => {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return { data: null, error: new Error('Email required') };
  }

  try {
    const { data, error } = await supabase.functions.invoke('request-password-reset', {
      body: { email: trimmed },
    });
    if (error) throw error;
    if (data && typeof data === 'object' && 'success' in data && !data.success) {
      const msg =
        typeof (data as { error?: string }).error === 'string'
          ? (data as { error: string }).error
          : 'Failed to send reset email';
      return { data: null, error: new Error(msg) };
    }
    return { data, error: null };
  } catch (edgeErr) {
    console.warn('[resetPassword] edge function failed, using client fallback', edgeErr);
    const redirectTo = passwordResetRedirectUrl();
    const { data, error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo,
    });
    return { data, error };
  }
};

/** Providers linked to this account (email, google, etc.) */
export function getAccountProviders(user: {
  identities?: { provider: string }[];
  app_metadata?: { provider?: string; providers?: string[] };
} | null): string[] {
  if (!user) return [];
  const fromIdentities = user.identities?.map((i) => i.provider) ?? [];
  if (fromIdentities.length > 0) return [...new Set(fromIdentities)];
  const meta = user.app_metadata?.providers ?? (user.app_metadata?.provider ? [user.app_metadata.provider] : []);
  return meta;
}

// Update password (for logged-in users or from reset link)
export const updatePassword = async (
  newPassword: string,
  opts?: { fromRecovery?: boolean }
) => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) return { data: null, error: userError };
  if (!user) {
    return { data: null, error: new Error('Not signed in') };
  }

  const providers = getAccountProviders(user);
  if (
    !opts?.fromRecovery &&
    !providers.includes('email') &&
    providers.length > 0
  ) {
    return {
      data: null,
      error: new Error(
        'This account uses Google sign-in. Use “Send reset link” to add a password, or continue with Google.'
      ),
    };
  }

  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  return { data, error };
};

export const sendWelcomeEmail = async (email: string, name: string) => {
  const { data, error } = await supabase.functions.invoke('send-welcome-email', {
    body: { email, name }
  });
  return { data, error };
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// User profile interactions
export const getUserProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
    
  return { data, error };
};

export const updateUserProfile = async (userId: string, updates: Record<string, unknown>) => {
  try {
    const data = await patchUserProfile(userId, updates);
    return { data, error: null };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Profile update failed';
    return { data: null, error: new Error(message) };
  }
};

export { ensureUserProfile, patchUserProfile } from './profile';
export { isUsernameAvailable, setUsernameOnce } from './profile';

// KYC related functions
export const updateKycStatus = async (userId: string, status: string, tier: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ 
      kyc_status: status,
      membership_tier: tier 
    })
    .eq('id', userId);
    
  return { data, error };
};

export const uploadDocument = async (userId: string, file: File, type: string) => {
  const fileName = `${userId}/${type}/${file.name}`;
  
  const { data, error } = await supabase.storage
    .from('kyc_documents')
    .upload(fileName, file);
    
  return { data, error };
};

// Placeholder for transaction data
export const getTransactions = async (userId: string) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return { data, error };
};

// User wallets management
export const getUserWallets = async (userId: string) => {
  const { data, error } = await supabase
    .from('user_wallets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return { data, error };
};

export const isWalletLinked = async (userId: string, walletAddress: string) => {
  const { data, error } = await supabase
    .from('user_wallets')
    .select('id')
    .eq('user_id', userId)
    .eq('wallet_address', walletAddress.toLowerCase())
    .limit(1);

  return { isLinked: data && data.length > 0, error };
};

export const linkWalletToUser = async (userId: string, walletAddress: string, label?: string) => {
  const wallet = walletAddress.toLowerCase();

  const { data: ownRow } = await supabase
    .from('user_wallets')
    .select('id')
    .eq('user_id', userId)
    .eq('wallet_address', wallet)
    .limit(1);

  if (ownRow && ownRow.length > 0) {
    return { data: ownRow, error: null };
  }

  const { error: rpcError } = await supabase.rpc('register_my_wallet', { p_wallet: wallet });
  if (!rpcError) {
    const { data: linked } = await supabase
      .from('user_wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('wallet_address', wallet)
      .limit(1);
    return { data: linked, error: null };
  }

  if (
    !rpcError.message.includes('Could not find the function') &&
    !rpcError.message.includes('linked to another')
  ) {
    return { data: null, error: rpcError };
  }

  if (rpcError.message.includes('linked to another')) {
    return {
      data: null,
      error: new Error('This wallet is already linked to another Monadier account.'),
    };
  }

  const { data, error } = await supabase.from('user_wallets').upsert(
    {
      user_id: userId,
      wallet_address: wallet,
      label: label || `Wallet ${wallet.slice(0, 6)}…${wallet.slice(-4)}`,
    },
    { onConflict: 'user_id,wallet_address' }
  );

  if (error) {
    const ownedByOther =
      error.code === '23505' ||
      (error as { status?: number }).status === 409 ||
      error.message?.includes('idx_user_wallets_wallet_unique') ||
      error.message?.includes('duplicate key value');
    if (ownedByOther) {
      const { data: retryOwn } = await supabase
        .from('user_wallets')
        .select('id')
        .eq('user_id', userId)
        .eq('wallet_address', wallet)
        .limit(1);
      if (retryOwn && retryOwn.length > 0) {
        await supabase.rpc('register_my_wallet', { p_wallet: wallet });
        return { data: retryOwn, error: null };
      }
      return {
        data: null,
        error: new Error('This wallet is already linked to another Monadier account.'),
      };
    }
    return { data, error };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('wallet_address')
    .eq('id', userId)
    .maybeSingle();
  if (!profile?.wallet_address?.trim()) {
    await supabase.from('profiles').update({ wallet_address: wallet }).eq('id', userId);
  }
  await supabase.rpc('register_my_wallet', { p_wallet: wallet });

  return { data, error: null };
};

export const unlinkWallet = async (userId: string, walletAddress: string) => {
  const { data, error } = await supabase
    .from('user_wallets')
    .delete()
    .eq('user_id', userId)
    .eq('wallet_address', walletAddress.toLowerCase());

  return { data, error };
};

// Get all positions for all user's wallets
export const getAllUserPositions = async (userId: string) => {
  // First get all user's wallets
  const { data: wallets, error: walletsError } = await getUserWallets(userId);
  if (walletsError || !wallets || wallets.length === 0) {
    return { data: [], error: walletsError };
  }

  // Get positions for all wallets
  const walletAddresses = wallets.map(w => w.wallet_address.toLowerCase());
  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .in('wallet_address', walletAddresses)
    .order('created_at', { ascending: false });

  return { data, error };
};