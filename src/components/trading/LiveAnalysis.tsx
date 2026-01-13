import React, { useState, useEffect } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, RefreshCw, BarChart3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useChainId } from 'wagmi';

interface Analysis {
  id: string;
  token_symbol: string;
  signal: 'LONG' | 'SHORT' | 'HOLD';
  confidence: number;
  rsi: number;
  macd_signal: string;
  volume_spike: boolean;
  trend: string;
  pattern: string | null;
  price_change_24h: number;
  recommendation: string;
  updated_at: string;
}

export default function LiveAnalysis() {
  const chainId = useChainId();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Map chain names for display
  const chainName = chainId === 42161 ? 'Arbitrum' : chainId === 8453 ? 'Base' : 'Unknown';

  const fetchAnalysis = async () => {
    try {
      // Fetch analysis for current chain (or all active chains if not connected)
      const targetChain = chainId || 42161; // Default to Arbitrum

      const { data, error } = await supabase
        .from('bot_analysis')
        .select('*')
        .eq('chain_id', targetChain)
        .order('updated_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        setAnalyses(data);
        setLastUpdate(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch analysis:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
    // Poll every 10 seconds
    const interval = setInterval(fetchAnalysis, 10000);
    return () => clearInterval(interval);
  }, [chainId]);

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'LONG': return 'text-green-400';
      case 'SHORT': return 'text-red-400';
      default: return 'text-yellow-400';
    }
  };

  const getSignalBg = (signal: string) => {
    switch (signal) {
      case 'LONG': return 'bg-green-500/10 border-green-500/20';
      case 'SHORT': return 'bg-red-500/10 border-red-500/20';
      default: return 'bg-yellow-500/10 border-yellow-500/20';
    }
  };

  const getSignalIcon = (signal: string) => {
    switch (signal) {
      case 'LONG': return <TrendingUp className="w-4 h-4" />;
      case 'SHORT': return <TrendingDown className="w-4 h-4" />;
      default: return <Minus className="w-4 h-4" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-400';
    if (confidence >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getRsiColor = (rsi: number) => {
    if (rsi >= 70) return 'text-red-400'; // Overbought
    if (rsi <= 30) return 'text-green-400'; // Oversold
    return 'text-zinc-400';
  };

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-center gap-2 text-zinc-500">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Loading analysis...</span>
        </div>
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-white" />
          <h3 className="font-medium text-white">Live Bot Analysis</h3>
        </div>
        <p className="text-zinc-500 text-sm">No analysis data yet. Bot is warming up...</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-white" />
          <h3 className="font-medium text-white">Live Bot Analysis</h3>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            chainId === 42161 ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
          }`}>
            {chainName}
          </span>
          <span className="flex items-center gap-1 text-xs text-green-400">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            Live
          </span>
        </div>
        {lastUpdate && (
          <span className="text-xs text-zinc-500">
            Updated {Math.round((Date.now() - lastUpdate.getTime()) / 1000)}s ago
          </span>
        )}
      </div>

      <div className="space-y-3">
        {analyses.map((analysis) => (
          <div
            key={analysis.id}
            className={`border rounded-lg p-4 ${getSignalBg(analysis.signal)}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{analysis.token_symbol}</span>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getSignalColor(analysis.signal)}`}>
                  {getSignalIcon(analysis.signal)}
                  {analysis.signal}
                </span>
              </div>
              <span className={`text-lg font-bold ${getConfidenceColor(analysis.confidence)}`}>
                {analysis.confidence}%
              </span>
            </div>

            {/* Indicators Grid */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="bg-black/20 rounded p-2">
                <p className="text-[10px] text-zinc-500 uppercase">RSI</p>
                <p className={`text-sm font-medium ${getRsiColor(analysis.rsi)}`}>
                  {analysis.rsi?.toFixed(0) || '-'}
                </p>
              </div>
              <div className="bg-black/20 rounded p-2">
                <p className="text-[10px] text-zinc-500 uppercase">Trend</p>
                <p className="text-sm font-medium text-white truncate">
                  {analysis.trend || '-'}
                </p>
              </div>
              <div className="bg-black/20 rounded p-2">
                <p className="text-[10px] text-zinc-500 uppercase">Volume</p>
                <p className={`text-sm font-medium ${analysis.volume_spike ? 'text-green-400' : 'text-zinc-400'}`}>
                  {analysis.volume_spike ? 'Spike!' : 'Normal'}
                </p>
              </div>
              <div className="bg-black/20 rounded p-2">
                <p className="text-[10px] text-zinc-500 uppercase">Pattern</p>
                <p className="text-sm font-medium text-white truncate">
                  {analysis.pattern || '-'}
                </p>
              </div>
            </div>

            {/* Recommendation */}
            <div className="flex items-start gap-2 bg-black/20 rounded p-2">
              <BarChart3 className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-zinc-300">{analysis.recommendation}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
