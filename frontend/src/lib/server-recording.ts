import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { validRunId } from './analysis-contract.ts';
import type { CameraSettings, LiveEvent, LiveSeatState } from './camera-contract.ts';
import { validateExamDetails } from './exam-details.ts';
import { newRecord } from './live-alerts.ts';
import type { LiveSessionRecord } from './live-alerts.ts';
import { parseRange } from './media-range.ts';
import { acquireProcessingSlot } from './processing-slot.ts';
import { validateReviewSettings } from './review-contract.ts';
import type { ReviewSeat } from './review-contract.ts';
import { AnalysisError, backendStatus, projectRoot, python, pythonEnvironment } from './server-analysis.ts';
import { cameraRecordRoot, deleteRecord, loadRecord, saveNewRecord, saveRecord } from './server-camera-record.ts';
import type { RecordOptions } from './server-camera-record.ts';
import { discardDraft, draftVideo } from './server-recording-files.ts';
import { recordFrame } from './server-live-session.ts';

/** Recording events join the latest alert of their seat and direction only within this many seconds. */
export const GROUP_WITHIN_SECONDS = 30;
/** Frames are evenly spaced in a recording, so the gap limit is fixed. */
export const RECORDING_MAX_GAP = 1;
const SAVE_INTERVAL_MS = 5_000;
const SUGGEST_TIMEOUT_MS = 120_000;
const FINAL_SAVE_ATTEMPTS = 3;
const VIDEO_TYPES: Record<string, string> = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/x-m4v' };

export type RecordingMode = 'suggest' | 'review';
/** `root`/`lockTimeoutMs` reach the record functions; `launch` replaces the Python worker and `saveIntervalMs` the 5 s save pace (tests). */
export interface RecordingOptions {
  root?: string; lockTimeoutMs?: number; now?: () => Date; saveIntervalMs?: number;
  launch?: (mode: RecordingMode, input: string, settings: CameraSettings) => Promise<ChildProcessWithoutNullStreams>;
}
interface DraftMarker { filename: string; createdAt: string; settings?: CameraSettings; durationSeconds?: number; width?: number; height?: number }
interface RecordingJob { record: LiveSessionRecord; child: ChildProcessWithoutNullStreams; cancelled: boolean; finished: Promise<void> }

/** One recording review at a time; it also holds the processing slot shared with the live camera. */
const shared = globalThis as typeof globalThis & { gazeRecordingJob?: RecordingJob };

const rootOf = (opts: RecordingOptions) => opts.root ?? cameraRecordRoot;
const recordOptions = (opts: RecordingOptions): RecordOptions => ({ root: opts.root, lockTimeoutMs: opts.lockTimeoutMs, isActive: recordingActive });
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

function folder(id: string, opts: RecordingOptions): string {
  if (!validRunId(id)) throw new AnalysisError('Invalid session id.', 400);
  return join(rootOf(opts), id);
}

/** True while a recording review job is processing that record. */
export function recordingActive(recordId: string): boolean {
  return shared.gazeRecordingJob?.record.id === recordId;
}
/** The in-memory record of the running review (the saved copy lags by up to 5 s). */
export function runningRecording(recordId: string): LiveSessionRecord | undefined {
  return recordingActive(recordId) ? shared.gazeRecordingJob!.record : undefined;
}

/** Worker arguments; strong head turns are read only when asked for and the head-pose model is installed. */
export function recordingArgs(mode: RecordingMode, input: string, settings: CameraSettings, headModelReady: boolean): string[] {
  return [join(projectRoot, 'scripts', 'recording_worker.py'), mode, '--input', input,
    ...(settings.mirrored ? ['--mirrored'] : []), '--tile-grid', String(settings.tileGrid),
    ...(settings.headTurns && headModelReady ? ['--head-turns'] : [])];
}

async function launchWorker(mode: RecordingMode, input: string, settings: CameraSettings): Promise<ChildProcessWithoutNullStreams> {
  const status = await backendStatus();
  if (!status.methods.baseline.ready) throw new AnalysisError(status.methods.baseline.message, 503);
  return spawn(python, recordingArgs(mode, input, settings, status.methods.head.ready),
    { cwd: projectRoot, env: pythonEnvironment(), windowsHide: true, shell: false });
}

function reserve(): () => void {
  try { return acquireProcessingSlot(); } catch (error) { throw new AnalysisError((error as Error).message, 409); }
}

