"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, Check, CircleHelp, LoaderCircle, Play, RefreshCw, Square, Trash2, X } from 'lucide-react';
import { Button } from './ui/button';
import type { BackendStatus } from '@/lib/analysis-contract';
import { cameraWarnings, lowDetailImage } from '@/lib/camera-health';
import type { CameraHealth } from '@/lib/camera-health';
import { chooseMaxGap } from '@/lib/live-alerts';
import type { AlertMark, LiveAlert, LiveSessionRecord } from '@/lib/live-alerts';
import type { LiveSeatState } from '@/lib/camera-contract';
import {
  CONFLICT_TEXT, SAVE_WARNING_TEXT, alertsFromRecord, announceAlerts, longSessionWarning, mergeAlerts, openAlertSeats,
  pruneFrameTimes, readMuted, runningStatus, seatsObserved, sortAlerts, withAlert, writeMuted,
} from '@/lib/camera-dashboard';
import type { AlertMap, RunningStatus } from '@/lib/camera-dashboard';
import { validateReviewSettings } from '@/lib/review-contract';
import type { MovementEvent, ReviewSeat } from '@/lib/review-contract';
import { cameraMovement, cameraRules, movementProblem, newSetupProgress, numberSeats, pickDevice, readGuideSeen, readSavedDevice, seatsForMonitor, setupStep, writeGuideSeen, writeSavedDevice } from '@/lib/camera-setup';
import { AboutThisExam, CameraAdvancedSettings, SeatAdjuster, SetupSteps, drawSeatBoxes, preparingText } from './camera-setup';
import { interruptSession, newRun, runCaptureLoop, stopSession } from './camera-run';
import { CameraPastSessions, InlineConfirm } from './camera-past-sessions';
import { useSessionRecovery } from './camera-recovery';
import { PdfReportDownload } from './pdf-report-download';
import {
  DELETE_CONFIRM_TEXT, END_CONFIRM_TEXT, SEATS_QUESTION, countText, formatSessionDate, interruptionText,
  alertSummary, leaveAction, reportFilename, reportUrl,
} from '@/lib/camera-sessions';
import type { MonitorFrame, Run } from './camera-run';
import { CameraAlertsPanel, Chime } from './camera-alerts-panel';
import { CameraGuide } from './camera-guide';
import { EMPTY_EXAM } from '@/lib/exam-details';
import type { ExamDetails } from '@/lib/exam-details';
import { CameraSeatGrid, SeatStatusLine } from './camera-seat-grid';
import type { CameraPhase, MeasuredSpeed, MovementRules } from './camera-setup';
import { PlainError, cameraProblem, describeProblem } from '@/lib/camera-messages';
import type { Problem } from '@/lib/camera-messages';

const HIDDEN_REASON = 'The tab was hidden, so the camera stopped. Press Resume.';
const LOST_REASON = 'Processing stopped. Press Resume.';
const MONITOR_FAILED = 'Monitoring could not start. Press Start monitoring again.';

const initialRules = (): MovementRules => cameraRules();

