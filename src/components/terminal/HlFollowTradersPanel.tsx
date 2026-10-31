import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Plus, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  MAX_HL_FOLLOWS,
  addHlFollowedTrader,
  fetchHlFollowedTraders,
  hypurrScanAddressUrl,
  isHlFollowWallet,
  removeHlFollowedTrader,
  searchHlTraders,
  truncateHlWallet,
  type HlFollowedTrader,
  type HlTraderSearchHit,
} from '../../lib/hlFollowedTraders';

const HlFollowTradersPanel: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<HlTraderSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [list, setList] = useState<HlFollowedTrader[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busyWallet, setBusyWallet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);

  const reload = useCallback(async () => {
    if (!user?.id) {
      setList([]);
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    try {
      setList(await fetchHlFollowedTraders());
    } finally {
      setLoadingList(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    const seq = ++seqRef.current;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void searchHlTraders(q)
        .then((rows) => {
          if (seq !== seqRef.current) return;
          setHits(rows);
          setError(null);
        })
        .catch((err) => {
          if (seq !== seqRef.current) return;
          setHits([]);
          setError(err instanceof Error ? err.message : t('profile.notifications.followSearchFailed'));
        })
        .finally(() => {
          if (seq === seqRef.current) setSearching(false);
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, t]);

  const addHit = async (hit: HlTraderSearchHit) => {
    if (!user?.id || busyWallet) return;
    setBusyWallet(hit.wallet);
    setError(null);
    try {
      const row = await addHlFollowedTrader({
        wallet: hit.wallet,
        displayName: hit.displayName,
      });
      setList((prev) => [row, ...prev.filter((p) => p.wallet !== row.wallet)]);
      setQuery('');
      setHits([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profile.notifications.followAddFailed'));
    } finally {
      setBusyWallet(null);
    }
  };

  const addFromQuery = async () => {
    const q = query.trim();
    if (!isHlFollowWallet(q)) return;
    await addHit({ wallet: q.toLowerCase(), displayName: null, accountValueUsd: null });
  };

  const removeRow = async (row: HlFollowedTrader) => {
    if (busyWallet) return;
    setBusyWallet(row.wallet);
    setError(null);
    try {
      await removeHlFollowedTrader(row.id);
      setList((prev) => prev.filter((p) => p.id !== row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profile.notifications.followRemoveFailed'));
    } finally {
      setBusyWallet(null);
    }
  };

  const atLimit = list.length >= MAX_HL_FOLLOWS;
  const followed = new Set(list.map((r) => r.wallet));

  return (
    <div className="term-profile-follow">
      <p className="term-profile-notify-email-title">{t('profile.notifications.followTitle')}</p>
      <p className="term-profile-muted term-profile-notify-email-desc">
        {t('profile.notifications.followDesc')}
      </p>

      <div className="term-profile-follow-search">
        <div className="term-profile-follow-input-wrap">
          <Search size={14} className="term-profile-follow-search-icon" aria-hidden />
          <input
            className="term-profile-input term-profile-follow-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('profile.notifications.followPlaceholder')}
            disabled={!user}
            autoComplete="off"
            spellCheck={false}
          />
          {searching ? <Loader2 size={14} className="animate-spin term-profile-follow-spin" /> : null}
        </div>
        {isHlFollowWallet(query) ? (
          <button
            type="button"
            className="term-btn-sm"
            disabled={!user || atLimit || Boolean(busyWallet)}
            onClick={() => void addFromQuery()}
          >
            <Plus size={14} /> {t('profile.notifications.followAdd')}
          </button>
        ) : null}
      </div>

      {hits.length > 0 ? (
        <ul className="term-profile-follow-hits">
          {hits.map((hit) => {
            const already = followed.has(hit.wallet);
            const label = hit.displayName || truncateHlWallet(hit.wallet);
            return (
              <li key={hit.wallet}>
                <div className="term-profile-follow-hit-meta">
                  <span className="term-profile-follow-name">{label}</span>
                  <code>{truncateHlWallet(hit.wallet)}</code>
                </div>
                <button
                  type="button"
                  className="term-btn-sm"
                  disabled={!user || atLimit || already || Boolean(busyWallet)}
                  onClick={() => void addHit(hit)}
                >
                  {busyWallet === hit.wallet ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : already ? (
                    t('profile.notifications.followAdded')
                  ) : (
                    t('profile.notifications.followAdd')
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {loadingList ? (
        <p className="term-profile-muted">{t('profile.notifications.followLoading')}</p>
      ) : list.length === 0 ? (
        <p className="term-profile-muted">{t('profile.notifications.followEmpty')}</p>
      ) : (
        <ul className="term-profile-follow-list">
          {list.map((row) => (
            <li key={row.id}>
              <div className="term-profile-follow-hit-meta">
                <span className="term-profile-follow-name">
                  {row.displayName || truncateHlWallet(row.wallet)}
                </span>
                <code>{truncateHlWallet(row.wallet)}</code>
              </div>
              <div className="term-profile-follow-actions">
                <a
                  href={hypurrScanAddressUrl(row.wallet)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="term-profile-follow-scan"
                  aria-label="HypurrScan"
                >
                  <ExternalLink size={13} />
                </a>
                <button
                  type="button"
                  className="term-profile-wallet-remove"
                  disabled={Boolean(busyWallet)}
                  onClick={() => void removeRow(row)}
                  aria-label={t('profile.notifications.followRemoveAria')}
                >
                  <X size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="term-profile-muted term-profile-follow-limit">
        {t('profile.notifications.followLimit', { count: list.length, max: MAX_HL_FOLLOWS })}
      </p>
      {error ? <p className="term-profile-err">{error}</p> : null}
    </div>
  );
};

export default HlFollowTradersPanel;
