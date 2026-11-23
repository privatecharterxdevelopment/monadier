/**
 * Profit-trail record store.
 * Local JSON is a fast cache; Supabase is source of truth so Railway redeploys
 * do not wipe peak/armed stop and leave winners unprotected.
 */
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
const pendingKeys = new Set<string>();
const deletedKeys = new Set<string>();
/** After missing-table / hard errors, keep local file only until next boot. */
let supabaseWriteDisabled = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, DynamicTrailRecord>;
    if (parsed && typeof parsed === 'object') records = parsed;
  } catch (err) {
    logger.warn('HL profit trail local state load failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function hydrateFromSupabase(): Promise<void> {
  ensureLoaded();
  try {
    const { data, error } = await supabase.from('hl_profit_trail_state').select('lock_key, record');
    if (error) {
      logger.warn('HL profit trail supabase load failed', { error: error.message });
      return;
    }
    for (const row of data ?? []) {
      const key = String(row.lock_key || '');
      const rec = row.record as DynamicTrailRecord | null;
      if (!key || !rec || typeof rec !== 'object') continue;
      records[key] = rec;
    }
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(records, null, 0), 'utf8');
    } catch {
      /* local cache optional */
    }
    logger.info('HL profit trail state hydrated from supabase', {
      keys: Object.keys(records).length,
    });
  } catch (err) {
    logger.warn('HL profit trail supabase hydrate error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

let hydratePromise: Promise<void> | null = null;

/** Call once at boot — await before first monitor cycle if possible. */
export function ensureProfitTrailStateHydrated(): Promise<void> {
  if (!hydratePromise) hydratePromise = hydrateFromSupabase();
  return hydratePromise;
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(records, null, 0), 'utf8');
    } catch (err) {
      logger.warn('HL profit trail local state save failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    void flushToSupabase();
  }, 400);
}

async function flushToSupabase(): Promise<void> {
  if (supabaseWriteDisabled) {
    pendingKeys.clear();
    deletedKeys.clear();
    return;
  }
  const upserts = [...pendingKeys];
  const deletes = [...deletedKeys];
  pendingKeys.clear();
  deletedKeys.clear();

  if (upserts.length > 0) {
    const rows = upserts
      .filter((k) => records[k])
      .map((k) => ({
        lock_key: k,
        record: records[k],
        updated_at: new Date().toISOString(),
      }));
    if (rows.length > 0) {
      const { error } = await supabase.from('hl_profit_trail_state').upsert(rows, {
        onConflict: 'lock_key',
      });
      if (error) {
        const missing =
          /relation .* does not exist|Could not find the table/i.test(error.message);
        logger.warn('HL profit trail supabase upsert failed', { error: error.message });
        if (missing) {
          supabaseWriteDisabled = true;
        } else {
          for (const k of upserts) pendingKeys.add(k);
        }
      }
    }
  }

  if (deletes.length > 0 && !supabaseWriteDisabled) {
    const { error } = await supabase.from('hl_profit_trail_state').delete().in('lock_key', deletes);
    if (error) {
      logger.warn('HL profit trail supabase delete failed', { error: error.message });
      for (const k of deletes) deletedKeys.add(k);
    }
  }
}

export function getDynamicTrailRecord(key: string): DynamicTrailRecord | undefined {
  ensureLoaded();
  return records[key];
}

export function setDynamicTrailRecord(key: string, rec: DynamicTrailRecord): void {
  ensureLoaded();
  records[key] = rec;
  pendingKeys.add(key);
  deletedKeys.delete(key);
  scheduleSave();
}

export function deleteDynamicTrailRecord(key: string): void {
  ensureLoaded();
  if (!(key in records) && !pendingKeys.has(key)) return;
  delete records[key];
  pendingKeys.delete(key);
  deletedKeys.add(key);
  scheduleSave();
}

/** @deprecated use getDynamicTrailRecord */
export function getProfitTrailRecord(key: string): DynamicTrailRecord | undefined {
  return getDynamicTrailRecord(key);
}

/** @deprecated use deleteDynamicTrailRecord */
export function deleteProfitTrailRecord(key: string): void {
  deleteDynamicTrailRecord(key);
}
