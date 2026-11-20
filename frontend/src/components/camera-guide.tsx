"use client";

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';

/**
 * The How to use Ocular guide (the same text is in frontend/README.md under "Using the live camera").
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
          <li><strong>Before the exam:</strong> install Camo on the phone and on this laptop; connect them over USB or the same Wi-Fi.</li>
          <li><strong>Place the phone:</strong> mount it high at the front so every desk and face is visible; landscape; good lighting; do not move it after setup.</li>
          <li><strong>Start:</strong> choose the phone in the camera list and press <strong>Start</strong>.</li>
          <li><strong>Seats:</strong> Ocular finds the students and numbers the seats left to right. Use <strong>Adjust seats</strong> only if a seat is missing or wrong.</li>
          <li><strong>Monitor:</strong> press <strong>Start monitoring</strong>. An alert tells you which seat to look at. Look up, decide, then press <strong>Checked</strong> or <strong>Dismiss</strong> (or the C and D keys).</li>
          <li><strong>If it stops:</strong> reconnect the phone and press <strong>Resume</strong>. Your seats and alerts are kept.</li>
          <li><strong>After the exam:</strong> press <strong>Stop</strong>, download the PDF, and delete the session when your institution’s retention period ends.</li>
        </ol>
        <h3>Troubleshooting</h3>
        <dl className="camera-guide-help">
          <dt>The phone is not in the camera list</dt>
          <dd>Open Camo on the phone and on this laptop and check that they are connected. Then reload this page and choose the phone.</dd>
          <dt>“No students found”</dt>
          <dd>Check that the phone sees every desk and that faces are lit, then press <strong>Try again</strong>. You can also draw the seats yourself.</dd>
          <dt>“Running slowly”</dt>
          <dd>Close other programs on this laptop. If it stays slow, press <strong>Stop</strong>, choose fewer detector tiles under Advanced settings, and start again.</dd>
          <dt>The alert sound does not play</dt>
          <dd>Click the page once, and check that <strong>Mute alerts</strong> is off and the laptop volume is up.</dd>
          <dt>The seats no longer line up</dt>
          <dd>The phone has moved. End the session and start a new one, so Ocular can find the seats again.</dd>
        </dl>
        <h3>What alerts mean</h3>
        <p>An alert is a prompt to look, not a finding. It means a head in that seat turned left or right for a while, or several times. Looking down (writing) never alerts. Seats are positions in the room, not people: Ocular does not recognise anyone. You decide what, if anything, needs attention.</p>
        <div className="camera-actions"><Button variant="outline" onClick={onClose}>Close the guide</Button></div>
      </div>
    </div>
  </dialog>;
}
