# Monadier Dashboard — Feature Map

Reference design: light grey studio UI (`#e8e8ec`), black typography, glass cards, pill navigation — aligned with marketing landing.

## Routes & navigation

| Route | Page | Purpose |
|-------|------|---------|
| `/dashboard` | Overview | Wallet balance, vault card, onboarding, quick actions, recent trades & payments |
| `/dashboard/chart-trades` | Chart trades | Live chart, AI strategy, manual trade panel, gas estimator, trading settings, live feed, your trades |
| `/dashboard/bot-trading` | Bot history | Open/closed positions, stats, approvals, bot settings summary, trade table |
| `/dashboard/subscriptions` | Plans | Stripe plans, desktop license, referral/checkout modals |
| `/dashboard/downloads` | Downloads | Desktop app DMG, docs links |
| `/dashboard/profile` | Profile | Profile, password, linked wallets, vault contract, subscription, referrals |
| `/dashboard/monitor` | Admin | Users, trades, vault txs, treasury, fees (admin email only) |

## Overview (`DashboardOverview`)

- Onboarding banner (profile → wallet → plan)
- Withdraw prompt banner
- Vault balance card (deposit, withdraw, auto-trade, position summary)
- Legacy vault withdraw (if applicable)
- Wallet balance + token breakdown (Web3)
- Trade now CTA → chart trades
- Quick links: chart trades, bot history, plans, profile
- Recent bot trades (Supabase positions)
- Payment history
- Membership / daily trades status
- Risk disclaimer

## Chart trades (`TradingBotPage`)

- Pair & timeframe selector, zoom, live candlestick chart
- AI strategy panel: direction, confidence, R/R, indicators, trend warning
- Network mismatch warning + chain switch
- Pending trade approval card
- Live community trades feed
- Your trades table (on-chain history, filters, stats)
- Right column: connect wallet / plans / trade execution
- Trading settings (collapsible): strategy, safety, history tab
- Gas estimator, subscription gates, paper trading (free tier)
- Bot active mode: open position P/L, fees, close controls
- Plan upgrade modals, risk warnings

## Bot history (`BotHistoryPage`)

- Aggregated P/L stats (live + closed)
- Bot settings display (risk, TP, SL)
- Open positions with live P/L
- Closed trades table (filters, explorer links)
- Pending approval UI + realtime Supabase subscription
- Info popup, refresh, link to chart trades

## Plans (`SubscriptionsPage`)

- Tier cards (free, starter, pro, elite, desktop)
- Stripe checkout / billing cycle
- Desktop license activation & download CTA
- Current subscription status

## Downloads (`DownloadsPage`)

- macOS desktop build download
- Version info & install notes

## Profile (`SettingsPage`)

- Profile fields (name, country)
- Password change / reset
- Linked wallets (add/remove)
- V11 vault contract link
- Subscription management
- Referral program

## Admin (`AdminMonitorPage`)

- Platform stats, treasury, users
- Trades, vault movements, fee breakdown
- Subscriptions & payments tables
- Emergency tools (admin only)

## Shared services (unchanged in redesign)

- Auth (Supabase), Web3 (wagmi/AppKit), subscriptions context
- Vault modals: deposit, withdraw, settings
- Notifications dropdown
- Demo mode (local dev)
