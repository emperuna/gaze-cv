"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, LoaderCircle, Play, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { DELETE_CONFIRM_TEXT, countText, formatDuration, formatSessionDate, stateLabel, unmarkedText } from '@/lib/camera-sessions';
import type { RecordSummary } from '@/lib/server-camera-record';
import { AGAIN_CONFIRM_TEXT, RECORDING_DELETE_TEXT, recordingUrl, startReviewAgain, stoppedText } from '@/lib/recording-flow';

/**
 * An in-page confirmation for destructive actions (no browser `confirm()`). The safe choice gets focus
 * first, and Escape picks it.
 */
export function InlineConfirm({ text, confirmLabel, cancelLabel, onConfirm, onCancel, busy = false, busyLabel }: {
  text: string; confirmLabel: string; cancelLabel: string; onConfirm: () => void; onCancel: () => void; busy?: boolean; busyLabel?: string;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancel.current?.focus(); }, []);
  return <div className="inline-confirm" role="alertdialog" aria-label={text}
    onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); } }}>
    <p>{text}</p>
    <div className="inline-confirm-actions">
      <Button variant="outline" className="inline-confirm-danger" onClick={onConfirm} disabled={busy}>
        {busy ? <LoaderCircle size={15} className="spin" /> : null}{busy && busyLabel ? busyLabel : confirmLabel}
      </Button>
      <Button ref={cancel} onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
    </div>
  </div>;
}

