"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, FileVideo, LoaderCircle, Play, RotateCcw, Square, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { AboutThisExam, CameraAdvancedSettings, SeatAdjuster, StepList, drawSeatBoxes } from './camera-setup';
import type { MovementRules } from './camera-setup';
import { CameraAlertsPanel } from './camera-alerts-panel';
import { InlineConfirm, deleteSession } from './camera-past-sessions';
import { PdfReportDownload } from './pdf-report-download';
import type { BackendStatus } from '@/lib/analysis-contract';
import { CONFLICT_TEXT, alertsFromRecord, sortAlerts, withAlert } from '@/lib/camera-dashboard';
import type { AlertMap } from '@/lib/camera-dashboard';
import { PlainError, describeProblem } from '@/lib/camera-messages';
import type { Problem } from '@/lib/camera-messages';
import { alertSummary, countText, displaySeats, reportFilename, reportUrl } from '@/lib/camera-sessions';
import { cameraMovement, cameraRules, movementProblem, numberSeats, seatsForMonitor } from '@/lib/camera-setup';
import { EMPTY_EXAM } from '@/lib/exam-details';
import type { ExamDetails } from '@/lib/exam-details';
import type { AlertMark, LiveAlert, LiveSessionRecord } from '@/lib/live-alerts';
import {
  AGAIN_CONFIRM_TEXT, POLL_MS, RECORDING_DELETE_TEXT, RECORDING_EXTENSIONS, acceptedFile, progressText, recordingStep,
  recordingUrl, recordingVideoUrl, reviewProgress, startReviewAgain, stoppedText,
} from '@/lib/recording-flow';
import type { RecordingStep } from '@/lib/recording-flow';
import { validateReviewSettings } from '@/lib/review-contract';
import type { ReviewSeat } from '@/lib/review-contract';

/** Frames are evenly spaced in a recording, so the server fixes the maximum gap at this value. */
const RECORDING_MAX_GAP = 1;
const STEPS = ['Choose a video', 'Find seats', 'Review'] as const;
const STEP_INDEX: Record<RecordingStep, number> = { choose: 0, finding: 1, seats: 1, reviewing: 2, stopped: 2, done: 3 };
const CANCEL_CONFIRM_TEXT = 'Stop the review and delete this video and its photos?';
const UPLOAD_FAILED = 'The video could not be uploaded. Choose it again.';
const START_FAILED = 'The review could not start. Press Start review again.';

const previewUrl = (id: string) => `/api/camera/sessions/${encodeURIComponent(id)}/preview`;
const recordPath = (id: string) => `/api/camera/sessions/${encodeURIComponent(id)}`;
/** The video's length, or the time already reached when the length was an estimate. */
const lengthOf = (record: LiveSessionRecord) => Math.max(record.source?.durationSeconds ?? 0, record.lastTime);

interface Draft { id: string; durationSeconds: number }
type Confirm = '' | 'cancel' | 'delete' | 'again';
type Action = '' | 'open' | 'start' | 'cancel' | 'delete' | 'again';

/** A server answer as a plain-words problem: the server's own sentence, or `fallback` when it has none. */
async function answerProblem(response: Response, fallback: string): Promise<PlainError> {
  const data = await response.json().catch(() => ({})) as { error?: unknown };
  return new PlainError(typeof data.error === 'string' && data.error ? data.error : fallback);
}

