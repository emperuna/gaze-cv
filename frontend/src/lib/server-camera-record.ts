import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rename, rm, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { validRunId } from './analysis-contract.ts';
import { AnalysisError, projectRoot } from './server-analysis.ts';
import { RevisionError, markAlert, newRecord } from './live-alerts.ts';
import type { AlertMark, LiveAlert, LiveSessionRecord } from './live-alerts.ts';

export const cameraRecordRoot = join(projectRoot, 'outputs', 'runs', 'camera');
export const MAX_RECORD_BYTES = 16 * 1024 * 1024;
export const MAX_STILL_BYTES = 200_000;

/** Every function takes an optional last argument: `root` overrides the storage folder (tests), `isActive` says whether the live worker owns a session. */
export interface RecordOptions { root?: string; isActive?: (id: string) => boolean; lockTimeoutMs?: number }
export interface RecordSummary { id: string; createdAt: string; endedAt: string | null; state: LiveSessionRecord['state']; seconds: number; seats: number; alerts: number; unmarked: number }

/** The 409 when the record lock stays held; a lock left by a crashed save is cleared after 30 s by marks, End and Resume. */
export const BUSY_MESSAGE = 'This session is busy saving. Try again in a moment.';
const ALERT_ID = /^alert-[1-9][0-9]{0,5}$/;

function folder(id: string, root: string): string {
  if (!validRunId(id)) throw new AnalysisError('Invalid session id.', 400);
  return join(root, id);
}
function checkAlertId(alertId: string) {
  if (!ALERT_ID.test(alertId)) throw new AnalysisError('Invalid alert id.', 400);
}
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

async function atomicWrite(file: string, data: string | Buffer) {
  const temporary = `${file}-${randomUUID()}.pending`;
  try {
    const handle = await open(temporary, 'wx');
    try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(() => {}); }
}

async function writeRecordFile(record: LiveSessionRecord, dir: string) {
  const json = JSON.stringify(record);
  if (Buffer.byteLength(json) > MAX_RECORD_BYTES) throw new AnalysisError('This session is too large to save.', 413);
  await atomicWrite(join(dir, 'session.json'), json);
}

/** One exclusive per-record lock shared by every writer; waits briefly (about 25 ms steps) before giving up with 409. */
async function withRecordLock<T>(dir: string, timeoutMs: number, fn: () => Promise<T>): Promise<T> {
  const lockPath = join(dir, 'session.lock');
  const deadline = Date.now() + timeoutMs;
  let lock;
  for (;;) {
    try { lock = await open(lockPath, 'wx'); break; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') throw new AnalysisError('Session not found.', 404);
      if (code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new AnalysisError(BUSY_MESSAGE, 409);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try { return await fn(); }
  finally { await lock.close(); await unlink(lockPath).catch(() => {}); }
}

/** Saves an existing record. It never creates the session folder, so a deleted session stays deleted (404). */
export async function saveRecord(record: LiveSessionRecord, { root = cameraRecordRoot, lockTimeoutMs = 1000 }: RecordOptions = {}): Promise<void> {
  const dir = folder(record.id, root);
  await withRecordLock(dir, lockTimeoutMs, () => writeRecordFile(record, dir));
}

/** Creates the session folder for a new record, then saves it. */
export async function saveNewRecord(record: LiveSessionRecord, options: RecordOptions = {}): Promise<void> {
  await mkdir(folder(record.id, options.root ?? cameraRecordRoot), { recursive: true });
  await saveRecord(record, options);
}

export async function createRecord(settings: LiveSessionRecord['settings'], options: RecordOptions = {}): Promise<LiveSessionRecord> {
  const record = newRecord(randomUUID(), settings, new Date());
  await saveNewRecord(record, options);
  return record;
}

/**
 * Reads a saved record under its lock and hands it to `take` before the lock is released, so no mark, End
 * or Delete can land between the read and the caller taking ownership (resume). 404 if it was deleted.
 */
export async function takeRecord(id: string, take: (record: LiveSessionRecord) => void,
  { root = cameraRecordRoot, lockTimeoutMs = 1000 }: RecordOptions = {}): Promise<void> {
  const dir = folder(id, root);
  await withRecordLock(dir, lockTimeoutMs, async () => { take(await readRecord(id, root)); });
}

async function readRecord(id: string, root: string): Promise<LiveSessionRecord> {
  const file = join(folder(id, root), 'session.json');
  let text: string;
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_RECORD_BYTES) throw new AnalysisError('This saved session cannot be opened.', 422);
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (missing(error)) throw new AnalysisError('Session not found.', 404);
    throw error;
  }
  let record: LiveSessionRecord;
  try { record = JSON.parse(text) as LiveSessionRecord; } catch { throw new AnalysisError('This saved session is damaged.', 422); }
  const isObject = (v: unknown) => typeof v === 'object' && v !== null;
  if (!isObject(record) || record.schemaVersion !== 1 || record.id !== id || typeof record.createdAt !== 'string' ||
      typeof record.lastTime !== 'number' || !isObject(record.settings) || !Array.isArray(record.settings.seats) ||
      !Array.isArray(record.alerts) || !record.alerts.every(isObject) || !Array.isArray(record.events))
    throw new AnalysisError('This saved session is damaged.', 422);
  return record;
}

/** A saved `monitoring` record the live worker does not own is reported as `interrupted`; the file itself is never rewritten here. */
export async function loadRecord(id: string, { root = cameraRecordRoot, isActive = () => false }: RecordOptions = {}): Promise<LiveSessionRecord> {
  const record = await readRecord(id, root);
  if (record.state === 'monitoring' && !isActive(id)) record.state = 'interrupted';
  return record;
}

export async function writeStill(recordId: string, alertId: string, jpeg: Buffer, { root = cameraRecordRoot }: RecordOptions = {}): Promise<string> {
  const dir = folder(recordId, root);
  checkAlertId(alertId);
  if (jpeg.length > MAX_STILL_BYTES) throw new AnalysisError('Still image is too large.', 413);
  if (jpeg.length < 3 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff) throw new AnalysisError('Still image must be a JPEG.', 400);
  // Only the stills folder is created: a deleted session folder is not brought back.
  try { await mkdir(join(dir, 'stills')); }
  catch (error) {
    if (missing(error)) throw new AnalysisError('Session not found.', 404);
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  await atomicWrite(join(dir, 'stills', `${alertId}.jpg`), jpeg);
  return `stills/${alertId}.jpg`;
}

export async function stillFile(recordId: string, alertId: string, { root = cameraRecordRoot }: RecordOptions = {}): Promise<string> {
  const dir = folder(recordId, root);
  checkAlertId(alertId);
  const file = join(dir, 'stills', `${alertId}.jpg`);
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_STILL_BYTES) throw new AnalysisError('Still image not found.', 404);
  } catch (error) {
    if (missing(error)) throw new AnalysisError('Still image not found.', 404);
    throw error;
  }
  return file;
}

