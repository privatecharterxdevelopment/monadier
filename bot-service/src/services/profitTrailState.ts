import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger';
import type { DynamicTrailRecord } from './dynamicTrailingStop';

const STATE_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(STATE_DIR, 'hl-profit-trail-state.json');

let records: Record<string, DynamicTrailRecord> = {};
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

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

export function getDynamicTrailRecord(key: string): DynamicTrailRecord | undefined {
  ensureLoaded();
  return records[key];
}

export function setDynamicTrailRecord(key: string, rec: DynamicTrailRecord): void {
  ensureLoaded();
  records[key] = rec;
  scheduleSave();
}

export function deleteDynamicTrailRecord(key: string): void {
  ensureLoaded();
  if (!(key in records)) return;
  delete records[key];
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
