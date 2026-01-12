import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, X, Clock, TrendingUp, TrendingDown, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PendingApproval {
  id: string;
  token_address: string;
  token_symbol: string;
  direction: 'LONG' | 'SHORT';
  amount_usdc: number;
  entry_price: number;
  confidence: number;
  risk_reward: number;
  analysis_summary: string;
  created_at: string;
  expires_at: string;
}

interface PendingApprovalCardProps {
  walletAddress: string;
}

const PendingApprovalCard: React.FC<PendingApprovalCardProps> = ({ walletAddress }) => {
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Fetch pending approval
  useEffect(() => {
    if (!walletAddress) {
      setPendingApproval(null);
      setIsLoading(false);
      return;
    }

    const walletLower = walletAddress.toLowerCase();

    const fetchPendingApproval = async () => {
      const { data, error } = await supabase
        .from('pending_trade_approvals')
        .select('*')
        .eq('wallet_address', walletLower)
        .eq('status', 'pending')
        .single();

      if (!error && data) {
        setPendingApproval(data);
      } else {
        setPendingApproval(null);
      }
      setIsLoading(false);
    };

    fetchPendingApproval();

    // Realtime subscription
    const channel = supabase
      .channel('pending-approval-detail')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pending_trade_approvals',
          filter: `wallet_address=eq.${walletLower}`
        },
        () => {
          fetchPendingApproval();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [walletAddress]);

  // Countdown timer
  useEffect(() => {
    if (!pendingApproval) {
      setTimeRemaining(0);
      return;
    }

    const updateTimer = () => {
      const expiresAt = new Date(pendingApproval.expires_at).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [pendingApproval]);

  const handleApprove = async () => {
    if (!pendingApproval) return;
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('pending_trade_approvals')
        .update({
          status: 'approved',
          responded_at: new Date().toISOString()
        })
        .eq('id', pendingApproval.id);

      if (error) throw error;
      setPendingApproval(null);
    } catch (err) {
      console.error('Failed to approve trade:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!pendingApproval) return;
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('pending_trade_approvals')
        .update({
          status: 'rejected',
          responded_at: new Date().toISOString()
        })
        .eq('id', pendingApproval.id);

      if (error) throw error;
      setPendingApproval(null);
    } catch (err) {
      console.error('Failed to reject trade:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading || !pendingApproval) return null;

  const isExpiringSoon = timeRemaining <= 60;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="bg-gradient-to-r from-accent/10 to-violet-500/10 border border-accent/30 rounded-xl p-4 mb-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-accent/20 rounded-lg">
              <Bell className="w-5 h-5 text-accent" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-white font-semibold">Trade Approval Required</h3>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                  isExpiringSoon ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  <Clock className="w-3 h-3" />
                  {formatTime(timeRemaining)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
                <div>
                  <p className="text-gray-500 text-xs">Token</p>
                  <p className="text-white font-medium">{pendingApproval.token_symbol}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Direction</p>
                  <p className={`font-medium flex items-center gap-1 ${
                    pendingApproval.direction === 'LONG' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {pendingApproval.direction === 'LONG' ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    {pendingApproval.direction}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Amount</p>
                  <p className="text-white font-medium">${pendingApproval.amount_usdc.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Confidence</p>
                  <p className="text-white font-medium">{pendingApproval.confidence}%</p>
                </div>
              </div>

              {pendingApproval.analysis_summary && (
                <p className="text-gray-400 text-sm mt-2">{pendingApproval.analysis_summary}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReject}
              disabled={isSubmitting}
              className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors disabled:opacity-50"
              title="Reject trade"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <X className="w-5 h-5" />}
            </button>
            <button
              onClick={handleApprove}
              disabled={isSubmitting}
              className="p-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors disabled:opacity-50"
              title="Approve trade"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PendingApprovalCard;