function stopChild(child: ChildProcessWithoutNullStreams) {
  child.kill();
  const killer = setTimeout(() => child.kill('SIGKILL'), 2_000);
  killer.unref?.();
  child.once('close', () => clearTimeout(killer));
}

/** Runs the worker to completion and returns its last stdout line as JSON. */
function collect(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = '', expired = false, settled = false;
    const timer = setTimeout(() => { expired = true; stopChild(child); }, timeoutMs);
    const settle = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-16 * 1024 * 1024); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.once('error', () => settle(() => reject(new AnalysisError('The video reader could not start. Check the project setup.', 503))));
    child.once('close', () => settle(() => {
      if (expired) { reject(new AnalysisError('Finding seats took too long. Try a shorter video.', 504)); return; }
      const line = stdout.trim().split('\n').at(-1) ?? '';
      try { resolve(JSON.parse(line)); }
      catch {
        if (stderr) console.error(`Recording worker: ${stderr.slice(-500)}`);
        reject(new AnalysisError('This video could not be read. Try another file.', 422));
      }
    }));
  });
}

async function readMarker(dir: string): Promise<DraftMarker> {
  try { return JSON.parse(await readFile(join(dir, 'draft.json'), 'utf8')) as DraftMarker; }
  catch (error) {
    if (missing(error)) throw new AnalysisError('Recording not found.', 404);
    throw new AnalysisError('This recording is damaged. Upload it again.', 422);
  }
}

/** Finds seats on the first seconds of a draft's video, writes `preview.jpg` and remembers the settings for the review. */
export async function suggestRecording(draftId: string, settings: CameraSettings, opts: RecordingOptions = {}):
  Promise<{ draftId: string; seats: ReviewSeat[]; sampledFrames: number; durationSeconds: number; width: number; height: number }> {
  const input = await draftVideo(draftId, { root: opts.root });
  const dir = folder(draftId, opts);
  const release = reserve();
  let reply;
  try { reply = await collect(await (opts.launch ?? launchWorker)('suggest', input, settings), SUGGEST_TIMEOUT_MS); }
  finally { release(); }
  if (typeof reply.error === 'string') throw new AnalysisError(reply.error, 422);
  const { seats, sampled_frames, preview_jpeg, duration_seconds, width, height } = reply as {
    seats: ReviewSeat[]; sampled_frames: number; preview_jpeg: string; duration_seconds: number; width: number; height: number };
  if (!Array.isArray(seats) || typeof preview_jpeg !== 'string' || !Number.isFinite(duration_seconds))
    throw new AnalysisError('This video could not be read. Try another file.', 422);
  await writeFile(join(dir, 'preview.jpg'), Buffer.from(preview_jpeg, 'base64'));
  const marker = await readMarker(dir);
  const { mirrored, tileGrid, headTurns = true } = settings;
  await writeFile(join(dir, 'draft.json'), JSON.stringify({ ...marker, settings: { mirrored, tileGrid, headTurns }, durationSeconds: duration_seconds, width, height }));
  return { draftId, seats, sampledFrames: sampled_frames, durationSeconds: duration_seconds, width, height };
}

const workerSettings = (record: LiveSessionRecord): CameraSettings =>
  ({ mirrored: record.settings.mirrored, tileGrid: record.settings.tileGrid, headTurns: record.settings.headTurns ?? true });

/**
 * Feeds the worker's lines into the record. `opened` resolves once the record is saved; lines that arrive earlier wait
 * for it. On exit the record is ended (after `done`), saved as interrupted (anything else) or left alone (cancelled),
 * and the processing slot is released.
 */
