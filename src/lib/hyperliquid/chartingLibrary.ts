export const TV_LIBRARY_PATH = '/charting_library/';
export const TV_STANDALONE_SCRIPT = `${TV_LIBRARY_PATH}charting_library.standalone.js`;

declare global {
  interface Window {
    TradingView?: {
      widget: new (opts: Record<string, unknown>) => { remove: () => void };
    };
  }
}

let probePromise: Promise<boolean> | null = null;
let loadPromise: Promise<boolean> | null = null;

export function probeChartingLibraryAvailable(): Promise<boolean> {
  if (probePromise) return probePromise;

  probePromise = fetch(TV_STANDALONE_SCRIPT, { method: 'HEAD' })
    .then((res) => res.ok)
    .catch(() => false);

  return probePromise;
}

export function loadChartingLibrary(): Promise<boolean> {
  if (typeof window !== 'undefined' && window.TradingView?.widget) {
    return Promise.resolve(true);
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    const finish = (ok: boolean) => resolve(ok);

    const existing = document.getElementById('tv-charting-library-script');
    if (existing) {
      existing.addEventListener('load', () => finish(Boolean(window.TradingView?.widget)), {
        once: true,
      });
      existing.addEventListener('error', () => finish(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'tv-charting-library-script';
    script.src = TV_STANDALONE_SCRIPT;
    script.async = true;
    script.onload = () => finish(Boolean(window.TradingView?.widget));
    script.onerror = () => finish(false);
    document.head.appendChild(script);
  });

  return loadPromise;
}
