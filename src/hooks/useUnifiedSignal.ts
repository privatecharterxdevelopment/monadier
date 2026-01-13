/**
 * React Hook for fetching Unified MTF Signals
 *
 * This hook provides the SAME signal data that the bot uses for trading,
 * ensuring frontend and bot are always synchronized.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  fetchUnifiedSignal,
  fetchTimeframeAnalysis,
  UnifiedSignal,
  TimeframeAnalysis,
  Timeframe,
  isSignalStrong
} from '../lib/signalService';

interface UseUnifiedSignalOptions {
  symbol?: string;
  timeframes?: Timeframe[];
  refreshInterval?: number; // ms
  autoRefresh?: boolean;
}

interface UseUnifiedSignalResult {
  signal: UnifiedSignal | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isStrong: boolean;
  lastUpdated: Date | null;
}

/**
 * Hook to fetch and auto-refresh unified MTF signal
 */
export function useUnifiedSignal(options: UseUnifiedSignalOptions = {}): UseUnifiedSignalResult {
  const {
    symbol = 'ETHUSDT',
    timeframes = ['1m', '5m', '15m', '1h'],
    refreshInterval = 30000, // 30 seconds default
    autoRefresh = true
  } = options;

  const [signal, setSignal] = useState<UnifiedSignal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchUnifiedSignal(symbol, timeframes);
      if (result) {
        setSignal(result);
        setLastUpdated(new Date());
      } else {
        setError('Failed to fetch signal');
      }
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [symbol, timeframes.join(',')]);

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refresh, refreshInterval, autoRefresh]);

  return {
    signal,
    isLoading,
    error,
    refresh,
    isStrong: signal ? isSignalStrong(signal) : false,
    lastUpdated
  };
}

interface UseTimeframeAnalysisResult {
  analysis: TimeframeAnalysis | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch single timeframe analysis
 */
export function useTimeframeAnalysis(
  symbol: string = 'ETHUSDT',
  timeframe: Timeframe = '15m',
  autoRefresh: boolean = true
): UseTimeframeAnalysisResult {
  const [analysis, setAnalysis] = useState<TimeframeAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchTimeframeAnalysis(symbol, timeframe);
      if (result) {
        setAnalysis(result);
      } else {
        setError('Failed to fetch analysis');
      }
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;

    // Adjust refresh rate based on timeframe
    const rates: Record<Timeframe, number> = {
      '1m': 15000,  // 15 seconds
      '5m': 30000,  // 30 seconds
      '15m': 60000, // 1 minute
      '1h': 120000, // 2 minutes
      '4h': 300000, // 5 minutes
    };

    const interval = setInterval(refresh, rates[timeframe]);
    return () => clearInterval(interval);
  }, [refresh, timeframe, autoRefresh]);

  return { analysis, isLoading, error, refresh };
}

/**
 * Hook to fetch all timeframes at once
 */
export function useAllTimeframes(
  symbol: string = 'ETHUSDT',
  autoRefresh: boolean = true
) {
  const [analyses, setAnalyses] = useState<Record<Timeframe, TimeframeAnalysis | null>>({
    '1m': null,
    '5m': null,
    '15m': null,
    '1h': null,
    '4h': null
  });
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h'];

    const results = await Promise.all(
      timeframes.map(tf => fetchTimeframeAnalysis(symbol, tf))
    );

    const newAnalyses: Record<Timeframe, TimeframeAnalysis | null> = {
      '1m': null, '5m': null, '15m': null, '1h': null, '4h': null
    };

    timeframes.forEach((tf, i) => {
      newAnalyses[tf] = results[i];
    });

    setAnalyses(newAnalyses);
    setIsLoading(false);
  }, [symbol]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh, autoRefresh]);

  return { analyses, isLoading, refresh };
}
