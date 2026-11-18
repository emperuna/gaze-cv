"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, LoaderCircle, Play, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { DELETE_CONFIRM_TEXT, countText, formatDuration, formatSessionDate, stateLabel, unmarkedText } from '@/lib/camera-sessions';
import type { RecordSummary } from '@/lib/server-camera-record';

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
    const data = await response.json().catch(() => ({}));
    return `${data.error || 'The session could not be deleted.'} Press Delete again.`;
  } catch {
    return 'Ocular could not be reached to delete the session. Press Delete again.';
  }
}

/** Saved camera sessions on the idle screen, newest first. */
export function CameraPastSessions({ refreshKey, onOpen, onResume, disabled = false }: {
  refreshKey: number; onOpen: (recordId: string) => void; onResume: (recordId: string) => void; disabled?: boolean;
}) {
  const [sessions, setSessions] = useState<RecordSummary[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; text: string } | null>(null);
  const live = useRef(true);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const response = await fetch('/api/camera/sessions', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Past sessions could not be loaded.');
      if (live.current) setSessions(data.sessions as RecordSummary[]);
    } catch (problem) {
      if (live.current) setLoadError(`${(problem as Error).message || 'Past sessions could not be loaded.'}`);
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
    setSessions(current => current?.filter(item => item.id !== id) ?? current);
  }

  return <section className="workspace-card camera-past" aria-labelledby="camera-past-title">
    <div className="workspace-card-header"><h2 id="camera-past-title">Past sessions</h2>
      <button type="button" className="setup-link camera-past-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={13} />Refresh</button>
    </div>
    <div className="camera-past-body">
      {loading && !sessions && <p className="camera-status" role="status"><LoaderCircle size={14} className="spin" />Loading past sessions…</p>}
      {loadError && <div className="analysis-error" role="alert"><span>Past sessions could not be loaded ({loadError}). Press Try again.</span>
        <Button variant="outline" onClick={() => void load()}>Try again</Button></div>}
      {sessions && !sessions.length && <p className="alerts-empty">No saved sessions yet. A session is saved here when you start monitoring.</p>}
      {sessions && sessions.length > 0 && <ul className="camera-past-list">
        {sessions.map(item => {
          const label = stateLabel(item.state);
          return <li key={item.id} className="camera-past-item">
            <div className="camera-past-text">
              <h3>{formatSessionDate(item.createdAt)} <span className={`camera-past-state camera-past-${item.state}`}>{label}</span></h3>
              <p>{formatDuration(item.seconds)} · {countText(item.seats, 'seat')} · {countText(item.alerts, 'alert')} · {unmarkedText(item.alerts, item.unmarked)}</p>
            </div>
            {confirming === item.id ? <InlineConfirm text={DELETE_CONFIRM_TEXT} confirmLabel="Delete" cancelLabel="Keep" busy={deleting === item.id} busyLabel="Deleting…"
              onConfirm={() => void remove(item.id)} onCancel={() => { setConfirming(null); setDeleteError(null); }} />
              : <div className="camera-past-actions">
                <Button variant="outline" onClick={() => onOpen(item.id)} disabled={disabled} aria-label={`Open the session from ${formatSessionDate(item.createdAt)}`}><FolderOpen size={15} />Open</Button>
                {item.state === 'interrupted' && <Button variant="outline" onClick={() => onResume(item.id)} disabled={disabled} aria-label={`Resume the session from ${formatSessionDate(item.createdAt)}`}><Play size={15} />Resume</Button>}
                {item.state !== 'monitoring' && <Button variant="outline" onClick={() => { setConfirming(item.id); setDeleteError(null); }} disabled={disabled || !!deleting}
                  aria-label={`Delete the session from ${formatSessionDate(item.createdAt)}`}><Trash2 size={15} />Delete</Button>}
              </div>}
            {deleteError?.id === item.id && <p className="analysis-error" role="alert">{deleteError.text}</p>}
          </li>;
        })}
      </ul>}
    </div>
  </section>;
}
