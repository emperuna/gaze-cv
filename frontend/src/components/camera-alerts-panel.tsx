"use client";

import { useEffect, useState } from 'react';
import { Bell, BellOff, Check, LoaderCircle, X } from 'lucide-react';
import { Button } from './ui/button';
import { MAX_ALERT_NOTE } from '@/lib/camera-contract';
import { formatElapsed, newestOpenAlert, seatNumber, shortcutMark } from '@/lib/camera-dashboard';
import { alertTitle } from '@/lib/live-alerts';
import type { AlertMark, LiveAlert } from '@/lib/live-alerts';
import type { MovementEvent } from '@/lib/review-contract';

/**
 * A short two-note tone made with Web Audio, so no sound file is needed. Browsers allow sound only
 * after a user gesture, so `unlock` is called from the Start monitoring click.
 */
export class Chime {
  private context: AudioContext | null = null;
  unlock() {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
    } catch { this.context = null; }
  }
  play() {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    try {
      const start = context.currentTime;
      const gain = context.createGain();
      gain.connect(context.destination);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      for (const [frequency, offset] of [[880, 0], [1320, 0.12]] as const) {
        const tone = context.createOscillator();
        tone.type = 'sine';
        tone.frequency.value = frequency;
        tone.connect(gain);
        tone.start(start + offset);
        tone.stop(start + 0.45);
      }
    } catch { /* sound is a convenience; the alert is still shown */ }
  }
  close() { void this.context?.close().catch(() => {}); this.context = null; }
}

const stillUrl = (recordId: string, alertId: string) => `/api/camera/sessions/${encodeURIComponent(recordId)}/stills/${encodeURIComponent(alertId)}`;

/** The alert list, newest first, with a still, Checked / Dismiss and an optional note per alert. */
export function CameraAlertsPanel({ recordId, alerts, events, muted, onMuted, onMark, message, announcement }: {
  recordId: string | null; alerts: LiveAlert[]; events: MovementEvent[];
  muted: boolean; onMuted: (muted: boolean) => void;
  /** Resolves once the server answered; the parent shows any failure in `message`. */
  onMark: (alert: LiveAlert, mark: AlertMark, note: string) => Promise<void>;
  message: string; announcement: string;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const newest = newestOpenAlert(alerts);
  const openCount = alerts.filter(alert => alert.mark === null).length;

  async function mark(alert: LiveAlert, value: AlertMark) {
    if (pending) return;
    setPending(alert.id);
    try { await onMark(alert, value, notes[alert.id] ?? alert.note ?? ''); }
    finally { setPending(null); }
  }
  useEffect(() => {
    if (!newest || pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented) return;
      const value = shortcutMark(event.key, event.target as HTMLElement | null, event);
      if (!value) return;
      event.preventDefault();
      void mark(newest, value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `mark` reads the notes and pending state of this render, so the listener is renewed with them.
  }, [newest, pending, notes]);

  return <section className="workspace-card camera-alerts" aria-labelledby="camera-alerts-title">
    <div className="workspace-card-header">
      <h2 id="camera-alerts-title">Alerts{openCount ? <span className="alerts-open-count">{openCount} to check</span> : null}</h2>
      <Button variant="outline" className="alerts-mute" aria-pressed={muted} onClick={() => onMuted(!muted)}>
        {muted ? <BellOff size={16} /> : <Bell size={16} />}{muted ? 'Sound off' : 'Sound on'}
      </Button>
    </div>
    <p className="sr-only" aria-live="assertive" aria-atomic="true">{announcement}</p>
    <div className="alerts-body">
      {message && <p className="setup-warning" role="alert">{message}</p>}
      {!alerts.length && <p className="alerts-empty">No alerts yet. When a seat needs a look, it appears here with a picture and a sound.</p>}
      <ol className="alerts-list">
        {alerts.map(alert => {
          const open = alert.mark === null;
          const isNewest = newest?.id === alert.id;
          const busy = pending === alert.id;
          const noteId = `alert-note-${alert.id}`;
          return <li key={alert.id} className={`alert-item${open ? ' alert-open' : ' alert-closed'}`} aria-labelledby={`${alert.id}-title`}>
            <div className="alert-seat" aria-hidden="true"><small>Seat</small>{seatNumber(alert.seatId)}</div>
            <div className="alert-main">
              <h3 id={`${alert.id}-title`}>{alertTitle(alert, events)}</h3>
              <p className="alert-time">Opened at {formatElapsed(alert.openedAt)}{alert.lastAt > alert.openedAt ? ` · latest ${formatElapsed(alert.lastAt)}` : ''} into the session{open ? '' : ` · ${alert.mark}`}</p>
              <div className="alert-still">
                {alert.still && recordId
                  ? <img src={stillUrl(recordId, alert.id)} alt={`Seat ${seatNumber(alert.seatId)} when the alert opened`} />
                  : <p>{alert.stillError ? `No still: ${alert.stillError}` : 'No still for this alert.'}</p>}
              </div>
              {open ? <>
                <label className="alert-note" htmlFor={noteId}>Note (optional)
                  <textarea id={noteId} rows={1} maxLength={MAX_ALERT_NOTE} value={notes[alert.id] ?? alert.note ?? ''} disabled={busy}
                    onChange={event => setNotes(current => ({ ...current, [alert.id]: event.target.value }))} />
                </label>
                <div className="alert-actions">
                  <Button size="lg" onClick={() => void mark(alert, 'Checked')} disabled={!!pending} aria-keyshortcuts={isNewest ? 'C' : undefined}>
                    {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{isNewest ? 'Checked (C)' : 'Checked'}
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => void mark(alert, 'Dismissed')} disabled={!!pending} aria-keyshortcuts={isNewest ? 'D' : undefined}>
                    <X size={16} />{isNewest ? 'Dismiss (D)' : 'Dismiss'}
                  </Button>
                </div>
              </> : alert.note ? <p className="alert-note-text">Note: {alert.note}</p> : null}
            </div>
          </li>;
        })}
      </ol>
    </div>
  </section>;
}
