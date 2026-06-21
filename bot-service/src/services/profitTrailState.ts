import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger';

export type ProfitTrailRecord = {
  locked: boolean;
  peakUsd: number;
  floorUsd: number;
  profitSinceAt?: number;
  openedAt?: number;
};

const STATE_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(STATE_DIR, 'hl-profit-trail-state.json');

let records: Record<string, ProfitTrailRecord> = {};
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, ProfitTrailRecord>;
    if (parsed && typeof parsed === 'object') records = parsed;
  } catch (err) {
    logger.warn('HL profit trail state load failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
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

export function getProfitTrailRecord(key: string): ProfitTrailRecord | undefined {
  ensureLoaded();
  return records[key];
}

export function setProfitTrailRecord(key: string, rec: ProfitTrailRecord): void {
  ensureLoaded();
  records[key] = rec;
  scheduleSave();
}

export function deleteProfitTrailRecord(key: string): void {
  ensureLoaded();
  if (!(key in records)) return;
  delete records[key];
  scheduleSave();
}

export function hydrateProfitTrailMaps(
  key: string,
  maps: {
    locked: Map<string, boolean>;
    peak: Map<string, number>;
    floor: Map<string, number>;
    profitSince: Map<string, number>;
    openedAt: Map<string, number>;
  }
): void {
  const rec = getProfitTrailRecord(key);
  if (!rec?.locked) return;
  maps.locked.set(key, true);
  if (rec.peakUsd > 0) maps.peak.set(key, rec.peakUsd);
  if (rec.floorUsd > 0) maps.floor.set(key, rec.floorUsd);
  if (rec.profitSinceAt != null) maps.profitSince.set(key, rec.profitSinceAt);
  if (rec.openedAt != null) maps.openedAt.set(key, rec.openedAt);
}

export function persistProfitTrailMaps(
  key: string,
  maps: {
    locked: Map<string, boolean>;
    peak: Map<string, number>;
    floor: Map<string, number>;
    profitSince: Map<string, number>;
    openedAt: Map<string, number>;
  }
): void {
  if (!maps.locked.get(key)) {
    deleteProfitTrailRecord(key);
    return;
  }
  setProfitTrailRecord(key, {
    locked: true,
    peakUsd: maps.peak.get(key) ?? 0,
    floorUsd: maps.floor.get(key) ?? 0,
    profitSinceAt: maps.profitSince.get(key),
    openedAt: maps.openedAt.get(key),
  });
}
