import { createClient } from '@supabase/supabase-js';

// In a real application, these would be in environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-supabase-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Auth helpers
export const signUp = async (email: string, password: string, fullName: string, country: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        country
      }
    }
  });
  
  return { data, error };
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/dashboard`
    }
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

export const updateUserProfile = async (userId: string, updates: any) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);
    
  return { data, error };
};

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
  const { data, error } = await supabase
    .from('user_wallets')
    .upsert({
      user_id: userId,
      wallet_address: walletAddress.toLowerCase(),
      label: label || `Wallet ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
      created_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,wallet_address'
    });

  return { data, error };
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