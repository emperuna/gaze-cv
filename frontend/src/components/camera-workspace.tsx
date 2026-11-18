"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, Check, LoaderCircle, Play, RefreshCw, Square, Trash2, X } from 'lucide-react';
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
import { DEFAULT_MOVEMENT, validateReviewSettings } from '@/lib/review-contract';
import type { MovementEvent, ReviewSeat } from '@/lib/review-contract';
import { cameraMovement, newSetupProgress, numberSeats, pickDevice, readSavedDevice, seatsForMonitor, writeSavedDevice } from '@/lib/camera-setup';
import { CameraAdvancedSettings, SeatAdjuster, SetupSteps, drawSeatBoxes, preparingText } from './camera-setup';
import { interruptSession, newRun, runCaptureLoop, stopSession } from './camera-run';
import { CameraPastSessions, InlineConfirm, deleteSession } from './camera-past-sessions';
import { PdfReportDownload } from './pdf-report-download';
import {
  DELETE_CONFIRM_TEXT, END_CONFIRM_TEXT, SEATS_QUESTION, countText, displaySeats, formatSessionDate, interruptedAt, interruptionText,
  reportFilename, reportUrl, unmarkedText,
} from '@/lib/camera-sessions';
import type { MonitorFrame, Run } from './camera-run';
import { CameraAlertsPanel, Chime } from './camera-alerts-panel';
import { CameraSeatGrid, SeatStatusLine } from './camera-seat-grid';
import type { CameraPhase, MeasuredSpeed, MovementRules } from './camera-setup';

/** `action` is the button that tries again: Start for a new session, Resume for an interrupted one. */
function cameraError(error: unknown, action = 'Start') {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return `Camera access was denied. Allow the camera in your browser and system settings, then press ${action} again.`;
    if (error.name === 'NotFoundError') return `No camera was found. Connect the camera, then press ${action} again.`;
    if (error.name === 'NotReadableError') return `The camera could not open. Close other apps using it, then press ${action} again.`;
    if (error.name === 'OverconstrainedError') return `The selected camera is unavailable. Choose another camera, then press ${action} again.`;
  }
  return error instanceof Error ? error.message : `The camera stopped unexpectedly. Press ${action} again.`;
}

const HIDDEN_REASON = 'This tab was hidden or closed, so Ocular released the camera. Press Resume to continue.';
const LOST_REASON = 'Live processing stopped unexpectedly. Press Resume to continue.';
type RecordMeta = { createdAt: string; state: LiveSessionRecord['state']; seats: number };

const initialRules = (): MovementRules => { const { max_gap: _gap, ...rules } = DEFAULT_MOVEMENT; return rules; };