/** The first frame of the video with the numbered seat boxes drawn on it. */
function SeatPreview({ src, seats }: { src: string; seats: ReviewSeat[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const next = new Image();
    setImage(null); setFailed(false);
    next.onload = () => setImage(next);
    next.onerror = () => setFailed(true);
    next.src = src;
    return () => { next.onload = null; next.onerror = null; };
  }, [src]);
  useEffect(() => {
    const target = canvas.current, context = target?.getContext('2d');
    if (!target || !context || !image) return;
    target.width = image.naturalWidth; target.height = image.naturalHeight;
    context.drawImage(image, 0, 0);
    drawSeatBoxes(context, seats, target.width, target.height);
  }, [image, seats]);
  return <div className="camera-processed">
    <canvas ref={canvas} hidden={!image} role="img" aria-label={`First frame of the video with ${countText(seats.length, 'numbered seat box', 'numbered seat boxes')}`} />
    {!image && <div className="camera-placeholder"><FileVideo size={32} aria-hidden="true" /><p>{failed ? 'The first frame could not be shown.' : 'Loading the first frame…'}</p></div>}
  </div>;
}

/** Review a recording: choose a video, check the seats on its first frame, review it on this computer, then mark the alerts. */
export function RecordingWorkspace() {
  const [mirrored, setMirrored] = useState(false);
  const [tileGrid, setTileGrid] = useState(2);
  const [headTurns, setHeadTurns] = useState(true);
  const [rules, setRules] = useState<MovementRules>(() => cameraRules());
  const [exam, setExam] = useState<ExamDetails>(EMPTY_EXAM);
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [seats, setSeats] = useState<ReviewSeat[]>([]);
  const [seatsEdited, setSeatsEdited] = useState(false);
  const [editing, setEditing] = useState(false);
  const [record, setRecordState] = useState<LiveSessionRecord | null>(null);
  const [alerts, setAlertState] = useState<AlertMap>({});
  const [markMessage, setMarkMessage] = useState('');
  const [pollProblem, setPollProblem] = useState(false);
  const [error, setErrorState] = useState<Problem>({ text: '', detail: '' });
  const [confirm, setConfirm] = useState<Confirm>('');
  const [action, setAction] = useState<Action>('');
  const mounted = useRef(true);
  const upload = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const revision = useRef(0);
  const alertsRef = useRef<AlertMap>({});
  const setError = (text: string, detail = '') => setErrorState({ text, detail });
  const showProblem = (problem: unknown, fallback: string) => setErrorState(describeProblem(problem, fallback));
  const setAlerts = (next: AlertMap) => { alertsRef.current = next; setAlertState(next); };

  const step = recordingStep({ uploading, hasDraft: !!draft, recordState: record?.state ?? null });
  const ready = !!status?.methods.baseline.ready && !checking;
  const recordId = record?.id ?? null;

  /** Shows a loaded record, its alerts and its seats (drawn as on the first frame). */
  const applyRecord = useCallback((next: LiveSessionRecord) => {
    setRecordState(next); revision.current = next.revision;
    setAlerts(alertsFromRecord(next.alerts)); setSeats(displaySeats(next.settings));
  }, []);

  async function fetchRecord(id: string): Promise<LiveSessionRecord> {
    const response = await fetch(recordPath(id), { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw Object.assign(await answerProblem(response, 'This recording could not be opened.'), { status: response.status });
    return (await response.json()).record as LiveSessionRecord;
  }

  /** Back to Choose a video with nothing open. */
  function reset() {
    upload.current?.abort(); upload.current = null;
    setUploading(false); setDraft(null); setSeats([]); setSeatsEdited(false); setEditing(false); setFileName('');
    setRecordState(null); setAlerts({}); revision.current = 0; setMarkMessage(''); setPollProblem(false); setConfirm('');
    window.history.replaceState(null, '', '/analyze?mode=video');
  }

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/analyze', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '');
      if (mounted.current) setStatus(data);
    } catch { if (mounted.current) setStatus(null); }
    finally { if (mounted.current) setChecking(false); }
  }, []);

  useEffect(() => {
    mounted.current = true; void check();
    const id = new URLSearchParams(window.location.search).get('recording');
    if (id) {
      setAction('open');
      void fetchRecord(id).then(next => {
        if (!mounted.current) return;
        if (!next.source || next.source.kind !== 'recording') throw new PlainError('This is a live session: open it from the camera screen.');
        applyRecord(next);
      }).catch(problem => {
        if (!mounted.current) return;
        showProblem(problem, 'This recording could not open: open it again from Past sessions.');
        window.history.replaceState(null, '', '/analyze?mode=video');
      }).finally(() => { if (mounted.current) setAction(''); });
    }
    return () => { mounted.current = false; upload.current?.abort(); };
    // Runs once: the record in the address is opened when the screen loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check, applyRecord]);

  // While the review runs, the record is read every second; the review keeps going if the page is left.
  const reviewing = step === 'reviewing' ? recordId : null;
  useEffect(() => {
    if (!reviewing) return;
    let stopped = false;
    const timer = setInterval(() => {
      void fetchRecord(reviewing).then(next => { if (!stopped && mounted.current) { setPollProblem(false); applyRecord(next); } })
        .catch(problem => {
          if (stopped || !mounted.current) return;
          if ((problem as { status?: number }).status === 404) { reset(); setError('This recording was deleted: choose another video.'); return; }
          setPollProblem(true);
        });
    }, POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewing, applyRecord]);

  // When the step changes, keyboard focus moves to its primary button, or to the status line during a wait.
  useEffect(() => {
    if (editing) return;
    const target = body.current?.querySelector<HTMLElement>('.camera-primary:not(:disabled)') ?? body.current?.querySelector<HTMLElement>('.camera-status');
    if (body.current?.contains(document.activeElement) || document.activeElement === document.body) target?.focus();
  }, [step, editing]);

  async function chooseFile(file: File | undefined) {
    if (!file || uploading) return;
    setError(''); setConfirm('');
    const problem = acceptedFile(file);
    if (problem) { setError(problem); return; }
    const controller = new AbortController();
    upload.current = controller;
    setFileName(file.name); setUploading(true);
    try {
      const query = new URLSearchParams({ name: file.name, mirrored: String(mirrored), tileGrid: String(tileGrid), headTurns: String(headTurns) });
      const response = await fetch(`/api/recordings?${query}`, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' }, signal: controller.signal });
      if (!response.ok) throw await answerProblem(response, UPLOAD_FAILED);
      const data = await response.json() as { draftId: string; seats: ReviewSeat[]; durationSeconds: number };
      if (upload.current !== controller) return;
      setDraft({ id: data.draftId, durationSeconds: data.durationSeconds });
      setSeats(numberSeats(data.seats)); setSeatsEdited(false);
    } catch (problem) {
      if (upload.current === controller && !controller.signal.aborted) showProblem(problem, UPLOAD_FAILED);
    } finally {
      if (upload.current === controller) { upload.current = null; setUploading(false); }
    }
  }

  /** Before the review starts: drops the upload or the found-seats draft and goes back to Choose a video. */
  function chooseAnother() {
    const id = draft?.id;
    reset(); setError('');
    if (id) void fetch(`${recordPath(id)}/cancel`, { method: 'POST' }).catch(() => { /* an old draft is removed after a day */ });
  }

  const movement = { ...cameraMovement(RECORDING_MAX_GAP), ...rules };
  let validation = '';
  if (step === 'seats' && seats.length) {
    const rulesProblem = movementProblem(movement);
    if (rulesProblem) validation = `Check Advanced settings: ${rulesProblem}`;
    else {
      try { validateReviewSettings({ method: 'baseline', mirrored, tileGrid, seats: seatsForMonitor(seats, mirrored), movement }); }
      catch (problem) { validation = `Check Advanced settings: ${(problem as Error).message}`; }
    }
  }

  async function startReview() {
    if (!draft || action || !seats.length || validation) return;
    setAction('start'); setError('');
    try {
      const response = await fetch(`/api/recordings/${encodeURIComponent(draft.id)}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seats: seatsForMonitor(seats, mirrored), movement, exam }), signal: AbortSignal.timeout(65_000) });
      if (!response.ok) throw await answerProblem(response, START_FAILED);
      const { recordId: id } = await response.json() as { recordId: string };
      window.history.replaceState(null, '', recordingUrl(id));
      const next = await fetchRecord(id);
      if (!mounted.current) return;
      setDraft(null); applyRecord(next);
    } catch (problem) { if (mounted.current) showProblem(problem, START_FAILED); }
    finally { if (mounted.current) setAction(''); }
  }

  async function cancelReview() {
    if (!recordId) return;
    setAction('cancel'); setError('');
    try {
      const response = await fetch(`${recordPath(recordId)}/cancel`, { method: 'POST', signal: AbortSignal.timeout(30_000) });
      if (!response.ok && response.status !== 404) throw await answerProblem(response, 'The review could not be cancelled. Press Cancel again.');
      if (mounted.current) reset();
    } catch (problem) { if (mounted.current) showProblem(problem, 'Ocular could not be reached. Press Cancel again.'); }
    finally { if (mounted.current) setAction(''); }
  }

  async function deleteRecording() {
    if (!recordId) return;
    setAction('delete'); setError('');
    const problem = await deleteSession(recordId);
    if (!mounted.current) return;
    setAction('');
    if (problem) setError(problem); else reset();
  }

  async function reviewAgain() {
    if (!recordId) return;
    setAction('again'); setError('');
    const problem = await startReviewAgain(recordId);
    if (!mounted.current) return;
    if (problem) { setAction(''); setError(problem); return; }
    try { const next = await fetchRecord(recordId); if (mounted.current) { setConfirm(''); applyRecord(next); } }
    catch { /* the next poll or a reload shows the review */ }
    finally { if (mounted.current) setAction(''); }
  }

  async function markAlert(alert: LiveAlert, mark: AlertMark, note: string) {
    if (!recordId) return;
    setMarkMessage('');
    try {
      const response = await fetch(`${recordPath(recordId)}/alerts/${encodeURIComponent(alert.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mark, note, revision: revision.current }),
        signal: AbortSignal.timeout(15_000) });
      const data = await response.json().catch(() => ({}));
      if (!mounted.current) return;
      if (response.status === 409) {
        setMarkMessage(CONFLICT_TEXT);
        void fetchRecord(recordId).then(next => { if (mounted.current) applyRecord(next); }).catch(() => {});
        return;
      }
      if (!response.ok) { setMarkMessage(`The alert could not be marked. Press ${mark === 'Checked' ? 'Checked' : 'Dismiss'} again.`); return; }
      revision.current = Math.max(revision.current, data.revision);
      setAlerts(withAlert(alertsRef.current, data.alert as LiveAlert));
    } catch {
      if (mounted.current) setMarkMessage(`Ocular could not be reached to mark the alert. Press ${mark === 'Checked' ? 'Checked' : 'Dismiss'} again.`);
    }
  }

  const finished = step === 'done' || step === 'stopped';
  const alertList = Object.values(alerts);
  const unmarked = alertList.filter(alert => alert.mark === null).length;
  const name = record?.source?.filename ?? fileName;
  const pdf = (primary: boolean) => recordId && <PdfReportDownload url={reportUrl(recordId)} filename={reportFilename(record?.createdAt ?? '')}
    variant={primary ? 'default' : 'outline'} size={primary ? 'lg' : 'default'} buttonClassName={primary ? 'camera-primary' : undefined} />;
  const deleteControls = confirm === 'delete'
    ? <InlineConfirm text={RECORDING_DELETE_TEXT} confirmLabel="Delete" cancelLabel="Keep" busy={action === 'delete'} busyLabel="Deleting…"
        onConfirm={() => void deleteRecording()} onCancel={() => setConfirm('')} />
    : null;
  const seatCount = countText(seats.length, 'seat');
  const statusText = action === 'open' ? 'Opening…' : step === 'finding' ? 'Finding seats…' : action === 'start' ? 'Starting review…'
    : step === 'reviewing' && record ? progressText(record.lastTime, lengthOf(record)) : action === 'again' ? 'Starting review…' : '';
  const waiting = action === 'open' || step === 'finding' || action === 'start' || action === 'again';

  return <>
    <div className="recording-bar"><a className="setup-link" href="/analyze"><ArrowLeft size={14} aria-hidden="true" />Back to live camera</a></div>
    <div className="analysis-grid camera-grid">
      <section className="workspace-card camera-setup" aria-labelledby="recording-title"><div className="workspace-card-header"><h2 id="recording-title">Review a recording</h2><span>ON THIS COMPUTER</span></div>
        <div className="input-card-body" ref={body}>
          <StepList labels={STEPS} step={STEP_INDEX[step]} />

          {step === 'choose' && action !== 'open' && <div className="setup-panel">
            <p className="setup-lead">MP4, MOV, WebM or M4V, up to 2 GB and 3 hours.</p>
            <input ref={fileInput} type="file" hidden accept={[...RECORDING_EXTENSIONS, 'video/*'].join(',')}
              onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void chooseFile(file); }} />
            <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={() => fileInput.current?.click()} disabled={!ready}><FileVideo size={16} />Choose video</Button></div>
            {!ready && <p className="setup-blocked">{checking ? 'Checking this computer…' : status?.methods.baseline.message || 'Finish the setup in the README, then reload.'}</p>}
          </div>}

          {step === 'finding' && <div className="setup-panel">
            <h3 className="setup-title recording-file">{fileName}</h3>
            <p className="setup-lead">Keep this page open until the seats appear.</p>
            <button type="button" className="setup-link" onClick={chooseAnother}>Cancel</button>
          </div>}

          {step === 'seats' && !editing && <div className="setup-panel">
            <h3 className="setup-title">{!seats.length ? 'No students found' : seatsEdited ? `${seatCount} ready` : `Found ${seatCount}`}</h3>
            <p className="setup-lead">{seats.length ? 'Check the numbered boxes. Seats are positions, not people.' : 'Draw the seats yourself, or choose another video.'}</p>
            {validation && <p className="setup-warning" role="status">{validation}</p>}
            {seats.length > 0 && <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={() => void startReview()} disabled={!!action || !!validation}>
              {action === 'start' ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}Start review</Button></div>}
            <div className="setup-secondary"><Button variant="outline" className={seats.length ? undefined : 'camera-primary'} onClick={() => setEditing(true)} disabled={!!action}>{seats.length ? 'Adjust seats' : 'Draw seats'}</Button></div>
            <AboutThisExam idPrefix="recording" exam={exam} onExam={setExam} disabled={!!action} />
            <button type="button" className="setup-link" onClick={chooseAnother} disabled={!!action}>Choose another video</button>
          </div>}

          {step === 'seats' && editing && <p className="setup-lead">Fix the boxes, then press Use these seats.</p>}

          {step === 'reviewing' && record && <div className="setup-panel">
            <h3 className="setup-title recording-file">{name}</h3>
            <progress className="recording-progress" max={1} value={reviewProgress(record.lastTime, lengthOf(record))} aria-label="Review progress" />
            <p className="setup-lead">You can leave this page; the review keeps going.</p>
            {pollProblem && <p className="setup-warning" role="status">Can’t reach Ocular. Still trying…</p>}
            {confirm === 'cancel'
              ? <InlineConfirm text={CANCEL_CONFIRM_TEXT} confirmLabel="Stop and delete" cancelLabel="Keep reviewing" busy={action === 'cancel'} busyLabel="Cancelling…"
                  onConfirm={() => void cancelReview()} onCancel={() => setConfirm('')} />
              : <div className="setup-secondary"><Button variant="outline" onClick={() => setConfirm('cancel')} disabled={!!action}><Square size={15} />Cancel</Button></div>}
          </div>}

          {step === 'done' && <div className="setup-panel">
            <h3 className="setup-title">Review finished</h3>
            <p className="session-line">{name} · {alertSummary(alertList.length, unmarked)}</p>
            <div className="camera-actions">{pdf(true)}</div>
            {deleteControls ?? <div className="setup-secondary"><Button variant="outline" onClick={() => { reset(); setError(''); }} disabled={!!action}><FileVideo size={15} />Review another</Button>
              <Button variant="outline" onClick={() => setConfirm('delete')} disabled={!!action}><Trash2 size={15} />Delete</Button></div>}
          </div>}

          {step === 'stopped' && <div className="setup-panel">
            <h3 className="setup-title">Review stopped</h3>
            {record && <p className="setup-lead" role="status">{stoppedText(record.lastTime, lengthOf(record))}</p>}
            <p className="setup-lead">Alerts so far are kept.</p>
            <p className="session-line">{name} · {alertSummary(alertList.length, unmarked)}</p>
            {confirm === 'again'
              ? <InlineConfirm text={AGAIN_CONFIRM_TEXT} confirmLabel="Review again" cancelLabel="Keep" busy={action === 'again'} busyLabel="Starting…"
                  onConfirm={() => void reviewAgain()} onCancel={() => setConfirm('')} />
              : <div className="camera-actions"><Button size="lg" className="camera-primary" onClick={() => setConfirm('again')} disabled={!!action || !ready}><RotateCcw size={16} />Review again</Button></div>}
            {deleteControls ?? <div className="setup-secondary">{pdf(false)}
              <Button variant="outline" onClick={() => setConfirm('delete')} disabled={!!action}><Trash2 size={15} />Delete</Button></div>}
          </div>}

          <p className="camera-status" role="status" tabIndex={-1}>{waiting ? <LoaderCircle size={14} className="spin" /> : null}{statusText}</p>
          {error.text && <div className="analysis-error" role="alert"><AlertCircle size={17} /><div className="analysis-error-text"><span>{error.text}</span>
            {error.detail && <details className="error-detail"><summary>More information</summary><p>{error.detail}</p></details>}</div></div>}
          {(step === 'choose' || step === 'seats') && <CameraAdvancedSettings inputLocked={step !== 'choose'} rulesLocked={!!action}
            mirrored={mirrored} onMirrored={setMirrored} tileGrid={tileGrid} onTileGrid={setTileGrid} headTurns={headTurns} onHeadTurns={setHeadTurns}
            rules={rules} onRules={setRules} gapOverride={null} onGapOverride={() => {}} measured={null} fixedMaxGap={RECORDING_MAX_GAP} source="recording" />}
          <p className="result-disclaimer">Alerts are prompts, not proof.</p>
        </div></section>

      {!finished && <section className="workspace-card camera-output" aria-labelledby="recording-view-title"><div className="workspace-card-header"><h2 id="recording-view-title">Seats</h2><span>FIRST FRAME</span></div><div className="results-body">
        {editing && draft && <SeatAdjuster image={previewUrl(draft.id)} initial={seats}
          onSave={next => { setSeats(numberSeats(next)); setSeatsEdited(true); setEditing(false); }} onCancel={() => setEditing(false)} />}
        {!editing && (draft || recordId)
          ? <SeatPreview src={previewUrl((draft?.id ?? recordId)!)} seats={seats} />
          : !editing && <div className="camera-processed"><div className="camera-placeholder"><FileVideo size={32} aria-hidden="true" /><p>The first frame appears here.</p></div></div>}
      </div></section>}

      {finished && record && <CameraAlertsPanel recordId={recordId} alerts={sortAlerts(alerts)} events={record.events} muted={false} onMuted={() => {}}
        onMark={markAlert} message={markMessage} announcement="" live={false} videoUrl={recordingVideoUrl(record.id)} videoLength={lengthOf(record)} />}
    </div>
  </>;
}