function runJob(record: LiveSessionRecord, child: ChildProcessWithoutNullStreams, release: () => void, opened: Promise<void>, opts: RecordingOptions): RecordingJob {
  const options = recordOptions(opts);
  const interval = opts.saveIntervalMs ?? SAVE_INTERVAL_MS;
  const now = () => opts.now?.() ?? new Date();
  let finish!: () => void;
  const job: RecordingJob = { record, child, cancelled: false, finished: new Promise(resolve => { finish = resolve; }) };
  let chain: Promise<unknown> = opened;
  let done = false, lastSave = Date.now(), stderr = '';

  const save = async () => {
    try { await saveRecord(record, options); lastSave = Date.now(); return true; }
    catch (error) { console.error(`Recording ${record.id} could not be saved: ${(error as Error).message}`); return false; }
  };
  const handle = async (line: string) => {
    if (job.cancelled || done || !line.trim()) return;
    let message: { t?: unknown; seats?: Record<string, LiveSeatState>; events?: LiveEvent[]; done?: unknown; error?: unknown };
    try { message = JSON.parse(line); } catch { stopChild(child); return; }
    if (typeof message.error === 'string') { console.error(`Recording ${record.id} stopped: ${message.error}`); return; }
    if (message.done === true) { done = true; return; }
    const t = message.t;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) { stopChild(child); return; }
    await recordFrame(record, t, message.seats ?? {}, message.events ?? [], { recordOptions: options, groupWithinSeconds: GROUP_WITHIN_SECONDS });
    // The worker's length is an estimate for phone videos; never report progress beyond 100%.
    if (record.source && t > record.source.durationSeconds) record.source.durationSeconds = t;
    if (Date.now() - lastSave >= interval) await save();
  };

  createInterface({ input: child.stdout }).on('line', line => { chain = chain.then(() => handle(line)).catch(error => console.error(error)); });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
  child.stdin.on('error', () => {});
  let closed = false;
  const close = async () => {
    if (closed) return; closed = true;
    try {
      await chain.catch(() => {});
      if (job.cancelled) return;
      const segment = record.segments.at(-1);
      if (segment && segment.endSeconds === null) segment.endSeconds = record.lastTime;
      if (done) { record.state = 'ended'; record.endedAt = now().toISOString(); }
      else {
        record.state = 'interrupted'; record.interruptedAt = now().toISOString();
        if (stderr) console.error(`Recording ${record.id} worker exited early: ${stderr.slice(-500)}`);
      }
      for (let attempt = 0; attempt < FINAL_SAVE_ATTEMPTS && !await save(); attempt++) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    } finally {
      if (shared.gazeRecordingJob === job) shared.gazeRecordingJob = undefined;
      release(); finish();
    }
  };
  child.once('close', () => { void close(); });
  child.once('error', () => { void close(); });
  shared.gazeRecordingJob = job;
  return job;
}

/**
 * Launches the review worker for a record and saves it. `persist` writes the record (and tidies the folder); if it
 * fails, the worker is stopped, the job is dropped and the slot released before the error is thrown.
 */
async function launchReview(record: LiveSessionRecord, input: string, release: () => void, persist: () => Promise<void>, opts: RecordingOptions) {
  let child: ChildProcessWithoutNullStreams;
  try { child = await (opts.launch ?? launchWorker)('review', input, workerSettings(record)); }
  catch (error) { release(); throw error; }
  let open!: () => void;
  const opened = new Promise<void>(resolve => { open = resolve; });
  const job = runJob(record, child, release, opened, opts);
  try { await persist(); }
  catch (error) {
    // A cancelled job ignores the worker's lines and leaves the folder alone; its exit releases the slot.
    job.cancelled = true; open(); stopChild(child);
    throw error;
  }
  const { mirrored, tileGrid, seats, movement } = record.settings;
  child.stdin.write(`${JSON.stringify({ mirrored, tileGrid, seats, movement })}\n`);
  open();
}

/** Turns a draft (same id) into a recording record and starts reviewing it; 409 while any other analysis runs. */
export async function startRecordingReview(draftId: string, body: unknown, opts: RecordingOptions = {}): Promise<{ recordId: string }> {
  const input = await draftVideo(draftId, { root: opts.root });
  const dir = folder(draftId, opts);
  const marker = await readMarker(dir);
  if (!marker.settings || typeof marker.durationSeconds !== 'number') throw new AnalysisError('Find the seats first.', 409);
  if (!body || typeof body !== 'object') throw new AnalysisError('Send seats and movement settings.', 400);
  const { seats, movement, exam: examInput } = body as { seats?: unknown; movement?: unknown; exam?: unknown };
  if (!movement || typeof movement !== 'object' || Array.isArray(movement)) throw new AnalysisError('Movement settings are required.', 400);
  let review, exam;
  try {
    exam = validateExamDetails(examInput);
    review = validateReviewSettings({ method: 'baseline', mirrored: marker.settings.mirrored, tileGrid: marker.settings.tileGrid,
      seats, movement: { ...movement, max_gap: RECORDING_MAX_GAP } });
  } catch (error) { throw new AnalysisError((error as Error).message, 400); }
  const release = reserve();
  const record = newRecord(draftId, { mirrored: review.mirrored, tileGrid: review.tileGrid, seats: review.seats, movement: review.movement,
    maxGapAuto: false, exam, headTurns: marker.settings.headTurns ?? true }, opts.now?.() ?? new Date());
  record.source = { kind: 'recording', filename: marker.filename, durationSeconds: marker.durationSeconds, video: basename(input) };
  await launchReview(record, input, release, async () => {
    await saveNewRecord(record, recordOptions(opts));
    // The draft marker must not outlive the record, or draft pruning could delete a real session.
    await unlink(join(dir, 'draft.json')).catch(error => { if (!missing(error)) throw error; });
  }, opts);
  return { recordId: record.id };
}

