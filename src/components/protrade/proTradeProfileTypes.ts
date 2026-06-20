export type ProTradeProfileTab = 'identity' | 'security' | 'wallets' | 'betting' | 'history';

export const PRO_TRADE_PROFILE_TABS: { id: ProTradeProfileTab; label: string }[] = [
  { id: 'identity', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'wallets', label: 'Wallets' },
  { id: 'betting', label: 'Betting' },
  { id: 'history', label: 'Login history' },
];
