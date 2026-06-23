import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Gift, Loader2, Users } from 'lucide-react';
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
      <div className="hl-affiliate">
        <Loader2 size={22} className="animate-spin" style={{ margin: '48px auto' }} />
      </div>
    );
  }

  if (!data && !error) {
    return (
      <div className="hl-affiliate">
        <div className="hl-support-gate">
          <div className="hl-support-gate-icon" aria-hidden>
            <Gift size={28} />
          </div>
          <h1 className="hl-support-title">Affiliate program</h1>
          <p className="hl-support-lead">
            Sign in to get your referral link and track earnings from profitable bot trades.
          </p>
          <button
            type="button"
            className="hl-support-primary"
            onClick={() => onRequireSignIn?.('Sign in to open the affiliate dashboard.')}
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hl-affiliate">
        <p className="hl-affiliate-empty">{error}</p>
      </div>
    );
  }

  const summary = data?.summary;
  const referrals = data?.referrals ?? [];
  const topReferrals = data?.top_referrals ?? [];
  const history = data?.earnings_history ?? [];
  const referralLink = data?.referral_code ? buildReferralShareUrl(data.referral_code) : null;

  return (
    <div className="hl-affiliate">
      <header className="hl-affiliate-hero">
        <div className="hl-affiliate-hero-icon" aria-hidden>
          <Gift size={22} />
        </div>
        <div>
          <h1 className="hl-affiliate-title">Earn 2% from your referrals&apos; profitable bot trades</h1>
          <p className="hl-affiliate-lead">
            Invite friends to Monadier. Whenever your referrals close profitable bot trades, you earn
            2% of their profits. No MLM, no hidden conditions, no limits.
          </p>
        </div>
      </header>

      {referralLink ? (
        <div className="hl-affiliate-link-row">
          <code className="hl-affiliate-link">{referralLink}</code>
          <button type="button" className="hl-affiliate-copy" onClick={() => void copyLink()}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      ) : null}

      {summary ? (
        <div className="hl-affiliate-cards">
          <div className="hl-portfolio-card">
            <span className="hl-portfolio-card-label">Total referrals</span>
            <span className="hl-portfolio-card-value">{summary.total_referrals}</span>
          </div>
          <div className="hl-portfolio-card">
            <span className="hl-portfolio-card-label">Qualified referrals</span>
            <span className="hl-portfolio-card-value">{summary.qualified_referrals}</span>
          </div>
          <div className="hl-portfolio-card">
            <span className="hl-portfolio-card-label">Active traders (30d)</span>
            <span className="hl-portfolio-card-value">{summary.active_traders_30d}</span>
          </div>
          <div className="hl-portfolio-card hl-portfolio-card--accent">
            <span className="hl-portfolio-card-label">Pending earnings</span>
            <span className="hl-portfolio-card-value">{fmtUsdSymbol(summary.pending_earnings)}</span>
            <span className="hl-portfolio-card-sub">
              Min payout {fmtUsdSymbol(summary.min_payout_usd)} · monthly
            </span>
          </div>
          <div className="hl-portfolio-card">
            <span className="hl-portfolio-card-label">Paid earnings</span>
            <span className="hl-portfolio-card-value">{fmtUsdSymbol(summary.paid_earnings)}</span>
          </div>
          <div className="hl-portfolio-card">
            <span className="hl-portfolio-card-label">Lifetime earnings</span>
            <span className="hl-portfolio-card-value">{fmtUsdSymbol(summary.lifetime_earnings)}</span>
          </div>
        </div>
      ) : null}

      {summary?.funnel ? (
        <section className="hl-affiliate-section">
          <h2 className="hl-affiliate-section-title">Conversion funnel</h2>
          <div className="hl-affiliate-funnel">
            <div className="hl-affiliate-funnel-step">
              <span>Signups</span>
              <strong>{summary.funnel.signups}</strong>
            </div>
            <div className="hl-affiliate-funnel-step">
              <span>Qualified</span>
              <strong>{summary.funnel.qualified}</strong>
            </div>
            <div className="hl-affiliate-funnel-step">
              <span>Trading</span>
              <strong>{summary.funnel.trading}</strong>
            </div>
            <div className="hl-affiliate-funnel-step">
              <span>Revenue generated</span>
              <strong>{fmtUsdSymbol(summary.funnel.revenue_generated)}</strong>
            </div>
          </div>
        </section>
      ) : null}

      {topReferrals.length > 0 ? (
        <section className="hl-affiliate-section">
          <h2 className="hl-affiliate-section-title">Top referrals</h2>
          <div className="hl-affiliate-table-wrap">
            <table className="hl-affiliate-table">
              <thead>
                <tr>
                  <th>Referral</th>
                  <th>Volume</th>
                  <th>Profit generated</th>
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

      <section className="hl-affiliate-section">
        <h2 className="hl-affiliate-section-title">
          <Users size={16} aria-hidden />
          Referrals
        </h2>
        {referrals.length === 0 ? (
          <p className="hl-affiliate-empty">No referrals yet. Share your link to get started.</p>
        ) : (
          <div className="hl-affiliate-table-wrap">
            <table className="hl-affiliate-table">
              <thead>
                <tr>
                  <th>Referral</th>
                  <th>Qualified</th>
                  <th>Volume</th>
                  <th>Profitable trades</th>
                  <th>Profit generated</th>
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
          </div>
        )}
      </section>

      <section className="hl-affiliate-section">
        <h2 className="hl-affiliate-section-title">Earnings history</h2>
        {history.length === 0 ? (
          <p className="hl-affiliate-empty">
            Revenue share accrues when qualified referrals close profitable bot trades.
          </p>
        ) : (
          <div className="hl-affiliate-table-wrap">
            <table className="hl-affiliate-table">
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
                    <td>{row.coin ? `${row.coin} bot close` : 'Bot close'}</td>
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
          </div>
        )}
      </section>
    </div>
  );
};

export default ProTradeAffiliate;
