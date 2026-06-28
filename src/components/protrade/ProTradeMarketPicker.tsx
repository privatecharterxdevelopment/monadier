import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Star } from 'lucide-react';
import type { HlMarket } from '../../lib/hyperliquid/markets';
import { fmtPct, fmtUsdSymbol } from '../../lib/hyperliquid/format';
import {
  loadFavoriteMarkets,
  loadRecentMarkets,
  recordRecentMarket,
  toggleFavoriteMarket,
} from '../../lib/hyperliquid/marketPrefs';

type Props = {
  coin: string;
  markets: HlMarket[];
  loading?: boolean;
  onCoinChange: (coin: string) => void;
  onClose?: () => void;
  variant?: 'hl' | 'legacy';
  resolveLabel?: (name: string) => string;
};

const ProTradeMarketPicker: React.FC<Props> = ({
  coin,
  markets,
  loading,
  onCoinChange,
  onClose,
  variant = 'legacy',
  resolveLabel,
}) => {
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => loadFavoriteMarkets());
  const [recents, setRecents] = useState<string[]>(() => loadRecentMarkets());
  const rootRef = useRef<HTMLDivElement>(null);

  const marketByName = useMemo(() => {
    const map = new Map<string, HlMarket>();
    for (const m of markets) {
      if (m?.name) map.set(m.name, m);
    }
    return map;
  }, [markets]);

  const marketNames = useMemo(() => new Set(marketByName.keys()), [marketByName]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter((m) => {
      const label = resolveLabel?.(m.name) ?? m.name;
      return m.name.toLowerCase().includes(q) || label.toLowerCase().includes(q);
    });
  }, [markets, query, resolveLabel]);

  const recentMarkets = useMemo(() => {
    if (query.trim()) return [];
    return recents
      .map((name) => marketByName.get(name))
      .filter((m): m is HlMarket => Boolean(m));
  }, [recents, marketByName, query]);

  const recentNames = useMemo(
    () => new Set(recentMarkets.map((m) => m.name)),
    [recentMarkets]
  );

  const marketsAfterRecents = useMemo(
    () => filtered.filter((m) => !recentNames.has(m.name)),
    [filtered, recentNames]
  );

  useEffect(() => {
    if (!onClose) return undefined;

    let armed = false;
    const arm = window.setTimeout(() => {
      armed = true;
    }, 120);

    const onDoc = (e: PointerEvent) => {
      if (!armed) return;
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };

    document.addEventListener('pointerdown', onDoc, true);
    return () => {
      window.clearTimeout(arm);
      document.removeEventListener('pointerdown', onDoc, true);
    };
  }, [onClose]);

  const select = (name: string) => {
    if (!marketNames.has(name)) return;
    onCoinChange(name);
    setRecents(recordRecentMarket(name));
    setQuery('');
  };

  const handleToggleFavorite = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(toggleFavoriteMarket(name));
  };

  const menuClass = variant === 'hl' ? 'hl-picker-menu' : 'term-pro-picker-menu';

  const renderRow = (m: HlMarket) => {
    const isFavorite = favorites.includes(m.name);
    const rowClass = variant === 'hl' ? 'hl-picker-row' : 'term-pro-picker-row';
    const onClass = coin === m.name ? (variant === 'hl' ? 'hl-picker-row--on' : 'term-pro-picker-row--on') : '';
    return (
      <button
        key={m.name}
        type="button"
        role="option"
        aria-selected={coin === m.name}
        className={`${rowClass} ${onClass}`}
        onClick={() => select(m.name)}
      >
        <span>{resolveLabel?.(m.name) ?? m.name}</span>
        <span>{fmtUsdSymbol(m.dayVolumeUsd ?? 0, 0)}</span>
        <span className={(m.change24hPct ?? 0) >= 0 ? 'hl-up' : 'hl-down'}>
          {fmtPct(m.change24hPct ?? 0)}
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => handleToggleFavorite(m.name, e)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleToggleFavorite(m.name, e as unknown as React.MouseEvent);
            }
          }}
          style={{ opacity: isFavorite ? 1 : 0.4 }}
        >
          <Star size={12} fill={isFavorite ? 'currentColor' : 'none'} />
        </span>
      </button>
    );
  };

  return (
    <div ref={rootRef}>
      {onClose ? (
        <button
          type="button"
          className="hl-picker-backdrop"
          aria-label="Close market picker"
          onClick={onClose}
        />
      ) : null}
      <div className={menuClass} role="listbox" aria-label="Markets">
        <div className={variant === 'hl' ? 'hl-picker-search' : 'term-pro-picker-search'}>
          <Search size={14} />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${markets.length || '…'} markets`}
            autoFocus
          />
        </div>
        <div className={variant === 'hl' ? 'hl-picker-list' : 'term-pro-picker-list'}>
          {loading && markets.length === 0 ? (
            <p className="hl-dock-empty">Loading markets…</p>
          ) : filtered.length === 0 ? (
            <p className="hl-dock-empty">No markets match</p>
          ) : (
            <>
              {recentMarkets.length > 0 ? (
                <>
                  <div className="hl-picker-section-label">Recent</div>
                  {recentMarkets.map((m) => renderRow(m))}
                  <div className="hl-picker-section-label">All markets</div>
                </>
              ) : null}
              {marketsAfterRecents.map((m) => renderRow(m))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProTradeMarketPicker;
