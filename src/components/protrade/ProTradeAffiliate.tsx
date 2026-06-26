import React, { useCallback, useEffect, useState } from 'react';
import { BarChart2, Check, Copy, Gift, Loader2, Users, Wallet } from 'lucide-react';
import { buildReferralShareUrl } from '../../lib/referralCapture';
import { supabase } from '../../lib/supabase';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';

type AffiliateSummary = {
  total_referrals: number;
  qualified_referrals: number;
  active_traders_30d: number;
  pending_earnings: number;
  paid_earnings: number;
  lifetime_earnings: number;
  cpa_pending_usd: number;
  cpa_paid_usd: number;
  min_payout_usd: number;
  funnel?: {
    signups: number;
    qualified: number;
    trading: number;
    revenue_generated: number;
  };
};

type TopReferral = {
  label: string;
  profit_generated: number;
  your_earnings: number;
  trading_volume: number;
};

type AffiliateReferral = {
  id: string;
  referred_id: string;
  status: string;
  qualification_state?: string;
  qualified_at: string | null;
  created_at: string;
  referred_email: string | null;
  referred_label?: string | null;
  profitable_trades: number;
  profit_generated: number;
  monadier_fees_generated: number;
  your_earnings: number;
  trading_volume: number;
  fraud_flag?: boolean;
};

type EarningsRow = {
  id: string;
  created_at: string;
  trade_id: string | null;
  profit_usd: number;
  success_fee_usd: number;
  platform_success_fee_pct?: number;
  referral_share_usd: number;
  referral_share_pct: number;
  referrer_wallet_address?: string | null;
  status: string;
  paid_at: string | null;
  coin: string | null;
};

type AffiliateDashboard = {
  referral_code: string | null;
  summary: AffiliateSummary;
  top_referrals?: TopReferral[];
  referrals: AffiliateReferral[];
  earnings_history: EarningsRow[];
};

type Props = {
  onRequireSignIn?: (reason: string) => void;
};

function maskEmail(email: string | null): string {
  if (!email) return 'Referred user';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const head = local.slice(0, 2);
  return `${head}***@${domain}`;
}

function referralStatusLabel(row: AffiliateReferral): string {
  if (row.qualification_state === 'qualified') return 'Qualified';
  if (row.qualification_state) {
    return row.qualification_state.replace(/_/g, ' ');
  }
  if (row.qualified_at) return 'Qualified';
  if (row.status === 'expired') return 'Expired';
  return 'Pending';
}

function earningStatusLabel(status: string): string {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'scheduled':
      return 'Scheduled';
    case 'processing':
      return 'Processing';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Pending';
  }
}

function earningStatusClass(status: string): string {
  if (status === 'paid') return 'paid';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  if (status === 'scheduled' || status === 'processing') return 'scheduled';
  return 'pending';
}

function AffiliateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="hl-meta-page-shell hl-affiliate-page">
      <div className="hl-meta-page hl-affiliate">
        <div className="hl-meta-canvas">{children}</div>
      </div>
    </div>
  );
}