export function CameraWorkspace() {
  const [mirrored, setMirrored] = useState(false);
  const [tileGrid, setTileGrid] = useState(2);
  const [rules, setRules] = useState<MovementRules>(initialRules);
  const [gapOverride, setGapOverride] = useState<number | null>(null);
  const [measured, setMeasured] = useState<MeasuredSpeed | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState('');
  const [phase, setPhaseState] = useState<CameraPhase>('idle');
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
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
  // Interruptions, resume and saved sessions.
  const [recordMeta, setRecordMeta] = useState<RecordMeta | null>(null);
  const [stoppedAt, setStoppedAt] = useState<Date | null>(null);
  const [pauseReason, setPauseReason] = useState('');
  const [resumeStep, setResumeStep] = useState<'' | 'loading' | 'camera' | 'ask' | 'starting'>('');
  const [confirm, setConfirm] = useState<'' | 'end' | 'delete'>('');
  const [action, setAction] = useState<'' | 'end' | 'delete' | 'open'>('');
  const [pastKey, setPastKey] = useState(0);
  const recordIdRef = useRef<string | null>(null);
  const recordStateRef = useRef<LiveSessionRecord['state'] | null>(null);
  /** The worker paused from this tab; paused again before a resume in case it is still closing. */
  const pausedSession = useRef<string | null>(null);
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
  const health = useRef<CameraHealth | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const output = useRef<HTMLCanvasElement>(null);
  const run = useRef<Run | null>(null);
  const mounted = useRef(true);
  const phaseRef = useRef<CameraPhase>('idle');
  const seatsRef = useRef<ReviewSeat[]>([]);
  const busy = phase !== 'idle' && phase !== 'ended' && phase !== 'interrupted';
  const ready = !!status?.methods.baseline.ready && !checking;
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
        .catch(problem => { if (mounted.current) setMarkMessage(`The alerts could not be reloaded (${(problem as Error).message}). Open the session again.`); });
      return;
    }
    if (reloadQueued.current) return;
    reloadQueued.current = true;
    current.commands.push(async () => {
      reloadQueued.current = false;
      try { const record = await fetchRecord(id, current.controller.signal); if (isCurrent(current)) applyRecord(record); }
      catch (problem) { if (isCurrent(current)) setMarkMessage(`The alerts could not be reloaded (${(problem as Error).message}). They will reload after the next change.`); }
    });
  }
  function announce(text: string) { setAnnouncement(previous => previous === text ? `${text}\u00a0` : text); }
  function setMuted(next: boolean) { mutedRef.current = next; setMutedState(next); writeMuted(next); }
  function resetDashboard() {
    recordIdRef.current = null; recordStateRef.current = null; setRecordMeta(null); setStoppedAt(null); setPauseReason(''); setConfirm(''); setResumeStep('');
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
      if (!response.ok) { setMarkMessage(`${data.error || 'The alert could not be marked.'} Press ${mark === 'Checked' ? 'Checked' : 'Dismiss'} again.`); return; }
      revision.current = Math.max(revision.current, data.revision);
      setAlerts(withAlert(alertsRef.current, data.alert as LiveAlert));
      if (data.saveError) setSaveError(data.saveError);
    } catch {
      if (mounted.current) setMarkMessage(`Ocular could not be reached to mark the alert. Press ${mark === 'Checked' ? 'Checked' : 'Dismiss'} again.`);
    }
  }

  const maxGap = gapOverride ?? measured?.maxGap ?? chooseMaxGap([]).maxGap;
  const movement = { ...cameraMovement(maxGap), ...rules };
  let validation = '';
  if (phase === 'found' && seats.length) {
    try { validateReviewSettings({ method: 'baseline', mirrored, tileGrid, seats: seatsForMonitor(seats, mirrored), movement }); }
    catch (problem) { validation = `Check Advanced settings: ${(problem as Error).message}`; }
  }

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/analyze', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not check the local processor.');
      if (mounted.current) { setStatus(data); setError(''); }
    } catch (problem) { if (mounted.current) { setStatus(null); setError(cameraError(problem)); } }
    finally { if (mounted.current) setChecking(false); }
  }, []);

  /** Ends this run in the browser: stops capture and releases the camera. The server is not told. */
  const release = useCallback((current: Run) => {
    if (run.current === current) run.current = null;
    current.active = false; current.controller.abort(); current.commands.length = 0;
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
    release(current);
    if (mounted.current) { go('stopping'); setWarnings([]); setEditing(null); setRequesting(''); }
    // A Start monitoring request already with the server may still create the record; wait, then stop that record.
    if (current.monitorPending) await current.monitorPending;
    const monitored = !!current.recordId;
    if (current.sessionId) {
      const outcome = await stopSession(current.sessionId);
      // A preview has nothing to save; a monitored session keeps Stop available until it is saved.
      if (!outcome.ok && monitored) { if (mounted.current) { setStopRetry(current.sessionId); setError(outcome.message); } return; }
    }
    if (mounted.current && !run.current) {
      if (!monitored) { setHasFrame(false); go('idle'); return; }
      go('ended'); void loadEnded(current.recordId!);
    }
  }, [go, release, loadEnded]);

  async function retryStop() {
    if (!stopRetry || retrying) return;
    setError(''); setRetrying(true);
    const outcome = await stopSession(stopRetry);
    if (!mounted.current) return;
    setRetrying(false);
    if (outcome.ok) { setStopRetry(null); go('ended'); if (recordIdRef.current) void loadEnded(recordIdRef.current); } else setError(outcome.message);
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
    if (current) release(current);
    setResumeStep(''); setHasFrame(false); setPauseReason(reason);
    if (recordIdRef.current && recordStateRef.current === 'interrupted') go('interrupted'); else { if (reason) setError(reason); go('idle'); }
  }

  /** Hidden tab, page closed, camera unplugged or unmount: pause a monitored session, otherwise stop as before. */
  function leave(reason?: string) {
    if (!run.current) return;
    if (phaseRef.current === 'monitoring' && run.current.recordId) void pause(reason ?? HIDDEN_REASON);
    else if (phaseRef.current === 'confirming') cancelResume(reason ?? HIDDEN_REASON);
    else { if (reason && mounted.current) setError(reason); void stop(); }
  }
  leaveRef.current = leave;

  useEffect(() => {
    mounted.current = true; void check();
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
    } catch (problem) {
      if (!isCurrent(current)) return;
      setSeats([]); setSetupError(`Seats could not be found (${(problem as Error).message}). Press Try again.`);
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
    const body = JSON.stringify({ seats: seatsForMonitor(seats, mirrored), movement, maxGapAuto: gapOverride === null });
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
        if (!response.ok) throw new Error(data.error || 'Monitoring could not start.');
        current.recordId = data.recordId;
        if (!isCurrent(current)) return;
        resetDashboard(); showRecord(data.recordId, data.record as LiveSessionRecord);
        // The full record, loaded between frames so its events line up with later frames.
        try { const record = await fetchRecord(data.recordId, current.controller.signal); if (isCurrent(current)) applyRecord(record); }
        catch { /* the record returned by Start monitoring is already shown */ }
        if (!isCurrent(current)) return;
        go('monitoring');
      } catch (problem) {
        if (isCurrent(current)) setError(`Monitoring could not start: ${(problem as Error).message} Check the seats, then press Start monitoring again.`);
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
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable here. Open Ocular at http://127.0.0.1:3000 in Chrome, Edge or Firefox.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, ...(device ? { deviceId: { exact: device } } : {}) } });
    if (!valid()) { stream.getTracks().forEach(track => track.stop()); throw new DOMException('Camera start cancelled.', 'AbortError'); }
    current.stream = stream;
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      if (!valid()) return;
      const again = phaseRef.current === 'monitoring' || phaseRef.current === 'confirming' ? 'Resume' : 'Start';
      leaveRef.current(`The camera disconnected. Reconnect it, then press ${again}${again === 'Start' ? ' again' : ''}.`);
    }, { once: true }));
    stream.getVideoTracks().forEach(track => {
      track.addEventListener('mute', () => { if (valid() && health.current) health.current.muted = true; });
      track.addEventListener('unmute', () => { if (valid() && health.current) health.current.muted = false; });
    });
    const used = stream.getVideoTracks()[0]?.getSettings().deviceId;
    if (used) { writeSavedDevice(used); setDevice(used); }
    if (!video.current) throw new Error('The camera picture could not open. Press Start again.');
    video.current.srcObject = stream;
    await video.current.play();
    void navigator.mediaDevices.enumerateDevices().then(list => { if (valid()) setDevices(list.filter(item => item.kind === 'videoinput')); }).catch(() => {});
    return stream;
  }

  /** The frame loop for a run whose worker is ready; it returns when the run is released. */
  function capture(current: Run, stream: MediaStream) {
    if (!output.current || !video.current) throw new Error('Camera drawing is unavailable in this browser. Use Chrome, Edge or Firefox.');
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
    if (phaseRef.current === 'monitoring' && current.recordId) await pause(LOST_REASON);
    else { setError(cameraError(problem)); await stop(); }
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
        body: JSON.stringify({ mirrored, tileGrid }), signal: AbortSignal.any([current.controller.signal, AbortSignal.timeout(65_000)]) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The camera could not start. Press Start again.');
      current.sessionId = data.sessionId;
      if (!valid()) { await stopSession(data.sessionId); return; }
      go('preparing');
      await capture(current, stream);
    } catch (problem) { await captureFailed(current, problem); }
  }

  /** Resume step 1: load the interrupted record, open the camera and draw the saved seats over it. */
  async function beginResume(id: string) {
    if (run.current) return;
    if (!ready) { setError('The local processor is not ready. Press Recheck, then press Resume again.'); return; }
    setError(''); setNotice(''); setSaveError(''); setWarnings([]); setConfirm(''); setStopRetry(null); setEditing(null); setHasFrame(false);
    setResumeStep('loading'); go('confirming');
    const current = newRun(); current.resumeOf = id;
    run.current = current;
    const valid = () => isCurrent(current);
    try {
      // A worker paused from this tab may still be closing; pausing again is harmless.
      if (pausedSession.current) { await interruptSession(pausedSession.current); pausedSession.current = null; }
      const record = await fetchRecord(id, current.controller.signal);
      if (!valid()) return;
      if (record.state !== 'interrupted') {
        throw new Error(record.state === 'ended' ? 'This session has ended, so it cannot be resumed. Open it from Past sessions to mark alerts or download the PDF.'
          : 'This session is live in another tab or window. Use that tab to continue.');
      }
      resetDashboard(); showRecord(id, record);
      setStoppedAt(interruptedAt(record)); setSessionTime(record.lastTime); setResumeStep('camera');
      setSeats(displaySeats(record.settings)); setMirrored(record.settings.mirrored); setTileGrid(record.settings.tileGrid);
      seatsRef.current = displaySeats(record.settings);
      await openCamera(current);
      if (valid()) setResumeStep('ask');
    } catch (problem) {
      if (!valid()) return;
      const message = cameraError(problem, 'Resume');
      release(current); setResumeStep('');
      if (recordIdRef.current === id && recordStateRef.current === 'interrupted') { setPauseReason(''); setError(message); go('interrupted'); }
      else { resetDashboard(); setError(message); setPastKey(key => key + 1); go('idle'); }
    }
  }

  /** Resume step 2 (Yes, resume): a new worker continues the same record with its saved settings. */
  async function confirmResume() {
    const current = run.current;
    const id = current?.resumeOf;
    if (!current || !id || phaseRef.current !== 'confirming' || resumeStep !== 'ask' || !current.stream) return;
    const stream = current.stream;
    const valid = () => isCurrent(current);
    setError(''); setResumeStep('starting');
    // This click is the user gesture browsers require before the alert sound can play.
    chime.current ??= new Chime(); chime.current.unlock();
    try {
      const response = await fetch('/api/camera', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mirrored, tileGrid, resume: id }), signal: AbortSignal.any([current.controller.signal, AbortSignal.timeout(65_000)]) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Monitoring could not resume.');
      current.sessionId = data.sessionId;
      // Left the check while the worker started: pause it again so the record stays interrupted.
      if (!valid()) { await interruptSession(data.sessionId); return; }
      current.recordId = id;
      applyRecord(data.record as LiveSessionRecord);
      try { const record = await fetchRecord(id, current.controller.signal); if (valid()) applyRecord(record); }
      catch { /* the record returned by Resume is already shown */ }
      if (!valid()) return;
      setResumeStep(''); setStoppedAt(null); setPauseReason(''); frameTimes.current = [];
      go('monitoring');
      await capture(current, stream);
    } catch (problem) {
      if (!valid()) return;
      if (current.recordId) { await captureFailed(current, problem); return; }
      setResumeStep('ask');
      setError(`Monitoring could not resume: ${(problem as Error).message} Press Yes, resume to try again, or No, end this session.`);
    }
  }

  /** End session (interrupted view, or No at the seat check): the record is ended; marking and the PDF still work. */
  async function endSession() {
    const id = recordIdRef.current;
    if (!id || action) return;
    if (run.current) release(run.current);
    setResumeStep(''); setHasFrame(false); setError(''); setAction('end');
    try {
      const response = await fetch(`/api/camera/sessions/${encodeURIComponent(id)}/end`, { method: 'POST', signal: AbortSignal.timeout(20_000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The session could not be ended.');
      if (!mounted.current || recordIdRef.current !== id) return;
      applyRecord(data.record as LiveSessionRecord);
      setConfirm(''); setPauseReason(''); setStoppedAt(null); pausedSession.current = null;
      go('ended');
    } catch (problem) {
      if (!mounted.current) return;
      setError(`The session could not be ended (${(problem as Error).message}). Press End session again.`);
      if (phaseRef.current === 'confirming') go('interrupted');
    } finally { if (mounted.current) setAction(''); }
  }

  async function deleteCurrent() {
    const id = recordIdRef.current;
    if (!id || action) return;
    setError(''); setAction('delete');
    const problem = await deleteSession(id);
    if (!mounted.current) return;
    setAction('');
    if (problem) { setError(problem); return; }
    newSession();
  }

  /** Past sessions → Open: the saved record's alerts (marking allowed) and its PDF, without a live view. */
  async function openRecord(id: string) {
    if (run.current || action) return;
    setError(''); setNotice(''); setSaveError(''); setAction('open');
    try {
      const record = await fetchRecord(id);
      if (!mounted.current || run.current) return;
      resetDashboard(); showRecord(id, record);
      setSeats(displaySeats(record.settings)); setHasFrame(false); setSessionTime(record.lastTime);
      if (record.state === 'interrupted') { setStoppedAt(interruptedAt(record)); go('interrupted'); }
      else go('ended');
    } catch (problem) {
      if (mounted.current) setError(`The session could not be opened (${(problem as Error).message}). Press Open again.`);
    } finally { if (mounted.current) setAction(''); }
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

  const statusText = phase === 'permission' ? 'Starting the camera… Allow camera access if the browser asks.'
    : phase === 'loading' ? 'Starting the camera…'
    : phase === 'preparing' ? (requesting === 'setup' ? 'Getting ready: numbering the seats…' : preparingText(received))
    : phase === 'found' && requesting === 'monitor' ? 'Starting monitoring…'
    : phase === 'stopping' ? (stopRetry ? (retrying ? 'Saving the session…' : 'The session is not saved yet.') : 'Stopping and saving the session…')
    : phase === 'confirming' ? (resumeStep === 'loading' ? 'Loading the session…' : resumeStep === 'camera' ? 'Starting the camera… Allow camera access if the browser asks.'
      : resumeStep === 'starting' ? 'Resuming… starting live processing.' : action === 'end' ? 'Ending the session…' : '')
    : action === 'end' ? 'Ending the session…' : action === 'open' ? 'Opening the session…' : action === 'delete' ? 'Deleting the session…'
    : '';
  const waiting = phase === 'permission' || phase === 'loading' || phase === 'preparing' || (phase === 'stopping' && (!stopRetry || retrying)) || requesting === 'monitor'
    || (phase === 'confirming' && resumeStep !== 'ask') || !!action;
  const monitoring = phase === 'monitoring';
  /** A saved session shown without a live view: interrupted, ended or reopened from Past sessions. */
  const saved = (phase === 'interrupted' || phase === 'ended') && !!recordId;
  const alertList = Object.values(alerts);
  const unmarked = alertList.filter(alert => alert.mark === null).length;
  const sessionLine = recordMeta && <p className="session-line">Started {formatSessionDate(recordMeta.createdAt)} · {countText(recordMeta.seats, 'seat')} · {countText(alertList.length, 'alert')} · {unmarkedText(alertList.length, unmarked)}</p>;
  const pdf = (primary: boolean) => recordId && <PdfReportDownload url={reportUrl(recordId)} filename={reportFilename(recordMeta?.createdAt ?? '')}
    variant={primary ? 'default' : 'outline'} size={primary ? 'lg' : 'default'} buttonClassName={primary ? 'camera-primary' : undefined} />;
  const sortedAlerts = sortAlerts(alerts);
  const openSeats = openAlertSeats(alerts);
  const longSession = longSessionWarning(sessionTime);
  const details = <>
        {live && <section className={`camera-health${warnings.length ? ' camera-health-warning' : ''}`} aria-label="Camera checks" role="status"><h3>Camera checks</h3>{warnings.length ? <ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : <p>No camera problems detected right now.</p>}</section>}

        <CameraAdvancedSettings inputLocked={busy} rulesLocked={phase === 'monitoring' || phase === 'stopping' || phase === 'ended' || !!requesting}
          mirrored={mirrored} onMirrored={setMirrored} tileGrid={tileGrid} onTileGrid={setTileGrid}
          rules={rules} onRules={setRules} gapOverride={gapOverride} onGapOverride={setGapOverride} measured={measured} />
        <p className="camera-note">No video is recorded. While monitoring, the session and a small picture of the seat for each alert are saved on this computer. Hiding this tab pauses monitoring and releases the camera; press Resume to continue.</p>
  </>;
  const cameraName = (item: MediaDeviceInfo, index: number) => item.label || `Camera ${index + 1}`;

  return <>
    <div className={`backend-banner${ready ? ' backend-ready' : ''}`} role="status"><Camera size={20} /><div><strong>{checking ? 'Checking the local processor' : ready ? 'Ocular is ready on this computer' : 'Python setup needed'}</strong><p>{status?.methods.baseline.message || 'Use the project README to prepare Python and the models.'}</p></div><button type="button" onClick={check} disabled={busy || checking} aria-label="Recheck local processor"><RefreshCw size={15} /><span>Recheck</span></button></div>
    <div ref={grid} className={`analysis-grid camera-grid${monitoring ? ' camera-dashboard' : ''}`}>
      <section className="workspace-card camera-setup" aria-labelledby="camera-setup-title"><div className="workspace-card-header"><h2 id="camera-setup-title">Live camera</h2><span>LOCAL CAMERA</span></div><div className="input-card-body">
        <SetupSteps phase={phase} />

        {(phase === 'idle' || phase === 'permission' || phase === 'loading') && <>
          <div className="analysis-settings"><label htmlFor="camera-device">Camera</label><div className="select-wrap"><select id="camera-device" value={device} disabled={busy} onChange={event => { setDevice(event.target.value); writeSavedDevice(event.target.value); }}><option value="">Default camera</option>{devices.filter(item => item.deviceId).map((item, index) => <option key={item.deviceId} value={item.deviceId}>{cameraName(item, index)}</option>)}</select></div>
            <p>Choose the phone or classroom camera. Ocular remembers it for next time.</p></div>
          <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={start} disabled={busy || !ready}>{busy ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}Start</Button></div>
        </>}

        {phase === 'preparing' && <div className="setup-panel">
          <p className="setup-lead">Keep the camera still. Ocular is finding the students; this takes about 5 seconds.</p>
          <div className="camera-actions"><Button variant="outline" onClick={() => void stop()}><Square size={15} />Stop camera</Button></div>
        </div>}

        {phase === 'found' && !editing && <div className="setup-panel">
          {setupError || !seats.length ? <>
            <h3 className="setup-title">{setupError ? 'Seats could not be found' : 'No students found'}</h3>
            <p className="setup-lead">{setupError || 'Check that the camera sees every desk and that faces are lit, then try again.'}</p>
            <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={tryAgain}><RefreshCw size={16} />Try again</Button></div>
            <div className="setup-secondary"><Button variant="outline" onClick={openEditor}>Draw seats myself</Button></div>
          </> : <>
            <h3 className="setup-title">{seatsEdited ? `${seats.length} seat${seats.length === 1 ? '' : 's'} ready` : `Found ${seats.length} seat${seats.length === 1 ? '' : 's'}`}</h3>
            <p className="setup-lead">The numbers on the live view are the seat numbers, left to right. Seats are positions, not people. If a seat is missing or wrong, use Adjust seats.</p>
            {measured?.tooSlow && <p className="setup-warning" role="note">This computer is processing the camera slowly, so alerts may not appear. {tileGrid > 1 ? 'Press Stop camera, choose fewer detector tiles under Advanced settings, then press Start again.' : 'Close other programs, then press Stop camera and Start again.'}</p>}
            {validation && <p className="setup-warning" role="status">{validation}</p>}
            <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={startMonitoring} disabled={!!requesting || !!validation}>{requesting === 'monitor' ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}Start monitoring</Button></div>
            <div className="setup-secondary"><Button variant="outline" onClick={openEditor} disabled={!!requesting}>Adjust seats</Button><Button variant="outline" onClick={tryAgain} disabled={!!requesting}>Find seats again</Button></div>
          </>}
          <button type="button" className="setup-link" onClick={() => void stop()} disabled={!!requesting}>Stop camera</button>
        </div>}

        {phase === 'found' && editing && <p className="setup-lead">Adjust the seats on the picture, then press Use these seats.</p>}

        {monitoring && <div className="setup-panel monitor-bar">
          <div className="monitor-bar-text">
            <h3 className="setup-title">Monitoring {seats.length} seat{seats.length === 1 ? '' : 's'}</h3>
            <SeatStatusLine status={running} observed={seatsObserved(seats.map(seat => seat.id), seatStates)} total={seats.length} sessionTime={sessionTime} />
            <p className="setup-lead">Keep this tab open. When an alert appears, look at that seat, then press Checked or Dismiss. Press Stop at the end of the exam.</p>
          </div>
          <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={() => void stop()}><Square size={16} />Stop</Button></div>
          {(notice || longSession || saveError || warnings.length > 0) && <div className="monitor-banners">
            {notice && <p className="setup-warning" role="status">{notice}</p>}
            {longSession && <p className="setup-warning" role="status">{longSession}</p>}
            {saveError && <p className="save-warning" role="status" title={saveError}>{SAVE_WARNING_TEXT}</p>}
            {warnings.length > 0 && <div className="setup-warning" role="status"><strong>Check the camera: </strong>{warnings.join(' ')}</div>}
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
          <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={() => recordId && void beginResume(recordId)} disabled={!recordId || !!action || !ready}><Play size={16} />Resume</Button></div>
          {confirm === 'end'
            ? <InlineConfirm text={END_CONFIRM_TEXT} confirmLabel="End session" cancelLabel="Keep it" busy={action === 'end'} busyLabel="Ending…"
                onConfirm={() => void endSession()} onCancel={() => setConfirm('')} />
            : <div className="setup-secondary"><Button variant="outline" onClick={() => setConfirm('end')} disabled={!!action}><Square size={15} />End session</Button>{pdf(false)}</div>}
          <button type="button" className="setup-link" onClick={newSession} disabled={!!action}>Back to past sessions</button>
        </div>}

        {phase === 'confirming' && <div className="setup-panel">
          <h3 className="setup-title">{resumeStep === 'ask' || resumeStep === 'starting' ? SEATS_QUESTION : 'Resuming the session'}</h3>
          {(resumeStep === 'ask' || resumeStep === 'starting') && <>
            <p className="setup-lead">The saved seat boxes are drawn on the live view. If each box still sits on its desk, resume. If the camera moved, end this session and start a new one.</p>
            <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={() => void confirmResume()} disabled={resumeStep === 'starting' || !!action}>
              {resumeStep === 'starting' ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Yes, resume</Button></div>
            <div className="setup-secondary"><Button variant="outline" onClick={() => void endSession()} disabled={resumeStep === 'starting' || !!action}><X size={15} />No, end this session</Button></div>
          </>}
          <button type="button" className="setup-link" onClick={() => cancelResume()} disabled={resumeStep === 'starting' || !!action}>Not now</button>
        </div>}

        {phase === 'ended' && <div className="setup-panel">
          <h3 className="setup-title">{recordMeta?.state === 'monitoring' ? 'This session is live' : 'Monitoring stopped'}</h3>
          <p className="setup-lead">{recordMeta?.state === 'monitoring'
            ? 'It is being monitored in another tab or window. You can mark alerts here; stop it from that tab.'
            : `${notice ? `${notice} ` : ''}The session is saved on this computer. Mark any remaining alerts, then download the PDF report.`}</p>
          {sessionLine}
          {recordId && <div className="camera-actions">{pdf(true)}</div>}
          {confirm === 'delete'
            ? <InlineConfirm text={DELETE_CONFIRM_TEXT} confirmLabel="Delete" cancelLabel="Keep" busy={action === 'delete'} busyLabel="Deleting…"
                onConfirm={() => void deleteCurrent()} onCancel={() => setConfirm('')} />
            : <div className="setup-secondary"><Button variant="outline" onClick={newSession} disabled={!!action}><Play size={15} />New session</Button>
              {recordId && recordMeta?.state !== 'monitoring' && <Button variant="outline" onClick={() => setConfirm('delete')} disabled={!!action}><Trash2 size={15} />Delete session</Button>}</div>}
        </div>}

        <p className="camera-status" role="status" hidden={monitoring && !statusText}>{waiting ? <LoaderCircle size={14} className="spin" /> : null}{statusText}</p>
        {error && <div className="analysis-error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}
        {!monitoring && phase !== 'interrupted' && phase !== 'confirming' && phase !== 'ended' && details}
      </div></section>

      <section className="workspace-card camera-output" aria-labelledby="camera-view-title" hidden={saved}><div className="workspace-card-header"><h2 id="camera-view-title">Live view</h2><span>{phase === 'monitoring' ? 'MONITORING' : live || phase === 'confirming' ? 'LIVE' : 'NOT LIVE'}</span></div><div className="results-body">
        <video ref={video} className="camera-source" muted playsInline aria-hidden="true" tabIndex={-1} />
        {editing && <SeatAdjuster image={editing.image} initial={seats}
          onSave={next => { setSeats(numberSeats(next)); setSeatsEdited(true); setSetupError(''); setEditing(null); }}
          onCancel={() => setEditing(null)} />}
        <div className="camera-processed" hidden={!!editing}>
          <canvas ref={output} hidden={!hasFrame} aria-label={seats.length && (phase === 'found' || phase === 'confirming' || monitoring) ? `Live camera view with ${seats.length} numbered seat boxes${monitoring ? '; seats with an alert are outlined in orange' : phase === 'confirming' ? ' from the saved session' : ''}` : 'Live camera view'} />
          {!hasFrame && <div className="camera-placeholder"><Camera size={32} /><p>{phase === 'idle' ? 'Press Start to open the camera.' : statusText || 'The camera picture appears here.'}</p></div>}
        </div>
        {monitoring && <CameraSeatGrid seats={seats} states={seatStates} openSeats={openSeats} status={running} />}
        <p className="result-disclaimer">Alerts are prompts to look, not findings. Head direction is not eye gaze or evidence of misconduct.</p>
      </div></section>
      {(monitoring || saved) && <CameraAlertsPanel recordId={recordId} alerts={sortedAlerts} events={events} muted={muted} onMuted={setMuted}
        onMark={markAlert} message={markMessage} announcement={announcement} live={monitoring} />}
      {monitoring && <details className="workspace-card monitor-details">
        <summary>Details: camera checks, settings and storage</summary>
        <div className="input-card-body">{details}</div>
      </details>}
    </div>
    {phase === 'idle' && <CameraPastSessions refreshKey={pastKey} onOpen={id => void openRecord(id)} onResume={id => void beginResume(id)} disabled={!!action} />}
  </>;
}
