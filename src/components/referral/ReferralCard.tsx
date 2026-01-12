import React, { useState, useEffect } from 'react';
import { Gift, Copy, Check, Users, DollarSign, Clock, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Bonus {
  id: string;
  amount_usd: number;
  bonus_type: 'referrer' | 'referred';
  status: string;
  wallet_address: string | null;
  created_at: string;
}

const ReferralCard: React.FC = () => {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [stats, setStats] = useState({
    totalReferrals: 0,
    pendingAmount: 0,
    paidAmount: 0
  });

  useEffect(() => {
    loadReferralData();
  }, []);

  const loadReferralData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get or generate referral code
      const { data: code, error } = await supabase
        .rpc('generate_referral_code', { p_user_id: user.id });

      if (!error && code) {
        setReferralCode(code);
      }

      // Get bonuses
      const { data: bonusData } = await supabase
        .from('referral_bonuses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (bonusData) {
        setBonuses(bonusData);

        // Calculate stats
        const pending = bonusData
          .filter(b => b.status === 'pending' || b.status === 'approved')
          .reduce((sum, b) => sum + b.amount_usd, 0);

        const paid = bonusData
          .filter(b => b.status === 'paid')
          .reduce((sum, b) => sum + b.amount_usd, 0);

        const referrals = bonusData.filter(b => b.bonus_type === 'referrer').length;

        setStats({
          totalReferrals: referrals,
          pendingAmount: pending,
          paidAmount: paid
        });
      }
    } catch (error) {
      console.error('Error loading referral data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!referralCode) return;
    const link = `${window.location.origin}/register?ref=${referralCode}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const referralLink = referralCode
    ? `${window.location.origin}/register?ref=${referralCode}`
    : '';

  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 border border-zinc-700 rounded-xl p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-zinc-700 rounded w-1/3 mb-4"></div>
          <div className="h-10 bg-zinc-700 rounded mb-4"></div>
          <div className="h-4 bg-zinc-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 border border-zinc-700 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
          <Gift className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h3 className="font-semibold text-white">Refer & Earn</h3>
          <p className="text-sm text-zinc-400">Give $5, Get $5 USDC</p>
        </div>
      </div>

      {/* Referral Link */}
      <div className="mb-4">
        <label className="block text-sm text-zinc-400 mb-2">Your Referral Link</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={referralLink}
            readOnly
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white text-sm font-mono truncate"
          />
          <button
            onClick={copyToClipboard}
            className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
              copied
                ? 'bg-green-500 text-white'
                : 'bg-accent text-black hover:bg-accent/90'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
          <Users className="w-4 h-4 text-zinc-400 mx-auto mb-1" />
          <p className="text-lg font-semibold text-white">{stats.totalReferrals}</p>
          <p className="text-xs text-zinc-500">Referrals</p>
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
          <Clock className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
          <p className="text-lg font-semibold text-white">${stats.pendingAmount.toFixed(0)}</p>
          <p className="text-xs text-zinc-500">Pending</p>
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
          <DollarSign className="w-4 h-4 text-green-400 mx-auto mb-1" />
          <p className="text-lg font-semibold text-white">${stats.paidAmount.toFixed(0)}</p>
          <p className="text-xs text-zinc-500">Received</p>
        </div>
      </div>

      {/* Pending Bonuses */}
      {bonuses.filter(b => b.status === 'pending').length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-zinc-300 mb-2">Pending Bonuses</h4>
          <div className="space-y-2">
            {bonuses
              .filter(b => b.status === 'pending')
              .map(bonus => (
                <div
                  key={bonus.id}
                  className="flex items-center justify-between p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                      <Gift className="w-4 h-4 text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        +${bonus.amount_usd.toFixed(0)} USDC
                      </p>
                      <p className="text-xs text-zinc-400">
                        {bonus.bonus_type === 'referred' ? 'Welcome Bonus' : 'Referral Reward'}
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                    Pending
                  </span>
                </div>
              ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Connect your wallet to receive USDC payouts
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="pt-4 border-t border-zinc-700">
        <p className="text-xs text-zinc-500">
          Share your link. When someone signs up, you both get <span className="text-accent font-medium">$5 USDC</span> sent to your wallet.
        </p>
      </div>
    </div>
  );
};

export default ReferralCard;
