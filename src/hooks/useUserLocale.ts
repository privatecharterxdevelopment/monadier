import { useEffect, useMemo, useState } from 'react';

export type UserLocaleInfo = {
  city: string;
  region: string;
  country: string;
  timezone: string;
  loading: boolean;
};

const CACHE_KEY = 'monadier_user_locale_v1';

function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

async function fetchLocaleFromIp(): Promise<Omit<UserLocaleInfo, 'loading'>> {
  const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('locale fetch failed');
  const data = await res.json();
  return {
    city: data.city || '',
    region: data.region || data.region_code || '',
    country: data.country_name || data.country || '',
    timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function useUserLocale() {
  const [locale, setLocale] = useState<UserLocaleInfo>(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        return { ...JSON.parse(cached), loading: false };
      }
    } catch {
      /* ignore */
    }
    return {
      city: '',
      region: '',
      country: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      loading: true,
    };
  });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!locale.loading) return;
    let cancelled = false;
    fetchLocaleFromIp()
      .then((data) => {
        if (cancelled) return;
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        setLocale({ ...data, loading: false });
      })
      .catch(() => {
        if (!cancelled) {
          setLocale((prev) => ({ ...prev, loading: false }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locale.loading]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const formatted = useMemo(() => {
    const tz = locale.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    let localHour = now.getHours();
    try {
      const hourStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: 'numeric',
        hour12: false,
      }).format(now);
      localHour = parseInt(hourStr, 10) || localHour;
    } catch {
      /* use browser hour */
    }

    const dateLabel = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    }).format(now);

    const clockLabel = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(now);

    const timeLabel = `${dateLabel} · ${clockLabel}`;

    const locationParts = [locale.city, locale.region, locale.country].filter(Boolean);
    const locationLabel =
      locationParts.length > 0
        ? [...new Set(locationParts)].join(', ')
        : locale.loading
          ? 'Detecting location…'
          : 'Location unavailable';

    return {
      greeting: greetingForHour(localHour),
      dateLabel,
      clockLabel,
      timeLabel,
      locationLabel,
      timezone: tz,
    };
  }, [locale, now]);

  return { ...locale, ...formatted };
}
