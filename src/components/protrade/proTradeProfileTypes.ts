export type ProTradeProfileTab =
  | 'identity'
  | 'security'
  | 'wallets'
  | 'betting'
  | 'botTrades'
  | 'history';

export const PRO_TRADE_PROFILE_TABS: {
  id: ProTradeProfileTab;
  labelKey: `profile.tabs.${ProTradeProfileTab}`;
}[] = [
  { id: 'identity', labelKey: 'profile.tabs.identity' },
  { id: 'security', labelKey: 'profile.tabs.security' },
  { id: 'wallets', labelKey: 'profile.tabs.wallets' },
  { id: 'betting', labelKey: 'profile.tabs.betting' },
  { id: 'botTrades', labelKey: 'profile.tabs.botTrades' },
  { id: 'history', labelKey: 'profile.tabs.history' },
];
