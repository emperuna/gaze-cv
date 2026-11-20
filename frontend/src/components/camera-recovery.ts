"use client";

import { useRef, useState } from 'react';
import type { LiveSessionRecord } from '@/lib/live-alerts';
import type { ReviewSeat } from '@/lib/review-contract';
import { displaySeats, interruptedAt } from '@/lib/camera-sessions';
import { PlainError, describeProblem } from '@/lib/camera-messages';
import type { CameraAction, CameraScreen, Problem } from '@/lib/camera-messages';
import { deleteSession } from './camera-past-sessions';
import { recordingUrl } from '@/lib/recording-flow';
import { interruptSession, newRun } from './camera-run';
import type { Run } from './camera-run';
import type { CameraPhase } from './camera-setup';
import type { Chime } from './camera-alerts-panel';

export type RecordMeta = { createdAt: string; state: LiveSessionRecord['state']; seats: number };
export type ResumeStep = '' | 'loading' | 'camera' | 'ask' | 'starting';
type Ref<T> = { current: T };
const RESUME_FAILED = 'Monitoring could not resume. Press Yes, resume again.';

/** What the session-recovery handlers need from the camera workspace; read when a handler runs. */
export interface RecoveryHost {
  run: Ref<Run | null>; mounted: Ref<boolean>; phaseRef: Ref<CameraPhase>; seatsRef: Ref<ReviewSeat[]>;
  recordIdRef: Ref<string | null>; recordStateRef: Ref<LiveSessionRecord['state'] | null>;
  frameTimes: Ref<number[]>; chime: Ref<Chime | null>; newChime: () => Chime;
  ready: boolean; mirrored: boolean; tileGrid: number;
  go: (phase: CameraPhase) => void;
  isCurrent: (current: Run) => boolean;
  release: (current: Run) => void;
  fetchRecord: (id: string, signal?: AbortSignal) => Promise<LiveSessionRecord>;
  applyRecord: (record: LiveSessionRecord) => void;
  showRecord: (id: string, record: LiveSessionRecord) => void;
  resetDashboard: () => void;
  newSession: () => void;
  openCamera: (current: Run) => Promise<MediaStream>;
  capture: (current: Run, stream: MediaStream) => Promise<void>;
  captureFailed: (current: Run, problem: unknown) => Promise<void>;
  cameraProblem: (problem: unknown, action?: CameraAction, screen?: CameraScreen) => Problem;
  /** The screen's error line; `detail` (raw server text) is shown only under More information. */
  setError: (text: string, detail?: string) => void; setNotice: (text: string) => void; setSaveError: (text: string) => void;
  setWarnings: (warnings: string[]) => void; setStopRetry: (id: string | null) => void; setEditing: (editing: null) => void;
  setHasFrame: (value: boolean) => void; setSeats: (seats: ReviewSeat[]) => void; setMirrored: (value: boolean) => void;
  setTileGrid: (value: number) => void; setSessionTime: (time: number) => void; refreshPast: () => void;
}

/**
 * Interrupted and saved camera sessions: resume (load, seat check, new worker), End session, Delete and
 * Open from Past sessions. `host` is called each time a handler runs, so it always sees the current render.
 */
