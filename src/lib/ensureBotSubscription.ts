import { supabase } from './supabase';

/** Bot canTrade() needs an active subscriptions row — create free tier if missing. */
export async function ensureBotSubscription(): Promise<void> {
  const { error } = await supabase.rpc('ensure_my_subscription');
  if (error && !error.message.includes('Could not find the function')) {
    console.warn('[ensureBotSubscription]', error.message);
  }
}
