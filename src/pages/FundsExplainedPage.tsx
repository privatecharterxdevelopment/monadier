import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Wallet, Database, ArrowRight, AlertTriangle } from 'lucide-react';
import MarketingPageLayout from '../components/layout/MarketingPageLayout';
import { MONADIER_VAULT_V11_ADDRESS, MONADIER_VAULT_EXPLORER_URL } from '../lib/monadierVault';

type Section = {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  body: React.ReactNode;
  vaultLink?: boolean;
  variant?: 'default' | 'success';
};

const sections: Section[] = [
  {
    icon: Wallet,
    title: 'Login vs wallet',
    body: (
      <>
        <strong className="font-medium text-[#0a0a0a]">Email / Google</strong> = your Monadier account
        (dashboard access).
        <br />
        <strong className="font-medium text-[#0a0a0a]">MetaMask wallet</strong> = where deposits and
        withdrawals are signed. They are linked in Settings after you connect a wallet.
      </>
    ),
  },
  {
    icon: Shield,
    title: 'The vault (one contract, your balance)',
    body: (
      <>
        When you deposit USDC, it goes to the{' '}
        <strong className="font-medium text-[#0a0a0a]">Monadier vault</strong> on Arbitrum — one smart
        contract used by all clients. The contract keeps a separate{' '}
        <strong className="font-medium text-[#0a0a0a]">balance per wallet address</strong>. Other users
        cannot withdraw your balance.
      </>
    ),
    vaultLink: true,
  },
  {
    icon: Database,
    title: 'When a trade closes',
    variant: 'success',
    body: (
      <>
        Profit or loss is credited to your{' '}
        <strong className="font-medium text-[#0a0a0a]">vault balance</strong> inside the contract —{' '}
        <strong className="font-medium text-[#0a0a0a]">not</strong> to your MetaMask wallet automatically.
        The dashboard trade list is updated for display; the money stays in the vault until you withdraw.
      </>
    ),
  },
  {
    icon: Wallet,
    title: 'Withdraw (only when you click it)',
    body: (
      <>
        To move USDC to MetaMask, use <strong className="font-medium text-[#0a0a0a]">Withdraw</strong> on
        the dashboard. You sign that transaction yourself. The bot never sends funds to your wallet on its
        own.
      </>
    ),
  },
];

const FundsExplainedPage: React.FC = () => {
  return (
    <MarketingPageLayout narrow centered>
      <div className="w-full max-w-lg mx-auto funds-explained-page">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#a1a1aa] font-medium mb-4">
            Vault &amp; wallet
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-[#0a0a0a] tracking-tighter mb-5">
            How your money works
          </h1>

          <p className="text-sm md:text-base text-[#52525b] leading-relaxed mb-3 max-w-md mx-auto">
            Monadier is not a normal “money in MetaMask per trade” app. Here is the simple version.
          </p>
          <p className="text-sm text-[#71717a] leading-relaxed mb-12 max-w-sm mx-auto">
            Your funds stay in an on-chain vault until you choose to withdraw.
          </p>

          <div className="space-y-4 mb-10 text-left">
            {sections.map((section, i) => {
              const Icon = section.icon;
              const cardClass =
                section.variant === 'success' ? 'funds-card funds-card--success' : 'funds-card';

              return (
                <article key={section.title} className={cardClass}>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-[#a1a1aa] mb-4">
                    {String(i + 1).padStart(2, '0')}
                  </p>
                  <div className="flex gap-4">
                    <div className="funds-card-icon">
                      <Icon
                        size={20}
                        strokeWidth={1.75}
                        className={section.variant === 'success' ? 'text-green-700' : 'text-[#52525b]'}
                        aria-hidden
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-lg font-semibold text-[#0a0a0a] mb-2">
                        {section.title}
                      </h2>
                      <p className="text-sm text-[#52525b] leading-relaxed">{section.body}</p>
                      {section.vaultLink && (
                        <a
                          href={MONADIER_VAULT_EXPLORER_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-block text-xs text-[#71717a] hover:text-[#0a0a0a] transition-colors break-all"
                        >
                          Vault: {MONADIER_VAULT_V11_ADDRESS}
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}

            <article className="funds-card funds-card--warning">
              <div className="flex gap-4">
                <div className="funds-card-icon">
                  <AlertTriangle size={20} className="text-amber-700" strokeWidth={1.75} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-semibold text-[#0a0a0a] mb-3">
                    Risks you should know
                  </h2>
                  <ul className="text-sm text-[#52525b] space-y-2 list-disc pl-5">
                    <li>Smart contract and bot operational risk (custodial model)</li>
                    <li>Crypto volatility and leverage</li>
                    <li>Only deposit what you can afford to lose</li>
                  </ul>
                </div>
              </div>
            </article>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
            <Link
              to="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full text-sm font-semibold text-[#0a0a0a] border border-[#c5c5cb] bg-white/60 backdrop-blur-xl hover:bg-white/85 transition-colors shadow-sm"
            >
              Create account
              <ArrowRight size={16} strokeWidth={2.5} />
            </Link>
            <Link
              to="/how-it-works"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 rounded-full text-sm font-medium text-[#52525b] border border-[#c5c5cb] bg-white/40 backdrop-blur-xl hover:bg-white/70 hover:text-[#0a0a0a] transition-colors"
            >
              Full product tour
            </Link>
          </div>

          <Link
            to="/login"
            className="text-sm text-[#71717a] hover:text-[#0a0a0a] transition-colors"
          >
            Back to login
          </Link>

          <p className="mt-10 text-[11px] text-[#a1a1aa] tracking-wide max-w-xs mx-auto">
            This is not financial advice. Your capital is at risk.
          </p>
      </div>
    </MarketingPageLayout>
  );
};

export default FundsExplainedPage;
