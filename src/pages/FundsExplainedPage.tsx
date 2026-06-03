import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Wallet, Database, ArrowRight, AlertTriangle } from 'lucide-react';
import LandingNav from '../components/landing/LandingNav';
import CookieConsent from '../components/ui/CookieConsent';
import { MONADIER_VAULT_V11_ADDRESS, MONADIER_VAULT_EXPLORER_URL } from '../lib/monadierVault';

const sections = [
  {
    icon: Wallet,
    title: 'Login vs wallet',
    body: (
      <>
        <strong className="text-[#0a0a0a] font-medium">Email / Google</strong> = your Monadier account
        (dashboard access).
        <br />
        <strong className="text-[#0a0a0a] font-medium">MetaMask wallet</strong> = where deposits and
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
        <strong className="text-[#0a0a0a] font-medium">Monadier vault</strong> on Arbitrum — one smart
        contract used by all clients. The contract keeps a separate{' '}
        <strong className="text-[#0a0a0a] font-medium">balance per wallet address</strong>. Other users
        cannot withdraw your balance.
      </>
    ),
    vaultLink: true,
  },
  {
    icon: Database,
    title: 'When a trade closes',
    highlight: 'success',
    body: (
      <>
        Profit or loss is credited to your{' '}
        <strong className="text-[#0a0a0a] font-medium">vault balance</strong> inside the contract —{' '}
        <strong className="text-[#0a0a0a] font-medium">not</strong> to your MetaMask wallet automatically.
        The dashboard trade list is updated for display; the money stays in the vault until you withdraw.
      </>
    ),
  },
  {
    icon: Wallet,
    title: 'Withdraw (only when you click it)',
    body: (
      <>
        To move USDC to MetaMask, use <strong className="text-[#0a0a0a] font-medium">Withdraw</strong> on
        the dashboard. You sign that transaction yourself. The bot never sends funds to your wallet on its
        own.
      </>
    ),
  },
];

const FundsExplainedPage: React.FC = () => {
  return (
    <div className="auth-page min-h-[100dvh]">
      <LandingNav variant="light" />

      <main className="flex flex-col items-center px-6 pt-28 pb-20">
        <div className="w-full max-w-lg mx-auto text-center">
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-[#0a0a0a] tracking-tighter mb-5">
            How your money works
          </h1>

          <p className="text-sm md:text-base text-[#52525b] leading-relaxed mb-3 max-w-md mx-auto">
            Monadier is not a normal “money in MetaMask per trade” app. Here is the simple version.
          </p>
          <p className="text-sm text-[#71717a] leading-relaxed mb-14 max-w-sm mx-auto">
            Your funds stay in an on-chain vault until you choose to withdraw.
          </p>

          <div className="space-y-4 mb-8 text-left">
            {sections.map((section, i) => {
              const Icon = section.icon;
              return (
                <div
                  key={section.title}
                  className={`glass-step text-left ${
                    section.highlight === 'success'
                      ? 'border-green-500/25 bg-green-500/[0.06]'
                      : ''
                  }`}
                >
                  <div className="glass-step-icon">
                    <Icon
                      size={20}
                      strokeWidth={1.75}
                      className={section.highlight === 'success' ? 'text-green-700' : undefined}
                      aria-hidden
                    />
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-[#a1a1aa] mb-3">
                    {String(i + 1).padStart(2, '0')}
                  </p>
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
              );
            })}

            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] px-6 py-6 text-left backdrop-blur-xl">
              <div className="flex items-start gap-3 mb-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-white/60">
                  <AlertTriangle size={18} className="text-amber-700" strokeWidth={1.75} aria-hidden />
                </div>
                <h2 className="font-display text-lg font-semibold text-[#0a0a0a] pt-1.5">
                  Risks you should know
                </h2>
              </div>
              <ul className="text-sm text-[#52525b] space-y-2 list-disc pl-5">
                <li>Smart contract and bot operational risk (custodial model)</li>
                <li>Crypto volatility and leverage</li>
                <li>Only deposit what you can afford to lose</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
            <Link
              to="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full text-sm font-semibold text-[#0a0a0a] border border-[#c5c5cb] bg-white/50 backdrop-blur-xl hover:bg-white/70 transition-colors"
            >
              Create account
              <ArrowRight size={16} strokeWidth={2.5} />
            </Link>
            <Link
              to="/how-it-works"
              className="w-full sm:w-auto text-sm text-[#71717a] hover:text-[#0a0a0a] transition-colors px-8 py-3 rounded-full border border-[#c5c5cb] bg-white/35 backdrop-blur-xl hover:bg-white/55"
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
      </main>

      <CookieConsent />
    </div>
  );
};

export default FundsExplainedPage;