export async function deleteSession(recordId: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/camera/sessions/${encodeURIComponent(recordId)}`, { method: 'DELETE', signal: AbortSignal.timeout(15_000) });
    if (response.ok || response.status === 404) return null;
    return 'The session could not be deleted. Press Delete again.';
  } catch {
    return 'Ocular could not be reached to delete the session. Press Delete again.';
  }
}

/**
 * Saved sessions on the idle screen, newest first. A recording opens on the recording screen, and an interrupted one
 * offers Review again (never Resume: there is no live camera to resume).
 */
export function CameraPastSessions({ refreshKey, onOpen, onResume, disabled = false }: {
  refreshKey: number; onOpen: (recordId: string) => void; onResume: (recordId: string) => void; disabled?: boolean;
}) {
  const [sessions, setSessions] = useState<RecordSummary[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  /** The row asking to confirm, and what for. */
  const [confirming, setConfirmingState] = useState<{ id: string; kind: 'delete' | 'again' } | null>(null);
  const setConfirming = (id: string | null, kind: 'delete' | 'again' = 'delete') => setConfirmingState(id ? { id, kind } : null);
  const [again, setAgain] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; text: string } | null>(null);
  const live = useRef(true);
  const list = useRef<HTMLDivElement>(null);
  /** After an in-page confirmation closes, focus goes here (a CSS selector inside the list) on the next render. */
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNext.current) return;
    list.current?.parentElement?.querySelector<HTMLElement>(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const response = await fetch('/api/camera/sessions', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Past sessions could not be loaded.');
      if (live.current) setSessions(data.sessions as RecordSummary[]);
    } catch {
      if (live.current) setLoadError('Past sessions could not be loaded. Press Try again.');
    } finally { if (live.current) setLoading(false); }
  }, []);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  async function remove(id: string) {
    setDeleting(id); setDeleteError(null);
    const problem = await deleteSession(id);
    if (!live.current) return;
    setDeleting(null);
    if (problem) { setDeleteError({ id, text: problem }); return; }
    setConfirming(null);
    // The row is gone: focus the next row's Open button, else the previous one's, else the heading.
    const index = sessions?.findIndex(item => item.id === id) ?? -1;
    const neighbour = sessions?.[index + 1] ?? sessions?.[index - 1];
    focusNext.current = neighbour ? `[data-open="${neighbour.id}"]` : '#camera-past-title';
    setSessions(current => current?.filter(item => item.id !== id) ?? current);
  }

  async function reviewAgain(id: string) {
    setAgain(id); setDeleteError(null);
    const problem = await startReviewAgain(id);
    if (!live.current) return;
    if (problem) { setAgain(null); setDeleteError({ id, text: problem }); return; }
    window.location.assign(recordingUrl(id));
  }

  return <section className="workspace-card camera-past" aria-labelledby="camera-past-title">
    <div className="workspace-card-header"><h2 id="camera-past-title" tabIndex={-1}>Past sessions</h2>
      <button type="button" className="setup-link camera-past-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={13} />Refresh</button>
    </div>
    <div className="camera-past-body" ref={list}>
      {loading && !sessions && <p className="camera-status" role="status"><LoaderCircle size={14} className="spin" />Loading past sessions…</p>}
      {loadError && <div className="analysis-error" role="alert"><span>{loadError}</span>
        <Button variant="outline" onClick={() => void load()}>Try again</Button></div>}
      {sessions && !sessions.length && <p className="alerts-empty">No saved sessions yet. A session is saved here when you start monitoring.</p>}
      {sessions && sessions.length > 0 && <ul className="camera-past-list">
        {sessions.map(item => {
          const recording = item.recording;
          const label = recording && item.state === 'monitoring' ? 'Reviewing' : stateLabel(item.state);
          const date = formatSessionDate(item.createdAt);
          const name = recording ? `the recording ${recording.filename}` : `the session from ${date}`;
          return <li key={item.id} className="camera-past-item">
            <div className="camera-past-text">
              <h3>{recording ? `Recording · ${recording.filename}` : date} <span className={`camera-past-state camera-past-${item.state}`}>{label}</span></h3>
              <p>{recording ? `${date} · ` : ''}{recording && item.state === 'interrupted' ? stoppedText(item.seconds, recording.durationSeconds) : formatDuration(item.seconds)} · {countText(item.seats, 'seat')} · {countText(item.alerts, 'alert')} · {unmarkedText(item.alerts, item.unmarked)}</p>
            </div>
            {confirming?.id === item.id && confirming.kind === 'delete' ? <InlineConfirm text={recording ? RECORDING_DELETE_TEXT : DELETE_CONFIRM_TEXT} confirmLabel="Delete" cancelLabel="Keep" busy={deleting === item.id} busyLabel="Deleting…"
              onConfirm={() => void remove(item.id)} onCancel={() => { setConfirming(null); setDeleteError(null); focusNext.current = `[data-delete="${item.id}"]`; }} />
              : confirming?.id === item.id && confirming.kind === 'again' ? <InlineConfirm text={AGAIN_CONFIRM_TEXT} confirmLabel="Review again" cancelLabel="Keep" busy={again === item.id} busyLabel="Starting…"
              onConfirm={() => void reviewAgain(item.id)} onCancel={() => { setConfirming(null); setDeleteError(null); focusNext.current = `[data-again="${item.id}"]`; }} />
              : <div className="camera-past-actions">
                <Button variant="outline" data-open={item.id} onClick={() => recording ? window.location.assign(recordingUrl(item.id)) : onOpen(item.id)} disabled={disabled} aria-label={`Open ${name}`}><FolderOpen size={15} />Open</Button>
                {item.state === 'interrupted' && (recording
                  ? <Button variant="outline" data-again={item.id} onClick={() => { setConfirming(item.id, 'again'); setDeleteError(null); }} disabled={disabled || !!again} aria-label={`Review ${name} again`}><RotateCcw size={15} />Review again</Button>
                  : <Button variant="outline" onClick={() => onResume(item.id)} disabled={disabled} aria-label={`Resume ${name}`}><Play size={15} />Resume</Button>)}
                {item.state !== 'monitoring' && <Button variant="outline" data-delete={item.id} onClick={() => { setConfirming(item.id); setDeleteError(null); }} disabled={disabled || !!deleting}
                  aria-label={`Delete ${name}`}><Trash2 size={15} />Delete</Button>}
              </div>}
            {deleteError?.id === item.id && <p className="analysis-error" role="alert">{deleteError.text}</p>}
          </li>;
        })}
      </ul>}
    </div>
  </section>;
}