const ProTradeAffiliate: React.FC<Props> = ({ onRequireSignIn }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AffiliateDashboard | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        onRequireSignIn?.('Sign in to view your affiliate dashboard.');
        setData(null);
        return;
      }

      const { data: dashboard, error: rpcErr } = await supabase.rpc('get_affiliate_dashboard', {
        p_user_id: user.id,
      });

      if (rpcErr) throw rpcErr;

      let payload = dashboard as AffiliateDashboard;
      if (!payload?.referral_code) {
        const { data: code } = await supabase.rpc('generate_referral_code', {
          p_user_id: user.id,
        });
        if (code) {
          payload = { ...payload, referral_code: code as string };
        }
      }
      setData(payload);
    } catch (err) {
      console.error(err);
      setError('Could not load affiliate dashboard.');
    } finally {
      setLoading(false);
    }
  }, [onRequireSignIn]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyLink = async () => {
    if (!data?.referral_code) return;
    const link = buildReferralShareUrl(data.referral_code);
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <AffiliateShell>
        <div className="hl-affiliate-loading">
          <Loader2 size={18} className="animate-spin" aria-hidden />
          <span>Loading referral dashboard…</span>
        </div>
      </AffiliateShell>
    );
  }

  if (!data && !error) {
    return (
      <AffiliateShell>
        <section className="hl-studio-card">
          <header className="hl-studio-card__head">
            <Gift size={18} aria-hidden />
            <span>Referral program</span>
          </header>
          <div className="hl-studio-card__body hl-studio-card__body--center">
            <p>Sign in to get your referral link and track earnings.</p>
            <button
              type="button"
              className="hl-affiliate-copy"
              onClick={() => onRequireSignIn?.('Sign in to open the affiliate dashboard.')}
            >
              Sign in
            </button>
          </div>
        </section>
      </AffiliateShell>
    );
  }

  if (error) {
    return (
      <AffiliateShell>
        <section className="hl-studio-card">
          <div className="hl-studio-card__body hl-studio-card__body--center">
            <p className="hl-dock-empty">{error}</p>
          </div>
        </section>
      </AffiliateShell>
    );
  }

  const summary = data?.summary;
  const referrals = data?.referrals ?? [];
  const topReferrals = data?.top_referrals ?? [];
  const history = data?.earnings_history ?? [];
  const referralLink = data?.referral_code ? buildReferralShareUrl(data.referral_code) : null;

  return (
    <AffiliateShell>
      <section className="hl-studio-card">
        <header className="hl-studio-card__head hl-studio-card__head--split">
          <div className="hl-studio-card__head-text">
            <Gift size={18} aria-hidden />
            <div>
              <h1 className="hl-studio-card__title">Referral program</h1>
              <p className="hl-studio-card__sub">
                2% of referrals&apos; profitable bot trade profits · paid monthly
              </p>
            </div>
          </div>
          {referralLink ? (
            <div className="hl-affiliate-head-tools">
              <code className="hl-affiliate-link">{referralLink}</code>
              <button type="button" className="hl-affiliate-copy" onClick={() => void copyLink()}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          ) : null}
        </header>
      </section>

      {summary ? (
        <section className="hl-studio-card">
          <header className="hl-studio-card__head">
            <BarChart2 size={18} aria-hidden />
            <span>Stats</span>
          </header>
          <div className="hl-studio-stat-grid" aria-label="Referral summary">
            <div className="hl-studio-stat hl-studio-stat--violet">
              <span className="hl-studio-stat__label">Referrals</span>
              <span className="hl-studio-stat__value">{summary.total_referrals}</span>
            </div>
            <div className="hl-studio-stat hl-studio-stat--sky">
              <span className="hl-studio-stat__label">Qualified</span>
              <span className="hl-studio-stat__value">{summary.qualified_referrals}</span>
            </div>
            <div className="hl-studio-stat hl-studio-stat--sky">
              <span className="hl-studio-stat__label">Active 30d</span>
              <span className="hl-studio-stat__value">{summary.active_traders_30d}</span>
            </div>
            <div className="hl-studio-stat hl-studio-stat--mint">
              <span className="hl-studio-stat__label">Pending</span>
              <span className="hl-studio-stat__value">{fmtUsdSymbol(summary.pending_earnings)}</span>
              <span className="hl-studio-stat__sub">Min {fmtUsdSymbol(summary.min_payout_usd)}</span>
            </div>
            <div className="hl-studio-stat hl-studio-stat--sky">
              <span className="hl-studio-stat__label">Paid</span>
              <span className="hl-studio-stat__value">{fmtUsdSymbol(summary.paid_earnings)}</span>
            </div>
            <div className="hl-studio-stat hl-studio-stat--slate">
              <span className="hl-studio-stat__label">Lifetime</span>
              <span className="hl-studio-stat__value">{fmtUsdSymbol(summary.lifetime_earnings)}</span>
            </div>
          </div>
        </section>
      ) : null}

      {topReferrals.length > 0 ? (
        <section className="hl-studio-card">
          <header className="hl-studio-card__head">
            <Users size={18} aria-hidden />
            <span>Top referrals</span>
          </header>
          <div className="hl-studio-card__body hl-studio-card__body--flush">
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Referral</th>
                  <th>Volume</th>
                  <th>Profit</th>
                  <th>Your earnings</th>
                </tr>
              </thead>
              <tbody>
                {topReferrals.map((row, idx) => (
                  <tr key={`${row.label}-${idx}`}>
                    <td>{row.label}</td>
                    <td>{fmtUsdSymbol(row.trading_volume)}</td>
                    <td>{fmtUsdSymbol(row.profit_generated)}</td>
                    <td>{fmtUsdSymbol(row.your_earnings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="hl-studio-card">
        <header className="hl-studio-card__head">
          <Users size={18} aria-hidden />
          <span>Referrals</span>
        </header>
        <div className="hl-studio-card__body hl-studio-card__body--flush">
          {referrals.length === 0 ? (
            <p className="hl-dock-empty">No referrals yet — share your link above.</p>
          ) : (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Referral</th>
                  <th>Qualified</th>
                  <th>Volume</th>
                  <th>Trades</th>
                  <th>Profit</th>
                  <th>Monadier fees</th>
                  <th>Your earnings</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((row) => (
                  <tr key={row.id}>
                    <td>{row.referred_label ?? maskEmail(row.referred_email)}</td>
                    <td>
                      {row.qualified_at
                        ? new Date(row.qualified_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td>{fmtUsdSymbol(row.trading_volume)}</td>
                    <td>{row.profitable_trades}</td>
                    <td>{fmtUsdSymbol(row.profit_generated)}</td>
                    <td>{fmtUsdSymbol(row.monadier_fees_generated)}</td>
                    <td>{fmtUsdSymbol(row.your_earnings)}</td>
                    <td>{referralStatusLabel(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="hl-studio-card">
        <header className="hl-studio-card__head">
          <Wallet size={18} aria-hidden />
          <span>Earnings history</span>
        </header>
        <div className="hl-studio-card__body hl-studio-card__body--flush">
          {history.length === 0 ? (
            <p className="hl-dock-empty">
              Earnings appear when qualified referrals close profitable bot trades.
            </p>
          ) : (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Trade</th>
                  <th>Profit</th>
                  <th>Monadier fee</th>
                  <th>Your share</th>
                  <th>Payout</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                    <td>{row.coin ? `${row.coin} close` : 'Bot close'}</td>
                    <td>{fmtUsdSymbol(row.profit_usd)}</td>
                    <td>{fmtUsdSymbol(row.success_fee_usd)}</td>
                    <td>{fmtUsdSymbol(row.referral_share_usd)}</td>
                    <td>
                      <span
                        className={`hl-affiliate-pill hl-affiliate-pill--${earningStatusClass(row.status)}`}
                      >
                        {earningStatusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </AffiliateShell>
  );
};

export default ProTradeAffiliate;
