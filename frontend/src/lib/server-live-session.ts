import { randomUUID } from 'node:crypto';
import type { CameraSession } from './camera-session.ts';
import type { CameraFrame, CameraResult, CameraSettings, LiveEvent, LiveSeatState } from './camera-contract.ts';
import { RevisionError, applyFrame, markAlert, newRecord, openAlertKeys } from './live-alerts.ts';
import type { AlertMark, LiveAlert, LiveSessionRecord } from './live-alerts.ts';
import { validateReviewSettings } from './review-contract.ts';
import type { ReviewSeat } from './review-contract.ts';
import { saveNewRecord, saveRecord, takeRecord, writeStill } from './server-camera-record.ts';
import type { RecordOptions } from './server-camera-record.ts';
import { AnalysisError } from './server-analysis.ts';
import { validateExamDetails } from './exam-details.ts';

export const SESSION_LIMIT_SECONDS = 10_800;
export const SESSION_WARNING_SECONDS = 9_900;
export const LIMIT_MESSAGE = 'Monitoring stopped at the 3-hour limit.';
export const RESUME_GONE = 'This session was ended or deleted in another tab.';
export const FINAL_SAVE_FAILED = 'The session stopped, but it could not be saved. Try Stop again.';
const SAVE_INTERVAL_MS = 5_000;
const FINAL_SAVE_ATTEMPTS = 3;
const FINAL_SAVE_BACKOFF_MS = 250;
/** How long a monitored worker stays open after the browser drops a frame request, so a Stop sent with it wins. */
const CANCEL_GRACE_MS = 3_000;

/** `root` and `lockTimeoutMs` reach every record function; `now` is the wall clock and `cancelGraceMs` the frame-cancel grace (tests). */
export interface LiveOptions { root?: string; lockTimeoutMs?: number; now?: () => Date; cancelGraceMs?: number }
export type LiveFrameResult = CameraResult & {
  alerts: LiveAlert[]; sessionTime: number; revision: number; state: LiveSessionRecord['state'];
  saveError: string | null; notice: string | null;
};

/** Events go to the browser without still bytes; stills are loaded by URL. */
function withoutStills(result: CameraResult, events?: LiveEvent[]): CameraResult {
  const list = events ?? result.events;
  return list ? { ...result, events: list.map(({ still: _still, ...event }) => event) } : result;
}

function commandError(error: unknown): AnalysisError {
  const message = error instanceof Error ? error.message : 'Camera request failed.';
  if (error instanceof AnalysisError) return error;
  return new AnalysisError(message, /already processing/.test(message) ? 409 : /stopped|exited|expired/.test(message) ? 404 : 422);
}

/**
 * One camera worker and, once monitoring starts, its session record. Before `monitor` (or without `resume`)
 * the worker only previews frames and has no record. Session time is `segment.offsetSeconds + timestamp_seconds`.
 */
/** Applies one frame to a record and writes the stills of newly opened alerts; shared by live and recording review. */
export async function recordFrame(record: LiveSessionRecord, time: number, seats: Record<string, LiveSeatState>, events: LiveEvent[],
  opts: { recordOptions: RecordOptions; groupWithinSeconds?: number }): Promise<ReturnType<typeof applyFrame>> {
  const { opened, updated } = applyFrame(record, time, seats, events, { groupWithinSeconds: opts.groupWithinSeconds });
  const stills = opened.filter(o => o.still !== undefined);
  // Never let base64 bytes reach the saved record, even if another save runs while a still is written.
  for (const { alert } of stills) alert.still = null;
  for (const { alert, still } of stills) {
    try { alert.still = await writeStill(record.id, alert.id, Buffer.from(still!, 'base64'), opts.recordOptions); }
    catch { alert.stillError = 'Still could not be saved'; record.stillsSaved--; }
  }
  return { opened, updated };
}

export class LiveCamera {
  record?: LiveSessionRecord;
  saveError: string | null = null;
  /** Resolves after the worker exited and any interruption was saved. */
  readonly exited: Promise<void>;
  private dirty = false;
  private lastSave = 0;
  private lastTimestamp = -1;
  /** The post-worker part of a monitored frame (applyFrame, stills, save); final saves wait for it. */
  private processing?: Promise<unknown>;
  private cancelTimer?: ReturnType<typeof setTimeout>;
  /** True once the worker process has exited (the interruption save may still be running until `exited`). */
  workerExited = false;

  readonly id: string;
  readonly session: CameraSession;
  readonly settings: CameraSettings;
  private readonly options: LiveOptions;

  constructor(id: string, session: CameraSession, settings: CameraSettings, options: LiveOptions = {}) {
    this.id = id; this.session = session; this.settings = settings; this.options = options;
    this.exited = new Promise(resolve => session.onExit(() => {
      this.workerExited = true; clearTimeout(this.cancelTimer);
      void this.interrupt().finally(resolve);
    }));
  }

  get monitoring(): boolean { return this.record?.state === 'monitoring'; }
  private now(): Date { return this.options.now?.() ?? new Date(); }
  private recordOptions(): RecordOptions {
    return { root: this.options.root, lockTimeoutMs: this.options.lockTimeoutMs, isActive: id => this.monitoring && this.record?.id === id };
  }

