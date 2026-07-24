/**
 * Decode HTML entities in API/RSS text (&apos; &#x2019; &amp; …).
 * Uses the browser DOM when available; falls back to common named/numeric entities.
 */
export function decodeHtmlEntities(input: string | null | undefined): string {
  if (!input) return '';
  const raw = String(input);
  if (!/[&](#|[a-zA-Z])/.test(raw)) return raw;

  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea');
    el.innerHTML = raw;
    return el.value;
  }

  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}
