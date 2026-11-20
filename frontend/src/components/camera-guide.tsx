"use client";

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';

/**
 * The How to use Ocular guide, kept to short steps (a longer version is in frontend/README.md under "Using the live camera").
 * It is a modal dialog: the page behind it is inert, Tab stays inside, Escape or Close closes it, and focus
 * returns to the How to use button (`returnFocus`). Monitoring keeps running underneath; because the page's
 * own alert announcements are inert while the dialog is open, a new alert is announced and shown inside it.
 */
export function CameraGuide({ open, onClose, returnFocus, announcement }: {
  open: boolean; onClose: () => void; returnFocus: RefObject<HTMLButtonElement | null>; announcement: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const openedWith = useRef('');
  const [alertNote, setAlertNote] = useState('');

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      openedWith.current = announcement;
      setAlertNote('');
      element.showModal();
      heading.current?.focus();
    } else if (!open && element.open) {
      element.close();
    }
    // `announcement` is read only at the moment the guide opens; later changes are handled below.
  }, [open]);

  useEffect(() => {
    if (open && announcement.trim() && announcement !== openedWith.current) setAlertNote(announcement.trim());
  }, [announcement, open]);

  return <dialog ref={dialog} className="camera-guide" aria-labelledby="camera-guide-title"
    onClose={() => { onClose(); returnFocus.current?.focus(); }}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
      // Keys typed in the guide never mark an alert (C / D).
      event.stopPropagation();
    }}>
    <div className="camera-guide-inner">
      <div className="workspace-card-header">
        <h2 id="camera-guide-title" ref={heading} tabIndex={-1}>How to use Ocular</h2>
        <Button variant="outline" className="camera-guide-close" onClick={onClose}><X size={16} aria-hidden="true" />Close</Button>
      </div>
      <p className="camera-guide-alert" role="status" aria-live="assertive" aria-atomic="true" hidden={!alertNote}>
        {alertNote ? `${alertNote}. Close the guide to see it.` : ''}
      </p>
      <div className="camera-guide-body">
        <ol className="camera-guide-steps">
          <li><strong>Connect:</strong> install Camo on the phone and laptop, then connect them.</li>
          <li><strong>Place:</strong> mount the phone high at the front, seeing every desk.</li>
          <li><strong>Start:</strong> pick the phone in the camera list, then press <strong>Start</strong>.</li>
          <li><strong>Seats:</strong> check the numbers. Press <strong>Adjust seats</strong> if one is wrong.</li>
          <li><strong>Monitor:</strong> press <strong>Start monitoring</strong>. An alert names a seat to look at.</li>
          <li><strong>Decide:</strong> press <strong>Checked</strong> or <strong>Dismiss</strong> (keys C and D).</li>
          <li><strong>If it stops:</strong> reconnect, keep this tab open, press <strong>Resume</strong>.</li>
          <li><strong>After:</strong> press <strong>Stop</strong>, download the PDF, delete the session when done.</li>
        </ol>
        <h3>If something goes wrong</h3>
        <dl className="camera-guide-help">
          <dt>Phone not in the camera list</dt>
          <dd>Open Camo on both, then reload this page.</dd>
          <dt>“No students found”</dt>
          <dd>Show every desk, light the faces, then press <strong>Try again</strong>.</dd>
          <dt>“Running slowly”</dt>
          <dd>Close other programs, or pick fewer tiles in Advanced settings.</dd>
          <dt>No alert sound</dt>
          <dd>Click the page once; check <strong>Mute alerts</strong> and the volume.</dd>
          <dt>Seats no longer line up</dt>
          <dd>The phone moved: end the session and start a new one.</dd>
        </dl>
        <h3>What alerts mean</h3>
        <p>Alerts are prompts, not proof. Seats are places, not people. Writing never alerts.</p>
        <div className="camera-actions"><Button variant="outline" onClick={onClose}>Close the guide</Button></div>
      </div>
    </div>
  </dialog>;
}
