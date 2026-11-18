"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, LoaderCircle, Play, RefreshCw, Square } from 'lucide-react';
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
import { CameraAdvancedSettings, SeatAdjuster, SetupSteps, preparingText } from './camera-setup';
import { newRun, runCaptureLoop, stopSession } from './camera-run';
import type { MonitorFrame, Run } from './camera-run';
import { CameraAlertsPanel, Chime } from './camera-alerts-panel';
import { CameraSeatGrid, SeatStatusLine } from './camera-seat-grid';
import type { CameraPhase, MeasuredSpeed, MovementRules } from './camera-setup';

function cameraError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Camera access was denied. Allow the camera in your browser and system settings, then press Start again.';
    if (error.name === 'NotFoundError') return 'No camera was found. Connect the camera, then press Start again.';
    if (error.name === 'NotReadableError') return 'The camera could not open. Close other apps using it, then press Start again.';
    if (error.name === 'OverconstrainedError') return 'The selected camera is unavailable. Choose another camera, then press Start again.';
  }
  return error instanceof Error ? error.message : 'The camera stopped unexpectedly. Press Start again.';
}

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
  const busy = phase !== 'idle' && phase !== 'ended';
  const ready = !!status?.methods.baseline.ready && !checking;
  useEffect(() => { seatsRef.current = seats; }, [seats]);

  const go = useCallback((next: CameraPhase) => { phaseRef.current = next; setPhaseState(next); }, []);
  const isCurrent = (current: Run) => mounted.current && current.active && run.current === current;

  const setAlerts = (next: AlertMap) => { alertsRef.current = next; setAlertState(next); };
  /** A loaded record replaces the dashboard's alerts and events; its event indexes match the record's. */
  function applyRecord(record: LiveSessionRecord) {
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
  /**
   * Reloads the full record. While the frame loop runs, it is queued as a command so no frame is in
   * flight and the record's event list lines up with the events appended from later frames.
   */
  function reloadRecord() {
    const current = run.current;
    const id = current?.recordId;
    if (!current || !id || reloadQueued.current) return;
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
    if (result.state && result.state !== 'monitoring') { setNotice(result.notice ?? 'Monitoring has ended.'); void stop(); }
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

  const stop = useCallback(async () => {
    const current = run.current;
    if (!current) return;
    run.current = null; current.active = false; current.controller.abort(); current.commands.length = 0;
    current.stream?.getTracks().forEach(track => track.stop());
    if (video.current) video.current.srcObject = null;
    health.current = null;
    const monitored = !!current.recordId;
    if (mounted.current) { go('stopping'); setWarnings([]); setEditing(null); setRequesting(''); }
    if (current.sessionId) {
      const outcome = await stopSession(current.sessionId);
      // A preview has nothing to save; a monitored session keeps Stop available until it is saved.
      if (!outcome.ok && monitored) { if (mounted.current) { setStopRetry(current.sessionId); setError(outcome.message); } return; }
    }
    if (mounted.current && !run.current) { if (!monitored) setHasFrame(false); go(monitored ? 'ended' : 'idle'); }
  }, [go]);

  async function retryStop() {
    if (!stopRetry || retrying) return;
    setError(''); setRetrying(true);
    const outcome = await stopSession(stopRetry);
    if (!mounted.current) return;
    setRetrying(false);
    if (outcome.ok) { setStopRetry(null); go('ended'); } else setError(outcome.message);
  }

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
    const hide = () => { if (document.hidden) void stop(); };
    const leave = () => { void stop(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);
    navigator.mediaDevices?.addEventListener('devicechange', updateDevices);
    return () => {
      mounted.current = false; void stop();
      chime.current?.close(); chime.current = null;
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leave);
      navigator.mediaDevices?.removeEventListener('devicechange', updateDevices);
    };
  }, [check, stop]);

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
      try {
        const response = await fetch(`/api/camera/${current.sessionId}/monitor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: current.controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Monitoring could not start.');
        if (!isCurrent(current)) return;
        current.recordId = data.recordId;
        resetDashboard(); setRecordId(data.recordId); applyRecord(data.record as LiveSessionRecord);
        // The full record, loaded between frames so its events line up with later frames.
        try { const record = await fetchRecord(data.recordId, current.controller.signal); if (isCurrent(current)) applyRecord(record); }
        catch { /* the record returned by Start monitoring is already shown */ }
        if (!isCurrent(current)) return;
        go('monitoring');
      } catch (problem) {
        if (isCurrent(current)) setError(`Monitoring could not start: ${(problem as Error).message} Check the seats, then press Start monitoring again.`);
      } finally { if (isCurrent(current)) setRequesting(''); }
    });
  }

  function newSession() {
    setSeats([]); setSeatsEdited(false); setHasFrame(false); setNotice(''); setError(''); setSaveError(''); setMeasured(null);
    resetDashboard();
    go('idle');
  }

  async function start() {
    if (run.current || !ready) return;
    setError(''); setNotice(''); setSaveError(''); setWarnings([]); setSeats([]); setSeatsEdited(false); setSetupError('');
    setEditing(null); setMeasured(null); setHasFrame(false); setReceived(0); setStopRetry(null); resetDashboard();
    go('permission');
    const current = newRun();
    run.current = current;
    const valid = () => isCurrent(current);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable here. Open Ocular at http://127.0.0.1:3000 in Chrome, Edge or Firefox.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, ...(device ? { deviceId: { exact: device } } : {}) } });
      if (!valid()) { stream.getTracks().forEach(track => track.stop()); return; }
      current.stream = stream;
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (valid()) { setError('The camera disconnected. Reconnect it, then press Start again.'); void stop(); }
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
      if (!valid()) return;
      void navigator.mediaDevices.enumerateDevices().then(list => { if (valid()) setDevices(list.filter(item => item.kind === 'videoinput')); }).catch(() => {});
      go('loading');
      const response = await fetch('/api/camera', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mirrored, tileGrid }), signal: AbortSignal.any([current.controller.signal, AbortSignal.timeout(65_000)]) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The camera could not start. Press Start again.');
      current.sessionId = data.sessionId;
      if (!valid()) { await stopSession(data.sessionId); return; }
      go('preparing');
      if (!output.current) throw new Error('Camera drawing is unavailable in this browser. Use Chrome, Edge or Firefox.');
      await runCaptureLoop({ run: current, video: video.current, target: output.current, stream, health, valid,
        phase: () => phaseRef.current, seats: () => seatsRef.current,
        overlay: () => ({ highlighted: openAlertSeats(alertsRef.current) }),
        onDrawn: () => setHasFrame(true),
        onSetupReceived: setReceived,
        onSetupComplete: () => { current.commands.push(() => findSeats(current)); },
        onMonitorFrame,
      });
    } catch (problem) {
      if (valid()) { setError(cameraError(problem)); await stop(); }
    }
  }

  const statusText = phase === 'permission' ? 'Starting the camera… Allow camera access if the browser asks.'
    : phase === 'loading' ? 'Starting the camera…'
    : phase === 'preparing' ? (requesting === 'setup' ? 'Getting ready: numbering the seats…' : preparingText(received))
    : phase === 'found' && requesting === 'monitor' ? 'Starting monitoring…'
    : phase === 'stopping' ? (stopRetry ? (retrying ? 'Saving the session…' : 'The session is not saved yet.') : 'Stopping and saving the session…')
    : '';
  const waiting = phase === 'permission' || phase === 'loading' || phase === 'preparing' || (phase === 'stopping' && (!stopRetry || retrying)) || requesting === 'monitor';
  const monitoring = phase === 'monitoring';
  const sortedAlerts = sortAlerts(alerts);
  const openSeats = openAlertSeats(alerts);
  const longSession = longSessionWarning(sessionTime);
  const details = <>
        {live && <section className={`camera-health${warnings.length ? ' camera-health-warning' : ''}`} aria-label="Camera checks" role="status"><h3>Camera checks</h3>{warnings.length ? <ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : <p>No camera problems detected right now.</p>}</section>}

        <CameraAdvancedSettings inputLocked={busy} rulesLocked={phase === 'monitoring' || phase === 'stopping' || phase === 'ended' || !!requesting}
          mirrored={mirrored} onMirrored={setMirrored} tileGrid={tileGrid} onTileGrid={setTileGrid}
          rules={rules} onRules={setRules} gapOverride={gapOverride} onGapOverride={setGapOverride} measured={measured} />
        <p className="camera-note">No video is recorded. While monitoring, the session and a small picture of the seat for each alert are saved on this computer. Hiding this tab stops the camera.</p>
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

        {phase === 'ended' && <div className="setup-panel">
          <h3 className="setup-title">Monitoring stopped</h3>
          <p className="setup-lead">{notice ? `${notice} ` : ''}The session is saved on this computer.</p>
          <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={newSession}><Play size={16} />New session</Button></div>
        </div>}

        <p className="camera-status" role="status" hidden={monitoring && !statusText}>{waiting ? <LoaderCircle size={14} className="spin" /> : null}{statusText}</p>
        {error && <div className="analysis-error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}
        {!monitoring && details}
      </div></section>

      <section className="workspace-card camera-output" aria-labelledby="camera-view-title"><div className="workspace-card-header"><h2 id="camera-view-title">Live view</h2><span>{phase === 'monitoring' ? 'MONITORING' : live ? 'LIVE' : 'NOT LIVE'}</span></div><div className="results-body">
        <video ref={video} className="camera-source" muted playsInline aria-hidden="true" tabIndex={-1} />
        {editing && <SeatAdjuster image={editing.image} initial={seats}
          onSave={next => { setSeats(numberSeats(next)); setSeatsEdited(true); setSetupError(''); setEditing(null); }}
          onCancel={() => setEditing(null)} />}
        <div className="camera-processed" hidden={!!editing}>
          <canvas ref={output} hidden={!hasFrame} aria-label={seats.length && (phase === 'found' || monitoring) ? `Live camera view with ${seats.length} numbered seat boxes${monitoring ? '; seats with an alert are outlined in orange' : ''}` : 'Live camera view'} />
          {!hasFrame && <div className="camera-placeholder"><Camera size={32} /><p>{phase === 'idle' ? 'Press Start to open the camera.' : statusText || 'The camera picture appears here.'}</p></div>}
        </div>
        {monitoring && <CameraSeatGrid seats={seats} states={seatStates} openSeats={openSeats} status={running} />}
        <p className="result-disclaimer">Alerts are prompts to look, not findings. Head direction is not eye gaze or evidence of misconduct.</p>
      </div></section>
      {monitoring && <CameraAlertsPanel recordId={recordId} alerts={sortedAlerts} events={events} muted={muted} onMuted={setMuted}
        onMark={markAlert} message={markMessage} announcement={announcement} />}
      {monitoring && <details className="workspace-card monitor-details">
        <summary>Details: camera checks, settings and storage</summary>
        <div className="input-card-body">{details}</div>
      </details>}
    </div>
  </>;
}