export function CameraWorkspace() {
  const [mirrored, setMirrored] = useState(false);
  const [tileGrid, setTileGrid] = useState(2);
  const [headTurns, setHeadTurns] = useState(true);
  const [rules, setRules] = useState<MovementRules>(initialRules);
  const [gapOverride, setGapOverride] = useState<number | null>(null);
  /** Optional exam details printed at the top of the PDF report; blank ones print as lines to fill in by hand. */
  const [exam, setExam] = useState<ExamDetails>(EMPTY_EXAM);
  const [measured, setMeasured] = useState<MeasuredSpeed | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState('');
  const [phase, setPhaseState] = useState<CameraPhase>('idle');
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setErrorState] = useState<Problem>({ text: '', detail: '' });
  /** The screen's error line, in plain words; `detail` (raw server text) shows only under More information. */
  const setError = (text: string, detail = '') => setErrorState({ text, detail });
  const showProblem = (problem: Problem) => setErrorState(problem);
  const [notice, setNotice] = useState('');
  const [saveError, setSaveError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [hasFrame, setHasFrame] = useState(false);
  const [received, setReceived] = useState(0);
  const [seats, setSeats] = useState<ReviewSeat[]>([]);
  const [seatsEdited, setSeatsEdited] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [editing, setEditing] = useState<{ image: string } | null>(null);
  const [requesting, setRequesting] = useState<'' | 'setup' | 'monitor'>('');
  const [stopRetry, setStopRetry] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  /** The setup step shown when Stop was pressed, kept highlighted while stopping. */
  const [stoppedFrom, setStoppedFrom] = useState<number | null>(null);
  // Monitoring dashboard. Refs hold what the frame loop reads; state mirrors them for rendering.
  const [recordId, setRecordId] = useState<string | null>(null);
  const [alerts, setAlertState] = useState<AlertMap>({});
  const [events, setEventState] = useState<MovementEvent[]>([]);
  const [seatStates, setSeatStates] = useState<Record<string, LiveSeatState> | undefined>(undefined);
  const [sessionTime, setSessionTime] = useState(0);
  const [running, setRunning] = useState<RunningStatus>(() => runningStatus([], 0, 1));
  const [markMessage, setMarkMessage] = useState('');
  const [muted, setMutedState] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [pastKey, setPastKey] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideButton = useRef<HTMLButtonElement>(null);
  const recordIdRef = useRef<string | null>(null);
  const recordStateRef = useRef<LiveSessionRecord['state'] | null>(null);
  const leaveRef = useRef<(reason?: string) => void>(() => {});
  const alertsRef = useRef<AlertMap>({});
  const eventsRef = useRef<MovementEvent[]>([]);
  const revision = useRef(0);
  const reloadQueued = useRef(false);
  const frameTimes = useRef<number[]>([]);
  const sessionGap = useRef(0.75);
  const mutedRef = useRef(false);
  const chime = useRef<Chime | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const setupBody = useRef<HTMLDivElement>(null);
  /** A selector in the setup card to focus after the next render. */
  const focusNext = useRef<string | null>(null);
  const health = useRef<CameraHealth | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const output = useRef<HTMLCanvasElement>(null);
  const run = useRef<Run | null>(null);
  const mounted = useRef(true);
  const phaseRef = useRef<CameraPhase>('idle');
  const seatsRef = useRef<ReviewSeat[]>([]);
  const busy = phase !== 'idle' && phase !== 'ended' && phase !== 'interrupted';
  /** The local processor answered ready at the last check (it stays shown while a Recheck runs). */
  const processorReady = !!status?.methods.baseline.ready;
  const ready = processorReady && !checking;
  // Interruptions, resume and saved sessions.
  const recovery = useSessionRecovery(() => ({
    run, mounted, phaseRef, seatsRef, recordIdRef, recordStateRef, frameTimes, chime, newChime: () => new Chime(),
    ready, mirrored, tileGrid, go, isCurrent, release, fetchRecord, applyRecord, showRecord, resetDashboard, newSession,
    openCamera, capture, captureFailed, cameraProblem, setError, setNotice, setSaveError, setWarnings, setStopRetry, setEditing,
    setHasFrame, setSeats, setMirrored, setTileGrid, setSessionTime, refreshPast: () => setPastKey(key => key + 1),
  }));
  const { recordMeta, setRecordMeta, stoppedAt, setStoppedAt, pauseReason, setPauseReason, resumeStep, setResumeStep,
    confirm, setConfirm, action, pausedSession, beginResume, confirmResume, endSession, deleteCurrent, openRecord } = recovery;
  useEffect(() => { seatsRef.current = seats; }, [seats]);

  const go = useCallback((next: CameraPhase) => { phaseRef.current = next; setPhaseState(next); }, []);
  const isCurrent = (current: Run) => mounted.current && current.active && run.current === current;

  const setAlerts = (next: AlertMap) => { alertsRef.current = next; setAlertState(next); };
  /** A loaded record replaces the dashboard's alerts and events; its event indexes match the record's. */
  function applyRecord(record: LiveSessionRecord) {
    recordStateRef.current = record.state;
    setRecordMeta({ createdAt: record.createdAt, state: record.state, seats: record.settings.seats.length });
    setAlerts(alertsFromRecord(record.alerts));
    eventsRef.current = record.events; setEventState(record.events);
    revision.current = Math.max(revision.current, record.revision);
    sessionGap.current = record.settings.movement.max_gap;
  }
  async function fetchRecord(id: string, signal?: AbortSignal): Promise<LiveSessionRecord> {
    const response = await fetch(`/api/camera/sessions/${encodeURIComponent(id)}`, { cache: 'no-store', signal: signal ?? AbortSignal.timeout(15_000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The session could not be loaded.');
    return data.record as LiveSessionRecord;
  }
  function showRecord(id: string, record: LiveSessionRecord) {
    recordIdRef.current = id; setRecordId(id); applyRecord(record);
  }
  /**
   * Reloads the full record. While the frame loop runs, it is queued as a command so no frame is in
   * flight and the record's event list lines up with the events appended from later frames.
   */
  function reloadRecord() {
    const current = run.current;
    const id = current?.recordId;
    if (!current || !id) {
      // A stopped, interrupted or reopened session: no frames are in flight, so load it directly.
      const saved = recordIdRef.current;
      if (!saved) return;
      void fetchRecord(saved).then(record => { if (mounted.current && recordIdRef.current === saved) applyRecord(record); })
        .catch(() => { if (mounted.current) setMarkMessage('Alerts could not reload: reopen the session from Past sessions.'); });
      return;
    }
    if (reloadQueued.current) return;
    reloadQueued.current = true;
    current.commands.push(async () => {
      reloadQueued.current = false;
      try { const record = await fetchRecord(id, current.controller.signal); if (isCurrent(current)) applyRecord(record); }
      catch { if (isCurrent(current)) setMarkMessage('Alerts could not reload. They will retry after the next change.'); }
    });
  }
  function announce(text: string) { setAnnouncement(previous => previous === text ? `${text}\u00a0` : text); }
  function setMuted(next: boolean) { mutedRef.current = next; setMutedState(next); writeMuted(next); }
  function resetDashboard() {
    recordIdRef.current = null; recordStateRef.current = null; recovery.reset();
    setRecordId(null); setAlerts({}); eventsRef.current = []; setEventState([]); setSeatStates(undefined); setSessionTime(0);
    revision.current = 0; reloadQueued.current = false; frameTimes.current = []; setRunning(runningStatus([], 0, 1));
    setMarkMessage(''); setAnnouncement('');
  }

  function onMonitorFrame(result: MonitorFrame) {
    setSaveError(result.saveError ?? '');
    if (typeof result.sessionTime === 'number') {
      const time = result.sessionTime;
      frameTimes.current = pruneFrameTimes([...frameTimes.current, time], time);
      setSessionTime(time);
      setRunning(runningStatus(frameTimes.current, time, sessionGap.current));
    }
    setSeatStates(result.seats);
    if (result.events?.length) { eventsRef.current = [...eventsRef.current, ...result.events]; setEventState(eventsRef.current); }
    const { alerts: next, opened } = mergeAlerts(alertsRef.current, result.alerts ?? []);
    if (next !== alertsRef.current) setAlerts(next);
    if (opened.length) { if (!mutedRef.current) chime.current?.play(); announce(announceAlerts(opened)); }
    // Marks from another tab raise the revision without appearing in this tab's frames.
    if (typeof result.revision === 'number' && result.revision > revision.current) reloadRecord();
    if (result.notice) setNotice(result.notice);
    if (result.state === 'interrupted') leaveRef.current(LOST_REASON);
    else if (result.state && result.state !== 'monitoring') { setNotice(result.notice ?? 'Monitoring has ended.'); void stop(); }
  }

  async function markAlert(alert: LiveAlert, mark: AlertMark, note: string) {
    if (!recordId) return;
    setMarkMessage('');
    try {
      const response = await fetch(`/api/camera/sessions/${encodeURIComponent(recordId)}/alerts/${encodeURIComponent(alert.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mark, note, revision: revision.current }),
        signal: AbortSignal.timeout(15_000) });
      const data = await response.json().catch(() => ({}));
      if (!mounted.current) return;
      if (response.status === 409) { setMarkMessage(CONFLICT_TEXT); reloadRecord(); return; }
      if (!response.ok) { setMarkMessage(`The alert could not be marked. Press ${mark === 'Checked' ? 'Checked' : 'Dismiss'} again.`); return; }
      revision.current = Math.max(revision.current, data.revision);
      setAlerts(withAlert(alertsRef.current, data.alert as LiveAlert));
      if (data.saveError) setSaveError(data.saveError);
    } catch {
      if (mounted.current) setMarkMessage(`Ocular could not be reached. Press ${mark === 'Checked' ? 'Checked' : 'Dismiss'} again.`);
    }
  }

  const maxGap = gapOverride ?? measured?.maxGap ?? chooseMaxGap([]).maxGap;
  const movement = { ...cameraMovement(maxGap), ...rules };
  let validation = '';
  if (phase === 'found' && seats.length) {
    const rulesProblem = movementProblem(movement);
    if (rulesProblem) validation = `Check Advanced settings: ${rulesProblem}`;
    else {
      try { validateReviewSettings({ method: 'baseline', mirrored, tileGrid, seats: seatsForMonitor(seats, mirrored), movement }); }
      catch (problem) { validation = `Check Advanced settings: ${(problem as Error).message}`; }
    }
  }

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/analyze', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not check the local processor.');
      if (mounted.current) { setStatus(data); setError(''); }
    } catch (problem) {
      if (mounted.current) { setStatus(null); showProblem(describeProblem(problem, 'Ocular could not be reached. Make sure it is running, then press Recheck.')); }
    }
    finally { if (mounted.current) setChecking(false); }
  }, []);

  /**
   * Ends this run in the browser: stops capture and releases the camera. The server is not told. With
   * `abort` false the in-flight request is left to finish (the caller aborts it later).
   */
  const release = useCallback((current: Run, abort = true) => {
    if (run.current === current) run.current = null;
    current.active = false; if (abort) current.controller.abort(); current.commands.length = 0;
    current.stream?.getTracks().forEach(track => track.stop());
    if (video.current) video.current.srcObject = null;
    health.current = null;
  }, []);

  /** After Stop or End session: the saved record (alerts, marks and final state) for the ended view. */
  const loadEnded = useCallback(async (id: string) => {
    try { const record = await fetchRecord(id); if (mounted.current && phaseRef.current === 'ended') showRecord(id, record); }
    catch { /* the alerts already shown stay; Open the session from Past sessions to reload it */ }
  }, []);

  const stop = useCallback(async () => {
    const current = run.current;
    if (!current) return;
    // While monitoring, the in-flight frame request is aborted only after the server has the Stop: aborting it
    // first could close the worker and leave the record interrupted instead of ended.
    const keepFrame = !!current.recordId || !!current.monitorPending;
    release(current, !keepFrame);
    if (mounted.current) { setStoppedFrom(setupStep(phaseRef.current)); go('stopping'); setWarnings([]); setEditing(null); setRequesting(''); }
    try {
      // A Start monitoring request already with the server may still create the record; wait, then stop that record.
      if (current.monitorPending) await current.monitorPending;
      if (current.sessionId) {
        const outcome = await stopSession(current.sessionId, current.recordId);
        // A preview has nothing to save; a monitored session keeps Stop available until it is saved.
        if (!outcome.ok && current.recordId) { if (mounted.current) { setStopRetry(current.sessionId); setError(outcome.message, outcome.detail); } return; }
      }
    } finally { current.controller.abort(); }
    const monitored = !!current.recordId;
    if (mounted.current && !run.current) {
      if (!monitored) { setHasFrame(false); go('idle'); return; }
      go('ended'); void loadEnded(current.recordId!);
    }
  }, [go, release, loadEnded]);

  async function retryStop() {
    if (!stopRetry || retrying) return;
    setError(''); setRetrying(true);
    const outcome = await stopSession(stopRetry, recordIdRef.current ?? undefined);
    if (!mounted.current) return;
    setRetrying(false);
    if (outcome.ok) { setStopRetry(null); go('ended'); if (recordIdRef.current) void loadEnded(recordIdRef.current); } else setError(outcome.message, outcome.detail);
  }

  /**
   * Frames stopped without Stop while monitoring (hidden tab, camera disconnected, processing error): the camera
   * is released and the record is left `interrupted` on the server so it can be resumed.
   */
  async function pause(reason: string) {
    const current = run.current;
    const id = current?.recordId;
    if (!current || !id) return;
    release(current);
    pausedSession.current = current.sessionId ?? null;
    if (mounted.current) {
      setStoppedAt(new Date()); setPauseReason(reason); setWarnings([]); setRequesting(''); setConfirm(''); setHasFrame(false);
      go('interrupted');
    }
    if (current.sessionId) await interruptSession(current.sessionId);
    if (!mounted.current) return;
    try {
      const record = await fetchRecord(id);
      if (!mounted.current || recordIdRef.current !== id || phaseRef.current !== 'interrupted') return;
      applyRecord(record);
      // The server ended it meanwhile (for example the 3-hour limit), so it cannot be resumed.
      if (record.state === 'ended') { setPauseReason(''); go('ended'); }
    } catch { /* the alerts already shown stay */ }
  }

  /** Leaving the resume check (No, hidden tab, camera error): back to the interrupted view; the record stays interrupted. */
  function cancelResume(reason = '') {
    const current = run.current;
    if (current) {
      release(current);
      // A worker started for this resume is paused again, so the record stays interrupted.
      if (current.sessionId) void interruptSession(current.sessionId);
    }
    setResumeStep(''); setHasFrame(false); setPauseReason(reason);
    if (recordIdRef.current && recordStateRef.current === 'interrupted') go('interrupted'); else { if (reason) setError(reason); go('idle'); }
  }

  /** Hidden tab, page closed, camera unplugged or unmount: pause a monitored session, otherwise stop as before. */
  function leave(reason?: string) {
    const next = leaveAction(run.current);
    if (next === 'pause') void pause(reason ?? HIDDEN_REASON);
    else if (next === 'cancel-resume') cancelResume(reason ?? HIDDEN_REASON);
    else if (next === 'stop') { if (reason && mounted.current) setError(reason); void stop(); }
  }
  leaveRef.current = leave;

  useEffect(() => {
    mounted.current = true; void check();
    // How to use Ocular opens by itself the first time this browser shows the camera screen.
    if (!readGuideSeen()) { writeGuideSeen(); setGuideOpen(true); }
    mutedRef.current = readMuted(); setMutedState(mutedRef.current);
    const saved = readSavedDevice();
    const updateDevices = () => {
      void navigator.mediaDevices?.enumerateDevices().then(list => {
        if (!mounted.current) return;
        const cameras = list.filter(item => item.kind === 'videoinput');
        setDevices(cameras);
        setDevice(current => pickDevice(current, saved, cameras.map(item => item.deviceId).filter(Boolean)));
      }).catch(() => {});
    };
    updateDevices();
    const hide = () => { if (document.hidden) leaveRef.current(); };
    const leavePage = () => { leaveRef.current(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leavePage);
    navigator.mediaDevices?.addEventListener('devicechange', updateDevices);
    return () => {
      mounted.current = false; leaveRef.current();
      chime.current?.close(); chime.current = null;
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leavePage);
      navigator.mediaDevices?.removeEventListener('devicechange', updateDevices);
    };
  }, [check]);

  // Monitoring starts with the dashboard at the top of the window, so the live view and alerts are in sight.
  useEffect(() => { if (phase === 'monitoring') grid.current?.scrollIntoView({ block: 'start' }); }, [phase]);

  // When the screen changes, keyboard focus moves to its one primary button (Start monitoring, Stop, Resume…).
  const primaryKey = `${phase}:${resumeStep}:${phase === 'found' ? (setupError || !seats.length ? 'retry' : 'monitor') : ''}:${editing ? 'edit' : ''}:${recordId ?? ''}`;
  const primaryShown = useRef(primaryKey);
  useEffect(() => {
    if (primaryShown.current === primaryKey) return;
    primaryShown.current = primaryKey;
    if (editing) return; // the seat adjuster focuses its own heading
    if (document.activeElement?.closest('.camera-guide')) return; // someone is reading the guide
    // During a wait there is no primary button; the status line (what is happening) holds focus instead of the page.
    // Monitoring: focus the dashboard heading, not Stop, so a stray Enter or Space cannot end the live session.
    const target = (phase === 'monitoring' ? setupBody.current?.querySelector<HTMLElement>('#camera-monitor-title') : null)
      ?? setupBody.current?.querySelector<HTMLElement>('.camera-primary:not(:disabled)')
      ?? (setupBody.current?.contains(document.activeElement) || document.activeElement === document.body ? setupBody.current?.querySelector<HTMLElement>('.camera-status:not([hidden])') : null);
    target?.focus({ preventScroll: phase === 'monitoring' });
  }, [primaryKey, editing, phase]);
  // After an in-page confirmation closes without acting, focus returns to the button that opened it.
  useEffect(() => {
    if (!focusNext.current) return;
    setupBody.current?.querySelector<HTMLElement>(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const live = phase === 'preparing' || phase === 'found' || phase === 'monitoring';
  useEffect(() => {
    if (!live) return;
    let previewTime = video.current?.currentTime;
    const quality = document.createElement('canvas'); quality.width = 32; quality.height = 18;
    const qualityContext = quality.getContext('2d', { willReadFrequently: true });
    const timer = setInterval(() => {
      const sample = health.current; if (!sample) return;
      const now = performance.now();
      const next = video.current?.currentTime;
      if (next !== undefined && next !== previewTime) { sample.previewAdvancedAt = now; previewTime = next; }
      if (qualityContext && video.current && video.current.readyState >= 2) {
        qualityContext.drawImage(video.current, 0, 0, 32, 18);
        const lowDetail = lowDetailImage(qualityContext.getImageData(0, 0, 32, 18).data);
        sample.lowDetailSince = lowDetail ? (sample.lowDetailSince ?? now) : null;
      }
      setWarnings(cameraWarnings(sample, now));
    }, 1000);
    return () => clearInterval(timer);
  }, [live]);

  async function findSeats(current: Run) {
    setRequesting('setup');
    try {
      const response = await fetch(`/api/camera/${current.sessionId}/setup`, { method: 'POST', signal: current.controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Seats could not be found.');
      if (!isCurrent(current)) return;
      setSeats(numberSeats(data.seats as ReviewSeat[])); setSeatsEdited(false); setSetupError('');
    } catch {
      if (!isCurrent(current)) return;
      setSeats([]); setSetupError('Press Try again, or draw the seats yourself.');
    } finally {
      if (isCurrent(current)) { setMeasured(chooseMaxGap(current.progress.intervals)); setRequesting(''); go('found'); }
    }
  }

  function tryAgain() {
    const current = run.current;
    if (!current || phaseRef.current !== 'found') return;
    current.progress = newSetupProgress(); current.setupQueued = false;
    setSeats([]); setSetupError(''); setReceived(0); setError(''); setEditing(null);
    go('preparing');
  }

  function openEditor() {
    const current = run.current;
    if (!current || !current.still.width) return;
    setError('');
    setEditing({ image: current.still.toDataURL('image/jpeg', .9) });
  }

  function startMonitoring() {
    const current = run.current;
    if (!current || phaseRef.current !== 'found' || requesting || !seats.length || validation) return;
    const body = JSON.stringify({ seats: seatsForMonitor(seats, mirrored), movement, maxGapAuto: gapOverride === null, exam });
    setRequesting('monitor'); setError('');
    // This click is the user gesture browsers require before the alert sound can play.
    chime.current ??= new Chime(); chime.current.unlock();
    current.commands.push(async () => {
      let settle!: () => void;
      current.monitorPending = new Promise(resolve => { settle = resolve; });
      try {
        // Not tied to the run's abort signal: if Stop is pressed meanwhile, Stop waits for this answer and ends the record.
        const response = await fetch(`/api/camera/${current.sessionId}/monitor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(65_000) });
        const data = await response.json();
        if (!response.ok) throw new PlainError(MONITOR_FAILED, data.error || '');
        current.recordId = data.recordId;
        if (!isCurrent(current)) return;
        resetDashboard(); showRecord(data.recordId, data.record as LiveSessionRecord);
        // The full record, loaded between frames so its events line up with later frames.
        try { const record = await fetchRecord(data.recordId, current.controller.signal); if (isCurrent(current)) applyRecord(record); }
        catch { /* the record returned by Start monitoring is already shown */ }
        if (!isCurrent(current)) return;
        go('monitoring');
      } catch (problem) {
        if (isCurrent(current)) showProblem(describeProblem(problem, MONITOR_FAILED));
      } finally {
        current.monitorPending = undefined; settle();
        if (isCurrent(current)) setRequesting('');
      }
    });
  }

  function newSession() {
    setSeats([]); setSeatsEdited(false); setHasFrame(false); setNotice(''); setError(''); setSaveError(''); setMeasured(null);
    resetDashboard(); pausedSession.current = null;
    setPastKey(key => key + 1);
    go('idle');
  }

  /** Opens the chosen camera into the hidden video element; a disconnect pauses a monitored session. */
  async function openCamera(current: Run): Promise<MediaStream> {
    const valid = () => isCurrent(current);
    if (!navigator.mediaDevices?.getUserMedia) throw new PlainError('Open Ocular at http://127.0.0.1:3000 in Chrome, Edge or Firefox to use the camera.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, ...(device ? { deviceId: { exact: device } } : {}) } });
    if (!valid()) { stream.getTracks().forEach(track => track.stop()); throw new DOMException('Camera start cancelled.', 'AbortError'); }
    current.stream = stream;
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      if (!valid()) return;
      const again = leaveAction(current) === 'stop' ? 'Start' : 'Resume';
      leaveRef.current(`The camera disconnected. Reconnect it, then press ${again}${again === 'Start' ? ' again' : ''}.`);
    }, { once: true }));
    stream.getVideoTracks().forEach(track => {
      track.addEventListener('mute', () => { if (valid() && health.current) health.current.muted = true; });
      track.addEventListener('unmute', () => { if (valid() && health.current) health.current.muted = false; });
    });
    const used = stream.getVideoTracks()[0]?.getSettings().deviceId;
    if (used) { writeSavedDevice(used); setDevice(used); }
    if (!video.current) throw new PlainError('The camera picture could not open. Press Start again.');
    video.current.srcObject = stream;
    await video.current.play();
    void navigator.mediaDevices.enumerateDevices().then(list => { if (valid()) setDevices(list.filter(item => item.kind === 'videoinput')); }).catch(() => {});
    return stream;
  }

  /** The frame loop for a run whose worker is ready; it returns when the run is released. */
  function capture(current: Run, stream: MediaStream) {
    if (!output.current || !video.current) throw new PlainError('Open Ocular in Chrome, Edge or Firefox to use the camera.');
    return runCaptureLoop({ run: current, video: video.current, target: output.current, stream, health, valid: () => isCurrent(current),
      phase: () => phaseRef.current, seats: () => seatsRef.current,
      overlay: () => ({ highlighted: openAlertSeats(alertsRef.current) }),
      onDrawn: () => setHasFrame(true),
      onSetupReceived: setReceived,
      onSetupComplete: () => { current.commands.push(() => findSeats(current)); },
      onMonitorFrame,
    });
  }

  /** A frame-loop failure: a monitored session is paused (resumable); before monitoring the camera stops as before. */
  async function captureFailed(current: Run, problem: unknown) {
    if (!isCurrent(current)) return;
    if (leaveAction(current) === 'pause') await pause(LOST_REASON);
    else { showProblem(cameraProblem(problem)); await stop(); }
  }

  async function start() {
    if (run.current || !ready) return;
    setError(''); setNotice(''); setSaveError(''); setWarnings([]); setSeats([]); setSeatsEdited(false); setSetupError('');
    setEditing(null); setMeasured(null); setHasFrame(false); setReceived(0); setStopRetry(null); resetDashboard(); pausedSession.current = null;
    go('permission');
    const current = newRun();
    run.current = current;
    const valid = () => isCurrent(current);
    try {
      const stream = await openCamera(current);
      if (!valid()) return;
      go('loading');
      const response = await fetch('/api/camera', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mirrored, tileGrid, headTurns }), signal: AbortSignal.any([current.controller.signal, AbortSignal.timeout(65_000)]) });
      const data = await response.json();
      if (!response.ok) throw new PlainError('The camera could not start. Press Start again.', data.error || '');
      current.sessionId = data.sessionId;
      if (!valid()) { await stopSession(data.sessionId); return; }
      go('preparing');
      await capture(current, stream);
    } catch (problem) { await captureFailed(current, problem); }
  }

  // While asking whether the seats still line up, the live camera is drawn with the saved seat boxes (no processing yet).
  useEffect(() => {
    if (phase !== 'confirming') return;
    let handle = 0;
    const paint = () => {
      const source = video.current, target = output.current, context = target?.getContext('2d');
      if (source && target && context && source.readyState >= 2 && source.videoWidth) {
        if (target.width !== source.videoWidth || target.height !== source.videoHeight) { target.width = source.videoWidth; target.height = source.videoHeight; }
        context.drawImage(source, 0, 0, target.width, target.height);
        drawSeatBoxes(context, seatsRef.current, target.width, target.height);
        setHasFrame(true);
      }
      handle = requestAnimationFrame(paint);
    };
    handle = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(handle);
  }, [phase]);

  const statusText = phase === 'permission' ? 'Starting camera… allow access if asked.'
    : phase === 'loading' ? 'Starting camera…'
    : phase === 'preparing' ? (requesting === 'setup' ? 'Numbering seats…' : preparingText(received))
    : phase === 'found' && requesting === 'monitor' ? 'Starting monitoring…'
    : phase === 'stopping' ? (stopRetry ? (retrying ? 'Saving…' : 'Not saved yet') : 'Stopping and saving…')
    : phase === 'confirming' ? (resumeStep === 'loading' ? 'Loading…' : resumeStep === 'camera' ? 'Starting camera… allow access if asked.'
      : resumeStep === 'starting' ? 'Resuming…' : action === 'end' ? 'Ending…' : '')
    : action === 'end' ? 'Ending…' : action === 'open' ? 'Opening…' : action === 'delete' ? 'Deleting…'
    : '';
  const waiting = phase === 'permission' || phase === 'loading' || phase === 'preparing' || (phase === 'stopping' && (!stopRetry || retrying)) || requesting === 'monitor'
    || (phase === 'confirming' && resumeStep !== 'ask') || !!action;
  const monitoring = phase === 'monitoring';
  /** A saved session shown without a live view: interrupted, ended or reopened from Past sessions. */
  const saved = (phase === 'interrupted' || phase === 'ended') && !!recordId;
  const alertList = Object.values(alerts);
  const unmarked = alertList.filter(alert => alert.mark === null).length;
  const sessionLine = recordMeta && <p className="session-line">Started {formatSessionDate(recordMeta.createdAt)} · {countText(recordMeta.seats, 'seat')} · {alertSummary(alertList.length, unmarked)}</p>;
  const pdf = (primary: boolean) => recordId && <PdfReportDownload url={reportUrl(recordId)} filename={reportFilename(recordMeta?.createdAt ?? '')}
    variant={primary ? 'default' : 'outline'} size={primary ? 'lg' : 'default'} buttonClassName={primary ? 'camera-primary' : undefined} />;
  const sortedAlerts = sortAlerts(alerts);
  const openSeats = openAlertSeats(alerts);
  const longSession = longSessionWarning(sessionTime);
  const details = <>
        {live && <section className={`camera-health${warnings.length ? ' camera-health-warning' : ''}`} aria-label="Camera checks" role="status"><h3>Camera checks</h3>{warnings.length ? <ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : <p>No problems.</p>}</section>}

        <CameraAdvancedSettings inputLocked={busy} rulesLocked={phase === 'monitoring' || phase === 'stopping' || phase === 'ended' || !!requesting}
          mirrored={mirrored} onMirrored={setMirrored} tileGrid={tileGrid} onTileGrid={setTileGrid} headTurns={headTurns} onHeadTurns={setHeadTurns}
          rules={rules} onRules={setRules} gapOverride={gapOverride} onGapOverride={setGapOverride} measured={measured} />
        <p className="camera-note">No video is recorded; each alert keeps one photo on this computer.</p>
  </>;
  const cameraName = (item: MediaDeviceInfo, index: number) => item.label || `Camera ${index + 1}`;
  const seatCount = countText(seats.length, 'seat');
  const foundTitle = setupError ? 'Seats could not be found' : !seats.length ? 'No students found' : seatsEdited ? `${seatCount} ready` : `Found ${seatCount}`;
  /** Why Start or Resume is unavailable, shown next to the disabled button. */
  const notReadyText = checking ? 'Checking this computer…' : !ready ? 'Finish the setup above, then press Recheck.' : '';

  return <>
    <div className="camera-screen-bar">
      <p>Alerts stay on this laptop.</p>
      <div className="camera-screen-tools">
        {processorReady && <span className="camera-ready-chip" role="status"><span className="status-dot" aria-hidden="true" />{checking ? 'Checking…' : 'Ready'}
          <button type="button" onClick={check} disabled={busy || checking} aria-label="Recheck local processor" title="Recheck"><RefreshCw size={14} aria-hidden="true" className={checking ? 'spin' : undefined} /></button></span>}
        <Button ref={guideButton} variant="outline" className="camera-guide-button" aria-haspopup="dialog" onClick={() => setGuideOpen(true)}>
          <CircleHelp size={16} aria-hidden="true" />How to use</Button>
      </div>
    </div>
    <CameraGuide open={guideOpen} onClose={() => setGuideOpen(false)} returnFocus={guideButton} announcement={announcement} />
    {/* The full banner only when something needs attention; once ready, the small chip above says so. */}
    {!processorReady && <div className="backend-banner" role="status"><Camera size={20} /><div><strong>{checking ? 'Checking this computer' : 'Python setup needed'}</strong><p>{checking ? 'One moment…' : status?.methods.baseline.message || 'Follow the README setup, then press Recheck.'}</p></div><button type="button" onClick={check} disabled={busy || checking} aria-label="Recheck local processor"><RefreshCw size={15} /><span>Recheck</span></button></div>}
    <div ref={grid} className={`analysis-grid camera-grid${monitoring ? ' camera-dashboard' : ''}`}>
      <section className="workspace-card camera-setup" aria-labelledby="camera-setup-title"><div className="workspace-card-header"><h2 id="camera-setup-title">Live camera</h2><span>ON THIS COMPUTER</span></div><div className="input-card-body" ref={setupBody}>
        <SetupSteps phase={phase} stoppedFrom={stoppedFrom} />
        <p className="sr-only" role="status">{phase === 'found' && !editing ? foundTitle : ''}</p>

        {(phase === 'idle' || phase === 'permission' || phase === 'loading') && <>
          <div className="analysis-settings"><label htmlFor="camera-device">Camera</label><div className="select-wrap"><select id="camera-device" value={device} disabled={busy} onChange={event => { setDevice(event.target.value); writeSavedDevice(event.target.value); }}><option value="">Default camera</option>{devices.filter(item => item.deviceId).map((item, index) => <option key={item.deviceId} value={item.deviceId}>{cameraName(item, index)}</option>)}</select></div>
            <p>Pick the phone. Ocular remembers it.</p></div>
          <AboutThisExam idPrefix="camera" exam={exam} onExam={setExam} disabled={busy} />
          <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={start} disabled={busy || !ready} aria-describedby={!busy && notReadyText ? 'camera-start-blocked' : undefined}>{busy ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}Start</Button></div>
          {!busy && notReadyText && <p className="setup-blocked" id="camera-start-blocked">{notReadyText}</p>}
        </>}

        {phase === 'preparing' && <div className="setup-panel">
          <p className="setup-lead">Keep the camera still for about 5 seconds.</p>
          <div className="camera-actions"><Button variant="outline" onClick={() => void stop()}><Square size={15} />Stop camera</Button></div>
        </div>}

        {phase === 'found' && !editing && <div className="setup-panel">
          {setupError || !seats.length ? <>
            <h3 className="setup-title">{foundTitle}</h3>
            <p className="setup-lead">{setupError || 'Show every desk and light the faces, then try again.'}</p>
            <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={tryAgain}><RefreshCw size={16} />Try again</Button></div>
            <div className="setup-secondary"><Button variant="outline" onClick={openEditor}>Draw seats myself</Button></div>
          </> : <>
            <h3 className="setup-title">{foundTitle}</h3>
            <p className="setup-lead">Numbered left to right. Wrong or missing? Press Adjust seats.</p>
            {measured?.tooSlow && <p className="setup-warning" role="note">{tileGrid > 1 ? 'Too slow for alerts: press Stop camera, pick fewer tiles in Advanced settings, then Start.' : 'Too slow for alerts: close other programs, then press Stop camera and Start.'}</p>}
            {validation && <p className="setup-warning" role="status">{validation}</p>}
            <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={startMonitoring} disabled={!!requesting || !!validation}>{requesting === 'monitor' ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}Start monitoring</Button></div>
            <div className="setup-secondary"><Button variant="outline" onClick={openEditor} disabled={!!requesting}>Adjust seats</Button><Button variant="outline" onClick={tryAgain} disabled={!!requesting}>Find seats again</Button></div>
          </>}
          <button type="button" className="setup-link" onClick={() => void stop()} disabled={!!requesting}>Stop camera</button>
        </div>}

        {phase === 'found' && editing && <p className="setup-lead">Fix the boxes, then press Use these seats.</p>}

        {monitoring && <div className="setup-panel monitor-bar">
          <div className="monitor-bar-text">
            <h3 className="setup-title" id="camera-monitor-title" tabIndex={-1}>Monitoring {seats.length} seat{seats.length === 1 ? '' : 's'}</h3>
            <SeatStatusLine status={running} observed={seatsObserved(seats.map(seat => seat.id), seatStates)} total={seats.length} sessionTime={sessionTime} />
            <p className="setup-lead">Keep this tab open. Press Stop when the exam ends.</p>
          </div>
          <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={() => void stop()}><Square size={16} />Stop</Button></div>
          {(notice || longSession || saveError || warnings.length > 0) && <div className="monitor-banners">
            {notice && <p className="setup-warning" role="status">{notice}</p>}
            {longSession && <p className="setup-warning" role="status">{longSession}</p>}
            {saveError && <p className="save-warning" role="status" title={saveError}>{SAVE_WARNING_TEXT}</p>}
            {warnings.length > 0 && <div className="setup-warning" role="status"><strong>Camera: </strong>{warnings.join(' ')}</div>}
          </div>}
        </div>}

        {phase === 'stopping' && stopRetry && <div className="setup-panel">
          <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={() => void retryStop()} disabled={retrying}>{retrying ? <LoaderCircle size={16} className="spin" /> : <Square size={16} />}Stop</Button></div>
        </div>}

        {phase === 'interrupted' && <div className="setup-panel">
          <h3 className="setup-title">Session interrupted</h3>
          <p className="setup-lead" role="status">{interruptionText(stoppedAt ?? new Date())}</p>
          {pauseReason && <p className="setup-warning" role="note">{pauseReason}</p>}
          {sessionLine}
          <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={() => recordId && void beginResume(recordId)} disabled={!recordId || !!action || !ready}
            aria-describedby={notReadyText ? 'camera-resume-blocked' : undefined}><Play size={16} />Resume</Button></div>
          {notReadyText && <p className="setup-blocked" id="camera-resume-blocked">{notReadyText}</p>}
          {confirm === 'end'
            ? <InlineConfirm text={END_CONFIRM_TEXT} confirmLabel="End session" cancelLabel="Keep it" busy={action === 'end'} busyLabel="Ending…"
                onConfirm={() => void endSession()} onCancel={() => { setConfirm(''); focusNext.current = '[data-focus="end-session"]'; }} />
            : <div className="setup-secondary"><Button variant="outline" data-focus="end-session" onClick={() => setConfirm('end')} disabled={!!action}><Square size={15} />End session</Button>{pdf(false)}</div>}
          <button type="button" className="setup-link" onClick={newSession} disabled={!!action}>Back to past sessions</button>
        </div>}

        {phase === 'confirming' && <div className="setup-panel">
          <h3 className="setup-title">{resumeStep === 'ask' || resumeStep === 'starting' ? SEATS_QUESTION : 'Resuming'}</h3>
          {(resumeStep === 'ask' || resumeStep === 'starting') && <>
            <p className="setup-lead">Each box should sit on its desk. If the camera moved, end the session.</p>
            <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={() => void confirmResume()} disabled={resumeStep === 'starting' || !!action}>
              {resumeStep === 'starting' ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Yes, resume</Button></div>
            <div className="setup-secondary"><Button variant="outline" onClick={() => void endSession()} disabled={resumeStep === 'starting' || !!action}><X size={15} />No, end this session</Button></div>
          </>}
          <button type="button" className="setup-link" onClick={() => cancelResume()} disabled={resumeStep === 'starting' || !!action}>Not now</button>
        </div>}

        {phase === 'ended' && <div className="setup-panel">
          <h3 className="setup-title">{recordMeta?.state === 'monitoring' ? 'This session is live' : 'Monitoring stopped'}</h3>
          <p className="setup-lead">{recordMeta?.state === 'monitoring'
            ? 'Open in another tab: stop it there. You can mark alerts here.'
            : `${notice ? `${notice} ` : ''}Mark any alerts left, then download the PDF.`}</p>
          {sessionLine}
          {recordId && <div className="camera-actions">{pdf(true)}</div>}
          {confirm === 'delete'
            ? <InlineConfirm text={DELETE_CONFIRM_TEXT} confirmLabel="Delete" cancelLabel="Keep" busy={action === 'delete'} busyLabel="Deleting…"
                onConfirm={() => void deleteCurrent()} onCancel={() => { setConfirm(''); focusNext.current = '[data-focus="delete-session"]'; }} />
            : <div className="setup-secondary"><Button variant="outline" onClick={newSession} disabled={!!action}><Play size={15} />New session</Button>
              {recordId && recordMeta?.state !== 'monitoring' && <Button variant="outline" data-focus="delete-session" onClick={() => setConfirm('delete')} disabled={!!action}><Trash2 size={15} />Delete session</Button>}</div>}
        </div>}

        <p className="camera-status" role="status" tabIndex={-1} hidden={monitoring && !statusText}>{waiting ? <LoaderCircle size={14} className="spin" /> : null}{statusText}</p>
        {error.text && <div className="analysis-error" role="alert"><AlertCircle size={17} /><div className="analysis-error-text"><span>{error.text}</span>
          {error.detail && <details className="error-detail"><summary>More information</summary><p>{error.detail}</p></details>}</div></div>}
        {!monitoring && phase !== 'interrupted' && phase !== 'confirming' && phase !== 'ended' && details}
        {(phase === 'idle' || phase === 'ended') && <a className="setup-link recording-link" href="/analyze?mode=video">Review a recording</a>}
        <p className="result-disclaimer">Alerts are prompts, not proof.</p>
      </div></section>

      <section className="workspace-card camera-output" aria-labelledby="camera-view-title" hidden={saved}><div className="workspace-card-header"><h2 id="camera-view-title">Live view</h2><span>{phase === 'monitoring' ? 'MONITORING' : live || phase === 'confirming' ? 'LIVE' : 'NOT LIVE'}</span></div><div className="results-body">
        <video ref={video} className="camera-source" muted playsInline aria-hidden="true" tabIndex={-1} />
        {editing && <SeatAdjuster image={editing.image} initial={seats}
          onSave={next => { setSeats(numberSeats(next)); setSeatsEdited(true); setSetupError(''); setEditing(null); }}
          onCancel={() => setEditing(null)} />}
        <div className="camera-processed" hidden={!!editing}>
          <canvas ref={output} hidden={!hasFrame} role="img" aria-label={seats.length && (phase === 'found' || phase === 'confirming' || monitoring) ? `Live camera view with ${seats.length} numbered seat boxes${monitoring ? '; seats with an alert are outlined in orange' : phase === 'confirming' ? ' from the saved session' : ''}` : 'Live camera view'} />
          {!hasFrame && <div className="camera-placeholder"><Camera size={32} /><p>{phase === 'idle' ? 'Press Start to open the camera.' : statusText || 'The camera picture appears here.'}</p></div>}
        </div>
        {monitoring && <CameraSeatGrid seats={seats} states={seatStates} openSeats={openSeats} status={running} />}
      </div></section>
      {(monitoring || saved) && <CameraAlertsPanel recordId={recordId} alerts={sortedAlerts} events={events} muted={muted} onMuted={setMuted}
        onMark={markAlert} message={markMessage} announcement={announcement} live={monitoring} />}
      {monitoring && <details className="workspace-card monitor-details">
        <summary>Details</summary>
        <div className="input-card-body">{details}</div>
      </details>}
    </div>
    {phase === 'idle' && <CameraPastSessions refreshKey={pastKey} onOpen={id => void openRecord(id)} onResume={id => void beginResume(id)} disabled={!!action} />}
  </>;
}
