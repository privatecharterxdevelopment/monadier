import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { DynamicTrailRecord } from './dynamicTrailingStop';

const STATE_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(STATE_DIR, 'hl-profit-trail-state.json');

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

let records: Record<string, DynamicTrailRecord> = {};
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let dbBootstrapped = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, DynamicTrailRecord>;
    if (parsed && typeof parsed === 'object') records = parsed;
  } catch (err) {
    logger.warn('HL profit trail state load failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function ratchetStop(
  direction: 'LONG' | 'SHORT',
  current: number | null,
  candidate: number
): number {
  if (current == null) return candidate;
  return direction === 'LONG' ? Math.max(current, candidate) : Math.min(current, candidate);
}

function mergeTrailRecords(a: DynamicTrailRecord, b: DynamicTrailRecord): DynamicTrailRecord {
  const direction = a.direction;
  const highestPriceSinceEntry =
    direction === 'LONG'
      ? Math.max(a.highestPriceSinceEntry, b.highestPriceSinceEntry)
      : Math.min(a.highestPriceSinceEntry, b.highestPriceSinceEntry);
  const highestPnlSinceEntry = Math.max(a.highestPnlSinceEntry, b.highestPnlSinceEntry);
  const phase =
    a.phase === 'trailing' || b.phase === 'trailing'
      ? 'trailing'
      : a.phase === 'profit_lock' || b.phase === 'profit_lock'
        ? 'profit_lock'
        : a.phase === 'armed' || b.phase === 'armed'
          ? 'armed'
          : 'idle';
  const trailArmedAt = Math.min(
    a.trailArmedAt ?? Number.POSITIVE_INFINITY,
    b.trailArmedAt ?? Number.POSITIVE_INFINITY
  );
  let currentTrailStop = a.currentTrailStop;
  if (b.currentTrailStop != null) {
    currentTrailStop = ratchetStop(direction, currentTrailStop, b.currentTrailStop);
  }
  const profitA = a.profitSinceAt;
  const profitB = b.profitSinceAt;
  const profitSinceAt =
    profitA != null && profitB != null
      ? Math.min(profitA, profitB)
      : profitA ?? profitB ?? null;
  return {
    ...a,
    phase,
    highestPriceSinceEntry,
    highestPnlSinceEntry,
    maxRunup: Math.max(a.maxRunup, b.maxRunup),
    currentTrailStop,
    trailArmedAt: Number.isFinite(trailArmedAt) ? trailArmedAt : null,
    profitSinceAt,
    timeInProfitMs: Math.max(a.timeInProfitMs, b.timeInProfitMs),
  };
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(records, null, 0), 'utf8');
    } catch (err) {
      logger.warn('HL profit trail state save failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, 400);
}

async function persistToDb(key: string, rec: DynamicTrailRecord): Promise<void> {
  const colon = key.indexOf(':');
  if (colon <= 0) return;
  const userWallet = key.slice(0, colon);
  const coin = key.slice(colon + 1);
  const { error } = await supabase.from('hl_profit_trail_state').upsert(
    {
      position_key: key,
      user_wallet: userWallet,
      coin,
      record: rec,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'position_key' }
  );
  if (error) {
    logger.warn('HL profit trail DB persist failed', { key, error: error.message });
  }
}

/** Load durable peaks from Supabase (survives redeploy). Call once at startup. */
export async function bootstrapProfitTrailStateFromDb(): Promise<void> {
  if (dbBootstrapped) return;
  dbBootstrapped = true;
  ensureLoaded();
  try {
    const { data, error } = await supabase
      .from('hl_profit_trail_state')
      .select('position_key, record');
    if (error) {
      logger.warn('HL profit trail DB bootstrap failed', { error: error.message });
      return;
    }
    let merged = 0;
    for (const row of data ?? []) {
      const key = row.position_key as string;
      const rec = row.record as DynamicTrailRecord;
      if (!key || !rec?.direction) continue;
      const prev = records[key];
      records[key] = prev ? mergeTrailRecords(prev, rec) : rec;
      merged += 1;
    }
    if (merged > 0) {
      logger.info('HL profit trail state restored from DB', { rows: merged });
      scheduleSave();
    }
  } catch (err) {
    logger.warn('HL profit trail DB bootstrap error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function getDynamicTrailRecord(key: string): DynamicTrailRecord | undefined {
  ensureLoaded();
  return records[key];
}

export function setDynamicTrailRecord(key: string, rec: DynamicTrailRecord): void {
  ensureLoaded();
  records[key] = rec;
  scheduleSave();
  void persistToDb(key, rec);
}

export function deleteDynamicTrailRecord(key: string): void {
  ensureLoaded();
  if (!(key in records)) return;
  delete records[key];
  scheduleSave();
  void supabase.from('hl_profit_trail_state').delete().eq('position_key', key).then(({ error }) => {
    if (error) {
      logger.warn('HL profit trail DB delete failed', { key, error: error.message });
    }
  });
}

/** @deprecated use getDynamicTrailRecord */
export function getProfitTrailRecord(key: string): DynamicTrailRecord | undefined {
  return getDynamicTrailRecord(key);
}

/** @deprecated use deleteDynamicTrailRecord */
export function deleteProfitTrailRecord(key: string): void {
  deleteDynamicTrailRecord(key);
}
