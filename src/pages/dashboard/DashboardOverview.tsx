import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  History,
  Package,
  Wallet,
  RefreshCw,
  CreditCard,
  LineChart,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth, DEMO_WALLET_ADDRESS } from '../../contexts/AuthContext';
import { useWeb3 } from '../../contexts/Web3Context';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAppKit } from '@reown/appkit/react';
import { supabase } from '../../lib/supabase';
import { VaultBalanceCard, WithdrawPromptBanner } from '../../components/vault';
import OnboardingBanner from '../../components/onboarding/OnboardingBanner';
import { useOnboarding } from '../../hooks/useOnboarding';
import { useTradingDashboardMetrics } from '../../hooks/useTradingDashboardMetrics';
import TradingTerminalShell from '../../components/dashboard/TradingTerminalShell';

type OverviewTab = 'summary' | 'wallet' | 'vault' | 'activity';

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  plan_tier: string;
  created_at: string;
}

interface Position {
  id: string;
  token_symbol: string;
  direction: 'LONG' | 'SHORT';
  entry_price: number;
  entry_amount: number;
  profit_loss: number | null;
  profit_loss_percent: number | null;
  status: string;
  created_at: string;
  closed_at: string | null;
}

const DashboardOverview: React.FC = () => {
  const { isDemoUser } = useAuth();
  const {
    isConnected,
    address,
    currentChain,
    nativeBalance,
    tokenBalances,
    totalUsdValue,
    isLoadingBalances,
    refreshBalances,
  } = useWeb3();
  const { planTier, dailyTradesRemaining } = useSubscription();
  const { isComplete: isProfileComplete, isLoading: isOnboardingLoading } = useOnboarding();
  const { open } = useAppKit();
  const { metrics, refresh } = useTradingDashboardMetrics();

  const [activeTab, setActiveTab] = useState<OverviewTab>('summary');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [recentTrades, setRecentTrades] = useState<Position[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(true);

  const getMembershipName = () => {
    if (!planTier || planTier === 'free') return 'Free';
    return planTier.charAt(0).toUpperCase() + planTier.slice(1);
  };

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  useEffect(() => {
    const fetchPayments = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('payments')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5);
          if (data) setPayments(data);
        }
      } catch (err) {
        console.error('Error fetching payments:', err);
      } finally {
        setLoadingPayments(false);
      }
    };
    fetchPayments();
  }, []);

  useEffect(() => {
    const fetchRecentTrades = async () => {
      const wallet = isDemoUser ? DEMO_WALLET_ADDRESS : address?.toLowerCase();
      if (!wallet) {
        setLoadingTrades(false);
        return;
      }
      try {
        const { data } = await supabase
          .from('positions')
          .select(
            'id, token_symbol, direction, entry_price, entry_amount, profit_loss, profit_loss_percent, status, created_at, closed_at'
          )
          .eq('wallet_address', wallet)
          .in('status', ['closed', 'failed'])
          .order('closed_at', { ascending: false, nullsFirst: false })
          .limit(5);
        if (data) setRecentTrades(data);
      } catch (err) {
        console.error('Error fetching trades:', err);
      } finally {
        setLoadingTrades(false);
      }
    };
    fetchRecentTrades();
  }, [address, isDemoUser]);

  const formatDuration = (start: string, end?: string | null) => {
    const diff = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const tabs = [
    { id: 'summary' as const, label: 'Summary' },
    { id: 'wallet' as const, label: 'Wallet' },
    { id: 'vault' as const, label: 'Vault & bot' },
    { id: 'activity' as const, label: 'Activity', badge: recentTrades.length || undefined },
  ];

  const summaryPrimary = (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-[#0a0a0a] mb-1">
          Portfolio overview
        </h2>
        <p className="text-sm text-[#52525b]">
          Combined wallet + vault · bot P/L on the right
        </p>
      </div>
      <div className="rounded-xl border border-[#e4e4e8] bg-[#f7f7f9] p-6 min-h-[200px] flex flex-col justify-center">
        <p className="text-[11px] uppercase tracking-wider text-[#a1a1aa] mb-2">Account total</p>
        <p className="font-display text-4xl font-semibold text-[#0a0a0a] tracking-tight">
          ${formatCurrency(totalUsdValue + metrics.vaultBalanceUsd)}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/dashboard/chart-trades"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#2a2a2e] text-white text-sm font-medium hover:bg-[#3a3a3e] transition-colors"
          >
            <LineChart size={16} />
            Open trading terminal
          </Link>
          <Link
            to="/dashboard/bot-trading"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#c5c5cb] bg-white text-sm font-medium text-[#0a0a0a] hover:bg-[#f7f7f9]"
          >
            <Bot size={16} />
            View positions
          </Link>
        </div>
      </div>
    </div>
  );

  const walletPanel = (
    <div className="dashboard-panel p-6">
      {isConnected ? (
        <>
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[#52525b] text-sm">Wallet balance</p>
                {currentChain && (
                  <span className="px-2 py-0.5 bg-black/[0.06] text-[#0a0a0a] text-xs rounded-full">
                    {currentChain.shortName}
                  </span>
                )}
                <button
                  type="button"
                  onClick={refreshBalances}
                  disabled={isLoadingBalances}
                  className="p-1 text-[#52525b] hover:text-[#0a0a0a]"
                >
                  <RefreshCw size={14} className={isLoadingBalances ? 'animate-spin' : ''} />
                </button>
              </div>
              <h2 className="text-3xl font-semibold text-[#0a0a0a]">${formatCurrency(totalUsdValue)}</h2>
              {address && (
                <p className="text-[#71717a] text-sm mt-1 font-mono">{formatAddress(address)}</p>
              )}
            </div>
            <Link
              to="/dashboard/chart-trades"
              className="px-4 py-2 rounded-full border border-[#c5c5cb] bg-white text-sm font-medium text-[#0a0a0a] hover:bg-[#f7f7f9] flex items-center gap-2"
            >
              <Bot size={16} />
              Trade
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="dashboard-panel-inner p-3">
              <p className="text-xs text-[#71717a]">{currentChain?.nativeCurrency.symbol || 'Native'}</p>
              <p className="text-lg text-[#0a0a0a]">{parseFloat(nativeBalance).toFixed(4)}</p>
            </div>
            {tokenBalances.slice(0, 3).map((token) => (
              <div key={token.symbol} className="dashboard-panel-inner p-3">
                <p className="text-xs text-[#71717a]">{token.symbol}</p>
                <p className="text-lg text-[#0a0a0a]">{parseFloat(token.balance).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center py-10 text-center">
          <Wallet size={40} className="text-[#a1a1aa] mb-4" />
          <h3 className="text-lg font-medium text-[#0a0a0a] mb-2">Connect your wallet</h3>
          <p className="text-sm text-[#52525b] mb-4 max-w-sm">
            Connect to view balances and trade on-chain.
          </p>
          <button
            type="button"
            onClick={() => open()}
            className="px-6 py-3 rounded-full bg-[#2a2a2e] text-white text-sm font-medium"
          >
            Connect wallet
          </button>
        </div>
      )}
    </div>
  );

  const vaultPanel = (
    <div className="space-y-4">
      {isConnected && address && (
        <WithdrawPromptBanner chainId={42161} walletAddress={address} />
      )}
      <VaultBalanceCard compact />
      <div className="dashboard-panel p-5 text-sm text-[#52525b]">
        <p>
          Deposit USDC to the Arbitrum vault for auto-trading. P/L stays in the vault until you withdraw.
        </p>
        <Link to="/dashboard/bot-trading" className="inline-flex items-center gap-1 mt-3 text-[#0a0a0a] font-medium hover:underline">
          Manage bot & positions <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );

  const activityPanel = (
    <div className="space-y-6">
      <div className="dashboard-panel overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e4e4e8] flex justify-between items-center">
          <h3 className="font-medium text-[#0a0a0a] flex items-center gap-2">
            <History size={18} /> Recent closed trades
          </h3>
          <Link to="/dashboard/bot-trading" className="text-sm text-[#52525b] hover:text-[#0a0a0a]">
            View all
          </Link>
        </div>
        {loadingTrades ? (
          <div className="py-12 text-center">
            <RefreshCw className="animate-spin mx-auto text-[#a1a1aa]" />
          </div>
        ) : recentTrades.length === 0 ? (
          <p className="py-10 text-center text-[#52525b] text-sm">No closed trades yet</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid grid-cols-6 gap-3 px-4 py-2 text-xs font-medium text-[#71717a] border-b border-[#e4e4e8] min-w-[560px]">
              <div>Token</div>
              <div>Dir</div>
              <div>P/L</div>
              <div>Size</div>
              <div>Duration</div>
              <div>Result</div>
            </div>
            {recentTrades.map((trade) => {
              const win = (trade.profit_loss || 0) >= 0;
              return (
                <div
                  key={trade.id}
                  className="grid grid-cols-6 gap-3 px-4 py-3 border-b border-[#ececef] text-sm min-w-[560px] items-center"
                >
                  <span className="font-medium text-[#0a0a0a]">{trade.token_symbol}</span>
                  <span className={trade.direction === 'LONG' ? 'text-green-600' : 'text-red-600'}>
                    {trade.direction}
                  </span>
                  <span className={win ? 'text-green-600' : 'text-red-600'}>
                    {win ? '+' : ''}${(trade.profit_loss || 0).toFixed(2)}
                  </span>
                  <span className="text-[#0a0a0a]">${(trade.entry_amount || 0).toFixed(2)}</span>
                  <span className="text-[#71717a]">{formatDuration(trade.created_at, trade.closed_at)}</span>
                  <span className={win ? 'text-green-600' : 'text-red-600'}>
                    {win ? 'WIN' : 'LOSS'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="dashboard-panel overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e4e4e8] flex justify-between">
          <h3 className="font-medium text-[#0a0a0a] flex items-center gap-2">
            <CreditCard size={18} /> Payments
          </h3>
          <Link to="/dashboard/subscriptions" className="text-sm text-[#52525b] hover:text-[#0a0a0a]">
            Plans
          </Link>
        </div>
        <div className="p-5">
          {loadingPayments ? (
            <RefreshCw className="animate-spin mx-auto text-[#a1a1aa]" />
          ) : payments.length === 0 ? (
            <p className="text-center text-sm text-[#52525b] py-6">No payments yet</p>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between items-center p-3 rounded-xl bg-[#f7f7f9] border border-[#ececef]"
                >
                  <span className="text-[#0a0a0a] capitalize">{p.plan_tier} plan</span>
                  <span className="font-medium text-[#0a0a0a]">
                    ${(p.amount / 100).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const summaryFooter = (
    <div className="space-y-6">
      <OnboardingBanner />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="dashboard-panel p-5">
          <h3 className="text-xs uppercase tracking-wider text-[#a1a1aa] mb-3">Quick actions</h3>
          <div className="space-y-2">
            {[
              { to: '/dashboard/chart-trades', icon: Bot, label: 'Trading terminal' },
              { to: '/dashboard/bot-trading', icon: History, label: 'Bot positions' },
              { to: '/dashboard/subscriptions', icon: Package, label: 'Plans' },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-[#f7f7f9] border border-transparent hover:border-[#ececef]"
              >
                <span className="flex items-center gap-2 text-sm text-[#0a0a0a]">
                  <item.icon size={16} className="text-[#52525b]" />
                  {item.label}
                </span>
                <ArrowRight size={14} className="text-[#a1a1aa]" />
              </Link>
            ))}
          </div>
        </div>
        <div className="dashboard-panel p-5">
          <div className="flex gap-3 mb-4">
            <BadgeCheck className="text-[#52525b]" size={22} />
            <div>
              <h3 className="font-semibold text-[#0a0a0a]">{getMembershipName()} plan</h3>
              <p className="text-xs text-[#71717a] mt-1">
                {dailyTradesRemaining === -1
                  ? 'Unlimited trades'
                  : `${dailyTradesRemaining} trades left today`}
              </p>
            </div>
          </div>
          {!isProfileComplete && !isOnboardingLoading && (
            <Link to="/dashboard/profile" className="text-sm text-[#0a0a0a] underline">
              Complete profile
            </Link>
          )}
        </div>
        <div className="dashboard-panel p-5 text-xs text-[#71717a] leading-relaxed">
          <span className="font-medium text-[#52525b]">Risk disclosure:</span> Crypto trading
          involves substantial risk. Past performance does not guarantee future results.
        </div>
      </div>
    </div>
  );

  const tabContent =
    activeTab === 'wallet'
      ? walletPanel
      : activeTab === 'vault'
        ? vaultPanel
        : activeTab === 'activity'
          ? activityPanel
          : null;

  return (
    <TradingTerminalShell
      headerTitle="Monadier"
      variant="overview"
      metrics={metrics}
      walletUsd={totalUsdValue}
      planLabel={getMembershipName()}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as OverviewTab)}
      onRefresh={refresh}
      primary={activeTab === 'summary' ? summaryPrimary : tabContent}
      footer={activeTab === 'summary' ? summaryFooter : undefined}
    />
  );
};

export default DashboardOverview;