export function useSessionRecovery(host: () => RecoveryHost) {
  const [recordMeta, setRecordMeta] = useState<RecordMeta | null>(null);
  const [stoppedAt, setStoppedAt] = useState<Date | null>(null);
  const [pauseReason, setPauseReason] = useState('');
  const [resumeStep, setResumeStep] = useState<ResumeStep>('');
  const [confirm, setConfirm] = useState<'' | 'end' | 'delete'>('');
  const [action, setAction] = useState<'' | 'end' | 'delete' | 'open'>('');
  /** The worker paused from this tab; paused again before a resume in case it is still closing. */
  const pausedSession = useRef<string | null>(null);
  const hostRef = useRef(host);
  hostRef.current = host;
  const resumeStepRef = useRef<ResumeStep>('');
  resumeStepRef.current = resumeStep;
  const actionRef = useRef(action);
  actionRef.current = action;

  function reset() { setRecordMeta(null); setStoppedAt(null); setPauseReason(''); setConfirm(''); setResumeStep(''); }

  /** Resume step 1: load the interrupted record, open the camera and draw the saved seats over it. */
  async function beginResume(id: string) {
    const h = hostRef.current();
    if (h.run.current) return;
    if (!h.ready) { h.setError('Ocular is not ready: press Recheck, then Resume.'); return; }
    h.setError(''); h.setNotice(''); h.setSaveError(''); h.setWarnings([]); setConfirm(''); h.setStopRetry(null); h.setEditing(null); h.setHasFrame(false);
    setResumeStep('loading'); h.go('confirming');
    const current = newRun(); current.resumeOf = id;
    h.run.current = current;
    const valid = () => h.isCurrent(current);
    try {
      // A worker paused from this tab may still be closing; pausing again is harmless.
      if (pausedSession.current) { await interruptSession(pausedSession.current); pausedSession.current = null; }
      const record = await h.fetchRecord(id, current.controller.signal);
      if (!valid()) return;
      // A recording has no camera to resume; it is reviewed again from its own screen.
      if (record.source?.kind === 'recording') throw new PlainError('This is a recording: open it from Past sessions to review it again.');
      if (record.state !== 'interrupted') {
        throw new PlainError(record.state === 'ended' ? 'This session has ended: open it from Past sessions to see its alerts.'
          : 'This session is live in another tab: continue there.');
      }
      h.resetDashboard(); h.showRecord(id, record);
      setStoppedAt(interruptedAt(record)); h.setSessionTime(record.lastTime); setResumeStep('camera');
      h.setSeats(displaySeats(record.settings)); h.setMirrored(record.settings.mirrored); h.setTileGrid(record.settings.tileGrid);
      h.seatsRef.current = displaySeats(record.settings);
      await h.openCamera(current);
      if (valid()) setResumeStep('ask');
    } catch (problem) {
      if (!valid()) return;
      h.release(current); setResumeStep('');
      // The interrupted view has no camera list; the idle screen (Past sessions) has one.
      if (h.recordIdRef.current === id && h.recordStateRef.current === 'interrupted') {
        const message = h.cameraProblem(problem, 'Resume', 'interrupted');
        setPauseReason(''); h.setError(message.text, message.detail); h.go('interrupted');
      } else {
        const message = h.cameraProblem(problem, 'Resume', 'setup');
        h.resetDashboard(); h.setError(message.text, message.detail); h.refreshPast(); h.go('idle');
      }
    }
  }

  /** Resume step 2 (Yes, resume): a new worker continues the same record with its saved settings. */
  async function confirmResume() {
    const h = hostRef.current();
    const current = h.run.current;
    const id = current?.resumeOf;
    if (!current || !id || h.phaseRef.current !== 'confirming' || resumeStepRef.current !== 'ask' || !current.stream) return;
    const stream = current.stream;
    const valid = () => h.isCurrent(current);
    h.setError(''); setResumeStep('starting');
    // This click is the user gesture browsers require before the alert sound can play.
    h.chime.current ??= h.newChime(); h.chime.current.unlock();
    try {
      const response = await fetch('/api/camera', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mirrored: h.mirrored, tileGrid: h.tileGrid, resume: id }), signal: AbortSignal.any([current.controller.signal, AbortSignal.timeout(65_000)]) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new PlainError(RESUME_FAILED, data.error || '');
      current.sessionId = data.sessionId;
      // Left the check while the worker started: pause it again so the record stays interrupted.
      if (!valid()) { await interruptSession(data.sessionId); return; }
      current.recordId = id;
      h.applyRecord(data.record as LiveSessionRecord);
      try { const record = await h.fetchRecord(id, current.controller.signal); if (valid()) h.applyRecord(record); }
      catch { /* the record returned by Resume is already shown */ }
      if (!valid()) return;
      setResumeStep(''); setStoppedAt(null); setPauseReason(''); h.frameTimes.current = [];
      h.go('monitoring');
      await h.capture(current, stream);
    } catch (problem) {
      if (!valid()) return;
      if (current.recordId) { await h.captureFailed(current, problem); return; }
      setResumeStep('ask');
      const message = describeProblem(problem, RESUME_FAILED);
      h.setError(message.text, message.detail);
    }
  }

  /** End session (interrupted view, or No at the seat check): the record is ended; marking and the PDF still work. */
  async function endSession() {
    const h = hostRef.current();
    const id = h.recordIdRef.current;
    if (!id || actionRef.current) return;
    if (h.run.current) h.release(h.run.current);
    setResumeStep(''); h.setHasFrame(false); h.setError(''); setAction('end');
    try {
      // A worker paused from this tab may still be closing; pausing again is harmless.
      if (pausedSession.current) { await interruptSession(pausedSession.current); pausedSession.current = null; }
      // The end route would stop a session another tab has resumed meanwhile, so check first.
      const latest = await h.fetchRecord(id);
      if (!h.mounted.current || h.recordIdRef.current !== id) return;
      if (latest.state === 'monitoring') {
        h.applyRecord(latest); setConfirm(''); setPauseReason(''); setStoppedAt(null);
        h.setError('This session is live in another tab: stop it there.');
        h.go('ended');
        return;
      }
      const response = await fetch(`/api/camera/sessions/${encodeURIComponent(id)}/end`, { method: 'POST', signal: AbortSignal.timeout(20_000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The session could not be ended.');
      if (!h.mounted.current || h.recordIdRef.current !== id) return;
      h.applyRecord(data.record as LiveSessionRecord);
      setConfirm(''); setPauseReason(''); setStoppedAt(null); pausedSession.current = null;
      h.go('ended');
    } catch (problem) {
      if (!h.mounted.current) return;
      const message = describeProblem(problem, 'The session could not be ended. Press End session again.');
      h.setError(message.text, message.detail);
      if (h.phaseRef.current === 'confirming') h.go('interrupted');
    } finally { if (h.mounted.current) setAction(''); }
  }

  async function deleteCurrent() {
    const h = hostRef.current();
    const id = h.recordIdRef.current;
    if (!id || actionRef.current) return;
    h.setError(''); setAction('delete');
    const problem = await deleteSession(id);
    if (!h.mounted.current) return;
    setAction('');
    if (problem) { h.setError(problem); return; }
    h.newSession();
  }

  /** Past sessions → Open: the saved record's alerts (marking allowed) and its PDF, without a live view. */
  async function openRecord(id: string) {
    const h = hostRef.current();
    if (h.run.current || actionRef.current) return;
    h.setError(''); h.setNotice(''); h.setSaveError(''); setAction('open');
    try {
      const record = await h.fetchRecord(id);
      if (!h.mounted.current || h.run.current) return;
      if (record.source?.kind === 'recording') { window.location.assign(recordingUrl(id)); return; }
      h.resetDashboard(); h.showRecord(id, record);
      h.setSeats(displaySeats(record.settings)); h.setHasFrame(false); h.setSessionTime(record.lastTime);
      if (record.state === 'interrupted') { setStoppedAt(interruptedAt(record)); h.go('interrupted'); }
      else h.go('ended');
    } catch (problem) {
      if (h.mounted.current) { const message = describeProblem(problem, 'The session could not be opened. Press Open again.'); h.setError(message.text, message.detail); }
    } finally { if (h.mounted.current) setAction(''); }
  }

  return {
    recordMeta, setRecordMeta, stoppedAt, setStoppedAt, pauseReason, setPauseReason, resumeStep, setResumeStep,
    confirm, setConfirm, action, pausedSession, reset, beginResume, confirmResume, endSession, deleteCurrent, openRecord,
  };
}
