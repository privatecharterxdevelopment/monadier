import { useEffect, useState } from 'react';

export type UserGeoTime = {
  timezone: string;
  country: string;
  city: string;
  source: 'ip' | 'browser' | 'utc';
};

const EMPTY: UserGeoTime = {
  timezone: 'UTC',
  country: '',
  city: '',
  source: 'utc',
};

export function useUserGeoTime(): UserGeoTime {
  const [geo, setGeo] = useState<UserGeoTime>(() => {
    if (typeof window === 'undefined') return EMPTY;
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return { timezone: browserTz || 'UTC', country: '', city: '', source: 'browser' };
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/geo');
        if (!res.ok) throw new Error('geo unavailable');
        const data = (await res.json()) as {
          timezone?: string;
          country?: string;
          city?: string;
          source?: string;
        };
        if (cancelled) return;
        const tz = data.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        setGeo({
          timezone: tz,
          country: data.country?.trim() ?? '',
          city: data.city?.trim() ?? '',
          source: data.source === 'ip' ? 'ip' : 'browser',
        });
      } catch {
        if (cancelled) return;
        setGeo({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          country: '',
          city: '',
          source: 'browser',
        });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return geo;
}

/** Tick every second for countdown UIs. */
export function useNowTicker(enabled = true): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!enabled) return undefined;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  return now;
}