  private async command<T>(message: Record<string, unknown> & { type: string }): Promise<T> {
    try { return await this.session.command<T>(message, 60_000); } catch (error) { throw commandError(error); }
  }

  private requirePreview() {
    if (this.record) throw new AnalysisError('Monitoring has already started for this camera session.', 409);
  }

  async suggestSeats(): Promise<{ seats: ReviewSeat[]; sampledFrames: number; note: string }> {
    this.requirePreview();
    const reply = await this.command<{ seats: ReviewSeat[]; sampled_frames: number; note: string }>({ type: 'suggest_seats' });
    return { seats: reply.seats, sampledFrames: reply.sampled_frames, note: reply.note };
  }

  private configure(settings: LiveSessionRecord['settings']) {
    const { mirrored, tileGrid, seats, movement } = settings;
    return this.command({ type: 'configure', settings: { mirrored, tileGrid, seats, movement } });
  }

  async monitor(value: unknown): Promise<{ recordId: string; record: LiveSessionRecord }> {
    this.requirePreview();
    if (!value || typeof value !== 'object') throw new AnalysisError('Send seats and movement settings.', 400);
    const { seats, movement, maxGapAuto, exam: examInput } = value as { seats?: unknown; movement?: unknown; maxGapAuto?: unknown; exam?: unknown };
    if (typeof maxGapAuto !== 'boolean') throw new AnalysisError('Choose whether the maximum gap is automatic.', 400);
    let exam;
    try { exam = validateExamDetails(examInput); }
    catch (error) { throw new AnalysisError((error as Error).message, 400); }
    let review;
    try { review = validateReviewSettings({ method: 'baseline', ...this.settings, seats, movement }); }
    catch (error) { throw new AnalysisError((error as Error).message, 400); }
    const settings = { mirrored: this.settings.mirrored, tileGrid: this.settings.tileGrid, seats: review.seats, movement: review.movement, maxGapAuto, exam };
    await this.configure(settings);
    this.requirePreview();
    const record = newRecord(randomUUID(), settings, this.now());
    // Session time starts at zero when monitoring starts, not when the preview started.
    record.segments[0].offsetSeconds = this.lastTimestamp > 0 ? -this.lastTimestamp : 0;
    await saveNewRecord(record, this.recordOptions());
    this.record = record;
    this.lastSave = Date.now();
    return { recordId: record.id, record };
  }

  /**
   * Continues an interrupted record on this fresh worker; the gap is wall time since the interruption, never
   * bridged. The worker is configured first, then the record is re-read from disk and taken under its lock, so
   * a mark saved meanwhile is kept, and a session ended or deleted meanwhile is not resumed (409).
   */
  async resume(recordId: string, settings: LiveSessionRecord['settings']): Promise<LiveSessionRecord> {
    this.requirePreview();
    await this.configure(settings);
    this.requirePreview();
    try {
      await takeRecord(recordId, record => {
        if (record.state === 'ended') throw new AnalysisError(RESUME_GONE, 409);
        const now = this.now();
        const previous = record.segments.at(-1);
        if (previous && previous.endSeconds === null) previous.endSeconds = record.lastTime;
        // A record left `monitoring` by a server crash has no interruption time; estimate its last frame's wall time.
        const stoppedAt = record.interruptedAt ? Date.parse(record.interruptedAt)
          : previous ? Date.parse(previous.startedAt) + (record.lastTime - Math.max(previous.offsetSeconds, 0)) * 1000 : now.getTime();
        const gap = Math.max(0, (now.getTime() - stoppedAt) / 1000);
        record.segments.push({ startedAt: now.toISOString(), offsetSeconds: record.lastTime + gap, endSeconds: null });
        record.state = 'monitoring';
        record.interruptedAt = null;
        record.endedAt = null;
        this.record = record;
      }, this.recordOptions());
    } catch (error) {
      if (error instanceof AnalysisError && error.status === 404) throw new AnalysisError(RESUME_GONE, 409);
      throw error;
    }
    await this.save();
    return this.record!;
  }

  async frame(frame: CameraFrame): Promise<CameraResult | LiveFrameResult> {
    const record = this.record;
    if (!record) {
      const result = await this.session.frame({ ...frame, open_alerts: undefined });
      this.lastTimestamp = result.timestamp_seconds;
      return withoutStills(result);
    }
    if (record.state !== 'monitoring') throw new AnalysisError('Monitoring has ended for this session.', 409);
    const result = await this.session.frame({ ...frame, open_alerts: openAlertKeys(record) });
    this.lastTimestamp = result.timestamp_seconds;
    // A result that arrives after Stop or an interruption must not change the record.
    if (record.state !== 'monitoring') throw new AnalysisError('Monitoring has ended for this session.', 409);
    const work = this.process(record, result);
    this.processing = work;
    try { return await work; } finally { if (this.processing === work) this.processing = undefined; }
  }