export async function listRecords(options: RecordOptions = {}): Promise<RecordSummary[]> {
  const root = options.root ?? cameraRecordRoot;
  let names: string[];
  try { names = await readdir(root); } catch (error) { if (missing(error)) return []; throw error; }
  const summaries: RecordSummary[] = [];
  for (const name of names) {
    if (!validRunId(name)) continue;
    let record: LiveSessionRecord;
    try { record = await loadRecord(name, options); } catch { continue; }
    summaries.push({ id: record.id, createdAt: record.createdAt, endedAt: record.endedAt, state: record.state, seconds: record.lastTime,
      seats: record.settings.seats.length, alerts: record.alerts.length, unmarked: record.alerts.filter(a => a.mark === null).length });
  }
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** For sessions that are not live. A live session marks alerts on its in-memory record and saves through saveRecord. */
export async function updateAlertMark(recordId: string, alertId: string, mark: AlertMark, note: string, revision: number,
  { root = cameraRecordRoot, isActive = () => false, lockTimeoutMs = 1000 }: RecordOptions = {}): Promise<LiveAlert> {
  const dir = folder(recordId, root);
  checkAlertId(alertId);
  if (isActive(recordId)) throw new AnalysisError('This session is live. Mark the alert from the live dashboard.', 409);
  await removeStaleLock(recordId, { root });
  return withRecordLock(dir, lockTimeoutMs, async () => {
    // A resume may have taken the record while this waited for the lock.
    if (isActive(recordId)) throw new AnalysisError('This session is live. Mark the alert from the live dashboard.', 409);
    const record = await readRecord(recordId, root);
    if (!record.alerts.some(a => a.id === alertId)) throw new AnalysisError('Alert not found.', 404);
    let alert: LiveAlert;
    try { alert = markAlert(record, alertId, mark, note, revision, new Date()); }
    catch (error) {
      if (error instanceof RevisionError) throw new AnalysisError(error.message, 409);
      throw error;
    }
    await writeRecordFile(record, dir);
    return alert;
  });
}

export async function deleteRecord(recordId: string, { root = cameraRecordRoot, isActive = () => false }: RecordOptions = {}): Promise<void> {
  const dir = folder(recordId, root);
  if (isActive(recordId)) throw new AnalysisError('Stop monitoring before deleting this session.', 409);
  await rm(dir, { recursive: true, force: true });
}

/** Removes a `session.lock` left by a crashed save when it is older than `maxAgeMs`; a fresh lock is left alone. */
export async function removeStaleLock(recordId: string, { root = cameraRecordRoot }: RecordOptions = {}, maxAgeMs = 30_000): Promise<void> {
  const lockPath = join(folder(recordId, root), 'session.lock');
  try {
    if (Date.now() - (await stat(lockPath)).mtimeMs > maxAgeMs) await unlink(lockPath);
  } catch (error) { if (!missing(error)) throw error; }
}

/** End session for a record the live worker does not own (interrupted after a crash or Stop failure). Idempotent. */
export async function endSavedRecord(recordId: string, { root = cameraRecordRoot, isActive = () => false, lockTimeoutMs = 1000 }: RecordOptions = {}): Promise<LiveSessionRecord> {
  const dir = folder(recordId, root);
  if (isActive(recordId)) throw new AnalysisError('This session is live. Stop it from the live dashboard.', 409);
  await removeStaleLock(recordId, { root });
  return withRecordLock(dir, lockTimeoutMs, async () => {
    if (isActive(recordId)) throw new AnalysisError('This session is live. Stop it from the live dashboard.', 409);
    const record = await readRecord(recordId, root);
    if (record.state === 'ended') return record;
    record.state = 'ended';
    record.endedAt = new Date().toISOString();
    const segment = record.segments.at(-1);
    if (segment && segment.endSeconds === null) segment.endSeconds = record.lastTime;
    await writeRecordFile(record, dir);
    return record;
  });
}