/** Clears an ended or interrupted recording's results and reviews its stored video again from the start. */
export async function reviewAgain(recordId: string, opts: RecordingOptions = {}): Promise<{ recordId: string }> {
  const dir = folder(recordId, opts);
  const release = reserve();
  let record: LiveSessionRecord;
  try {
    record = await loadRecord(recordId, recordOptions(opts));
    if (!record.source || record.source.kind !== 'recording') throw new AnalysisError('Only a recording can be reviewed again.', 409);
    if (record.state === 'monitoring') throw new AnalysisError('This recording is still being reviewed.', 409);
  } catch (error) { release(); throw error; }
  const now = opts.now?.() ?? new Date();
  Object.assign(record, {
    state: 'monitoring', revision: record.revision + 1, endedAt: null, interruptedAt: null,
    segments: [{ startedAt: now.toISOString(), offsetSeconds: 0, endSeconds: null }],
    events: [], alerts: [], coverage: {}, minutes: [], framesProcessed: 0, stillsSaved: 0, lastTime: 0,
  } satisfies Partial<LiveSessionRecord>);
  await launchReview(record, join(dir, record.source.video), release, async () => {
    await saveRecord(record, recordOptions(opts));
    await rm(join(dir, 'stills'), { recursive: true, force: true });
  }, opts);
  return { recordId };
}

/** Stops a running review and deletes the recording's folder (video, photos, record). A draft is simply discarded. */
export async function cancelRecordingReview(recordId: string, opts: RecordingOptions = {}): Promise<void> {
  folder(recordId, opts);
  const job = shared.gazeRecordingJob;
  if (job && job.record.id === recordId) {
    job.cancelled = true;
    stopChild(job.child);
    await job.finished;
  }
  let record;
  try { record = await loadRecord(recordId, recordOptions(opts)); }
  catch (error) {
    if (error instanceof AnalysisError && error.status === 404) { await discardDraft(recordId, { root: opts.root }); return; }
    throw error;
  }
  if (record.source?.kind !== 'recording') throw new AnalysisError('Only a recording can be cancelled.', 409);
  await deleteRecord(recordId, recordOptions(opts));
}

/** A file in a draft's or a record's folder (resolved by id either way); regular files only. */
async function folderFile(dir: string, name: string): Promise<{ file: string; size: number }> {
  const file = join(dir, name);
  try {
    const info = await lstat(file);
    if (info.isFile() && !info.isSymbolicLink()) return { file, size: info.size };
  } catch (error) { if (!missing(error) && (error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error; }
  throw new AnalysisError('Recording not found.', 404);
}

export async function recordingVideo(id: string, opts: RecordingOptions = {}): Promise<{ file: string; size: number; mime: string }> {
  const dir = folder(id, opts);
  let names: string[] = [];
  try { names = await readdir(dir); } catch (error) { if (!missing(error)) throw error; }
  const name = names.find(n => n.startsWith('recording.') && VIDEO_TYPES[extname(n).toLowerCase()] && n === `recording${extname(n)}`);
  if (!name) throw new AnalysisError('Recording not found.', 404);
  return { ...await folderFile(dir, name), mime: VIDEO_TYPES[extname(name).toLowerCase()] };
}

export async function recordingPreview(id: string, opts: RecordingOptions = {}): Promise<string> {
  return (await folderFile(folder(id, opts), 'preview.jpg')).file;
}

/** The video as a full (200) or byte-range (206) response; an unsatisfiable range answers 416. */
export async function recordingVideoResponse(id: string, rangeHeader: string | null, opts: RecordingOptions = {}): Promise<Response> {
  const { file, size, mime } = await recordingVideo(id, opts);
  let range;
  try { range = parseRange(rangeHeader, size); }
  catch { return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } }); }
  const headers: Record<string, string> = { 'Content-Type': mime, 'Content-Length': String(range ? range.end - range.start + 1 : size),
    'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
  const stream = createReadStream(file, range ?? undefined);
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers });
}