  /**
   * The browser dropped a frame request. A preview worker closes at once. While monitoring, the worker stays
   * open for a short grace so a Stop sent with the cancel ends the record instead of leaving it interrupted;
   * without a Stop it then closes and the record is saved as interrupted.
   */
  cancelFrame(message = 'Camera request cancelled.') {
    if (!this.monitoring) { void this.session.close(message); return; }
    if (this.cancelTimer) return;
    this.cancelTimer = setTimeout(() => { void this.session.close(message); }, this.options.cancelGraceMs ?? CANCEL_GRACE_MS);
    this.cancelTimer.unref?.();
  }

  private async process(record: LiveSessionRecord, result: CameraResult): Promise<LiveFrameResult> {
    const offset = record.segments.at(-1)!.offsetSeconds;
    const time = offset + result.timestamp_seconds;
    const events = (result.events ?? []).map(e => ({ ...e, start_time: e.start_time + offset, end_time: e.end_time + offset, observed_at: e.observed_at + offset }));
    const { opened, updated } = await recordFrame(record, time, result.seats ?? {}, events, { recordOptions: this.recordOptions() });
    let notice: string | null = null;
    if (time >= SESSION_LIMIT_SECONDS && record.state === 'monitoring') {
      this.end(record); notice = LIMIT_MESSAGE;
      if (!await this.persistFinal()) console.error(`Camera session ${record.id} reached the 3-hour limit but could not be saved: ${this.saveError}`);
      void this.session.close(LIMIT_MESSAGE);
    } else if (opened.length || updated.length || events.length || this.dirty || Date.now() - this.lastSave >= SAVE_INTERVAL_MS) await this.save();
    const alerts = [...new Set([...opened.map(o => o.alert), ...updated])].map(a => ({ ...a, eventIndexes: [...a.eventIndexes] }));
    return { ...withoutStills(result, events), alerts, sessionTime: time, revision: record.revision, state: record.state, saveError: this.saveError, notice };
  }

  async mark(alertId: string, mark: AlertMark, note: string, revision: number): Promise<{ alert: LiveAlert; revision: number; saveError: string | null }> {
    const record = this.record!;
    if (!record.alerts.some(a => a.id === alertId)) throw new AnalysisError('Alert not found.', 404);
    let alert;
    try { alert = markAlert(record, alertId, mark, note, revision, this.now()); }
    catch (error) {
      if (error instanceof RevisionError) throw new AnalysisError(error.message, 409);
      throw error;
    }
    await this.save();
    return { alert: { ...alert, eventIndexes: [...alert.eventIndexes] }, revision: record.revision, saveError: this.saveError };
  }

  private end(record: LiveSessionRecord) {
    this.dirty = true;
    record.state = 'ended';
    record.endedAt = this.now().toISOString();
    const segment = record.segments.at(-1);
    if (segment && segment.endSeconds === null) segment.endSeconds = record.lastTime;
  }

  /** True when the record has left `monitoring` but its final state is not on disk yet. */
  get unsaved(): boolean { return !!this.record && this.record.state !== 'monitoring' && this.dirty; }

  /** Final saves wait for an in-flight frame, then retry with backoff (lock collisions with marks or frames are brief). */
  private async persistFinal(): Promise<boolean> {
    for (let attempt = 0; attempt < FINAL_SAVE_ATTEMPTS; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, FINAL_SAVE_BACKOFF_MS * attempt));
      await this.save();
      if (!this.saveError) return true;
    }
    return false;
  }

  /** Retries an unsaved final state; throws 503 if it still cannot be written. */
  async flush(): Promise<void> {
    await this.processing?.catch(() => {});
    if (this.unsaved && !await this.persistFinal()) throw new AnalysisError(FINAL_SAVE_FAILED, 503);
  }

  /**
   * Stop / End: the record (if any) is ended and saved before the worker closes. Repeating it on an already
   * stopped session retries a save that failed. Throws 503 when the ended record could not be written.
   */
  async stop(): Promise<{ recordId: string | null; saveError: string | null }> {
    const record = this.record;
    clearTimeout(this.cancelTimer);
    if (record && record.state !== 'ended') this.end(record);
    try { await this.flush(); }
    finally { await this.session.close(); }
    return { recordId: record?.id ?? null, saveError: null };
  }

  private async interrupt() {
    const record = this.record;
    if (record?.state !== 'monitoring') return;
    record.state = 'interrupted';
    record.interruptedAt = this.now().toISOString();
    const segment = record.segments.at(-1);
    if (segment && segment.endSeconds === null) segment.endSeconds = record.lastTime;
    this.dirty = true;
    await this.processing?.catch(() => {});
    if (!await this.persistFinal()) console.error(`Camera session ${record.id} stopped unexpectedly and could not be saved: ${this.saveError}`);
  }

  /** Save failures never stop monitoring: the in-memory record stays authoritative and the next frame retries. */
  private async save() {
    if (!this.record) return;
    try {
      await saveRecord(this.record, this.recordOptions());
      this.saveError = null; this.dirty = false; this.lastSave = Date.now();
    } catch (error) {
      this.saveError = error instanceof Error ? error.message : 'The session could not be saved.';
      this.dirty = true;
    }
  }
}
