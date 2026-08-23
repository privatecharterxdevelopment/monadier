/**
 * Minimal candlestick PNG (no native deps) for Gemini Vision pre-trade checks.
 */
import zlib from 'zlib';
import type { Candle } from './signalEngine';

export type VisionChartTimeframe = '1m' | '5m' | '15m' | '1h' | '4h';

/** SHORT → 5m+15m. LONG → 15m+1h (+4h when HL_LONG_INCLUDE_4H is not false). */
export function visionTimeframesForDirection(
  direction: 'LONG' | 'SHORT'
): VisionChartTimeframe[] {
  if (direction === 'SHORT') return ['5m', '15m'];
  const include4h = process.env.HL_LONG_INCLUDE_4H !== 'false';
  return include4h ? ['15m', '1h', '4h'] : ['15m', '1h'];
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePngRGBA(width: number, height: number, rgba: Buffer): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter none
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function setPixel(rgba: Buffer, w: number, x: number, y: number, r: number, g: number, b: number): void {
  if (x < 0 || y < 0 || x >= w) return;
  const i = (y * w + x) * 4;
  if (i < 0 || i + 3 >= rgba.length) return;
  rgba[i] = r;
  rgba[i + 1] = g;
  rgba[i + 2] = b;
  rgba[i + 3] = 255;
}

function fillRect(
  rgba: Buffer,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number
): void {
  const xa = Math.max(0, Math.min(x0, x1));
  const xb = Math.min(w - 1, Math.max(x0, x1));
  const ya = Math.max(0, Math.min(y0, y1));
  const yb = Math.min(rgba.length / (w * 4) - 1, Math.max(y0, y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) setPixel(rgba, w, x, y, r, g, b);
  }
}

function vline(rgba: Buffer, w: number, x: number, y0: number, y1: number, r: number, g: number, b: number): void {
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  for (let y = ya; y <= yb; y++) setPixel(rgba, w, x, y, r, g, b);
}

/**
 * Render last N candles to a dark OHLC PNG for vision models.
 */
export function renderCandlestickPng(
  candles: Candle[],
  opts?: { width?: number; height?: number; title?: string }
): Buffer {
  const width = opts?.width ?? 640;
  const height = opts?.height ?? 360;
  const padL = 12;
  const padR = 12;
  const padT = 28;
  const padB = 12;
  const rgba = Buffer.alloc(width * height * 4, 0);

  // background
  fillRect(rgba, width, 0, 0, width - 1, height - 1, 12, 14, 18);

  const closed = candles.length > 1 ? candles.slice(0, -1) : candles;
  const window = closed.slice(-48);
  if (window.length < 2) {
    return encodePngRGBA(width, height, rgba);
  }

  let min = Infinity;
  let max = -Infinity;
  for (const c of window) {
    min = Math.min(min, c.low);
    max = Math.max(max, c.high);
  }
  if (!(max > min)) {
    max = min + 1;
  }
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const slot = plotW / window.length;

  const yFor = (price: number) =>
    padT + Math.round(((max - price) / (max - min)) * (plotH - 1));

  // grid
  for (let g = 0; g < 4; g++) {
    const y = padT + Math.round((g / 3) * (plotH - 1));
    for (let x = padL; x < width - padR; x += 2) setPixel(rgba, width, x, y, 40, 44, 52);
  }

  for (let i = 0; i < window.length; i++) {
    const c = window[i];
    const cx = Math.round(padL + i * slot + slot / 2);
    const yO = yFor(c.open);
    const yC = yFor(c.close);
    const yH = yFor(c.high);
    const yL = yFor(c.low);
    const up = c.close >= c.open;
    const r = up ? 34 : 220;
    const g = up ? 197 : 68;
    const b = up ? 94 : 68;
    vline(rgba, width, cx, yH, yL, r, g, b);
    const bodyTop = Math.min(yO, yC);
    const bodyBot = Math.max(yO, yC);
    const half = Math.max(1, Math.floor(slot * 0.28));
    fillRect(rgba, width, cx - half, bodyTop, cx + half, Math.max(bodyBot, bodyTop + 1), r, g, b);
  }

  // last close marker
  const last = window[window.length - 1];
  const ly = yFor(last.close);
  for (let x = padL; x < width - padR; x += 3) setPixel(rgba, width, x, ly, 255, 200, 60);

  return encodePngRGBA(width, height, rgba);
}

export type ChartVisionShot = {
  timeframe: VisionChartTimeframe;
  mimeType: 'image/png';
  base64: string;
  candleCount: number;
};
