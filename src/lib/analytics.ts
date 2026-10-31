const CONSENT_KEY = 'cookieConsent';
const GA_SCRIPT_ID = 'hg-gtag';

export const GA_MEASUREMENT_ID = (
  (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_GA_MEASUREMENT_ID as string | undefined) ||
  ''
).trim();

type Gtag = (...args: unknown[]) => void;

function gtagFn(): Gtag | undefined {
  return (window as Window & { gtag?: Gtag }).gtag;
}

export function hasAnalyticsConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'accepted';
  } catch {
    return false;
  }
}

/** Enable GA4 after cookie consent. Script may already be in index.html (build-time ID). */
export function loadGoogleAnalytics(): void {
  const id = GA_MEASUREMENT_ID;
  if (!id || typeof window === 'undefined' || !hasAnalyticsConsent()) return;

  const w = window as Window & { dataLayer?: unknown[]; gtag?: Gtag };
  w.dataLayer = w.dataLayer || [];
  if (!w.gtag) {
    w.gtag = function gtag(...args: unknown[]) {
      w.dataLayer!.push(args);
    };
  }

  if (!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
    const script = document.createElement('script');
    script.id = GA_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
    w.gtag('js', new Date());
    w.gtag('config', id, { anonymize_ip: true });
  }

  gtagFn()?.('consent', 'update', { analytics_storage: 'granted' });
}
