"use client";

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from './ui/button';
import { SeatEditor } from './seat-editor';
import { SETUP_FRAMES, seatLabel } from '@/lib/camera-setup';
import type { ReviewSeat } from '@/lib/review-contract';
import type { LiveSeatState } from '@/lib/camera-contract';
import type { DEFAULT_MOVEMENT } from '@/lib/review-contract';
import '@/app/analyze/saved-review.css';

/**
 * Camera screen phases. `interrupted`: frames stopped without Stop (the record can be resumed); `confirming`:
 * the camera is open again with the saved seats drawn, asking whether they still line up before resuming.
 */
export type CameraPhase = 'idle' | 'permission' | 'loading' | 'preparing' | 'found' | 'monitoring' | 'interrupted' | 'confirming' | 'ended' | 'stopping';
export type MovementRules = Omit<typeof DEFAULT_MOVEMENT, 'max_gap'>;
export interface MeasuredSpeed { maxGap: number; tooSlow: boolean; medianInterval: number }

const STEPS = ['Connect camera', 'Find seats', 'Monitor'] as const;

export function setupStep(phase: CameraPhase): number {
  if (phase === 'idle' || phase === 'permission' || phase === 'loading') return 0;
  return phase === 'preparing' || phase === 'found' ? 1 : 2;
}

export function SetupSteps({ phase }: { phase: CameraPhase }) {
  const step = setupStep(phase);
  return <ol className="setup-steps" aria-label="Setup steps">
    {STEPS.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className={index < step ? 'setup-step-done' : undefined}>
      <span aria-hidden="true">{index < step ? <Check size={12} /> : index + 1}</span>{label}
      {index < step && <span className="sr-only"> (done)</span>}
    </li>)}
  </ol>;
}

export function preparingText(received: number) {
  return `Getting ready: looking for students… (${Math.min(received, SETUP_FRAMES)} of ${SETUP_FRAMES})`;
}

export interface SeatOverlay { directions?: Record<string, LiveSeatState>; highlighted?: Set<string> }

/**
 * Numbered seat boxes over the live canvas; `roi` is in fractions of the drawn frame. While monitoring,
 * each badge also shows the seat's current direction, and a seat with an open alert is highlighted.
 */
export function drawSeatBoxes(draw: CanvasRenderingContext2D, seats: ReviewSeat[], width: number, height: number, overlay: SeatOverlay = {}) {
  draw.save();
  draw.font = 'bold 20px Arial';
  for (const seat of seats) {
    const [l, t, r, b] = seat.roi;
    const x = l * width, y = t * height;
    const alert = overlay.highlighted?.has(seat.id) ?? false;
    draw.lineWidth = alert ? 6 : 3;
    draw.strokeStyle = alert ? '#ff9f1c' : '#9cc7ff';
    draw.strokeRect(x, y, (r - l) * width, (b - t) * height);
    const number = seatLabel(seat.id).replace(/^Seat /, '');
    const direction = overlay.directions ? overlay.directions[seat.id]?.direction ?? 'unknown' : null;
    const label = direction ? `Seat ${number} · ${direction}` : number;
    const badge = Math.max(30, draw.measureText(label).width + 14);
    draw.fillStyle = alert ? '#ff9f1c' : '#1d3557';
    draw.fillRect(x, y, badge, 28);
    draw.fillStyle = alert ? '#1f1300' : '#ffffff';
    draw.fillText(label, x + 7, y + 21);
  }
  draw.restore();
}

/** Seat editing on a still of the live view; seats are renumbered left to right on save. */
export function SeatAdjuster({ image, initial, onSave, onCancel }: {
  image: string; initial: ReviewSeat[]; onSave: (seats: ReviewSeat[]) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [ready, setReady] = useState(false);
  return <div className="seat-adjuster">
    <h3>{initial.length ? 'Adjust seats' : 'Draw seats'}</h3>
    <p className="review-help">This is a still picture from the camera. Drag a box around each student’s head area. Seats are numbered left to right when you save them.</p>
    <SeatEditor source={{ kind: 'image', url: image }} seats={draft} onChange={setDraft} disabled={false} onPlayable={setReady} />
    <div className="camera-actions">
      <Button size="lg" className="camera-primary" onClick={() => onSave(draft)} disabled={!ready || !draft.length}>Use these seats</Button>
      <Button variant="outline" onClick={onCancel}>Cancel</Button>
    </div>
    {!draft.length && <p className="review-help">Add at least one seat to continue.</p>}
  </div>;
}

const RULE_FIELDS = [
  { key: 'min_duration', label: 'Sustained duration (s)', max: 300, step: .25, help: 'How long a head must stay turned.' },
  { key: 'repetition_count', label: 'Repetition count', max: 100, step: 1, help: 'Turns that count as repeated.' },
  { key: 'repetition_window', label: 'Repetition window (s)', max: 300, step: .25, help: 'Time in which the turns must happen.' },
  { key: 'repeat_min_duration', label: 'Minimum dwell (s)', max: 300, step: .05, help: 'How long each turn must last.' },
] as const;

export function CameraAdvancedSettings({ inputLocked, rulesLocked, mirrored, onMirrored, tileGrid, onTileGrid, rules, onRules, gapOverride, onGapOverride, measured }: {
  inputLocked: boolean; rulesLocked: boolean;
  mirrored: boolean; onMirrored: (value: boolean) => void; tileGrid: number; onTileGrid: (value: number) => void;
  rules: MovementRules; onRules: (rules: MovementRules) => void;
  gapOverride: number | null; onGapOverride: (value: number | null) => void; measured: MeasuredSpeed | null;
}) {
  const fps = measured && measured.medianInterval > 0 ? 1 / measured.medianInterval : null;
  return <details className="advanced-settings camera-advanced">
    <summary>Advanced settings</summary>
    <p>You do not need to change these. Camera input settings apply when you press Start; movement rules apply when you press Start monitoring.</p>
    <fieldset disabled={inputLocked} className="camera-advanced-group"><legend>Camera input</legend>
      <label className="checkbox-label"><input type="checkbox" checked={mirrored} onChange={event => onMirrored(event.target.checked)} />The camera pixels are already mirrored</label>
      <p>Turn this on only if the camera app flips the picture like a mirror. Left and right describe the student.</p>
      <label className="tiling-label" htmlFor="camera-tiling">Detector tiling<select id="camera-tiling" value={tileGrid} onChange={event => onTileGrid(Number(event.target.value))}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>{value === 1 ? '1 — full frame' : `${value} — more tiles, slower processing`}</option>)}</select></label>
      <p>More tiles help find small faces at the back of the room but process more slowly.</p>
    </fieldset>
    <fieldset disabled={rulesLocked} className="camera-advanced-group"><legend>Movement rules</legend>
      <div className="review-setting-grid">
        {RULE_FIELDS.map(({ key, label, max, step, help }) => <label key={key}>{label}
          <input type="number" min={key === 'repetition_count' ? 2 : step} max={max} step={step} value={rules[key]} aria-describedby={`camera-rule-${key}`}
            onChange={event => onRules({ ...rules, [key]: Number(event.target.value) })} />
          <small id={`camera-rule-${key}`}>{help}</small></label>)}
        <label>Maximum gap (s)
          <input type="number" min={.05} max={5} step={.05} value={gapOverride ?? measured?.maxGap ?? ''} placeholder="Automatic" aria-describedby="camera-rule-max-gap"
            onChange={event => onGapOverride(event.target.value === '' ? null : Number(event.target.value))} />
          <small id="camera-rule-max-gap">{gapOverride === null ? 'Set automatically.' : 'Set by you.'}</small></label>
      </div>
      <p id="camera-max-gap-help">A larger maximum gap lets unseen moments between processed frames count as one continuous movement. Ocular sets it from the speed measured during Getting ready.</p>
      {measured && fps !== null && <p>Measured speed: {fps.toFixed(1)} frames per second ({measured.medianInterval.toFixed(2)} s between processed frames). Automatic maximum gap: {measured.maxGap} s.</p>}
      {measured?.tooSlow && fps !== null && <p role="note">Processing is too slow for movement alerts ({fps.toFixed(1)} FPS). Use fewer detector tiles.</p>}
      {gapOverride !== null && <button type="button" className="review-secondary-action" onClick={() => onGapOverride(null)}>Use the automatic maximum gap</button>}
      <p>Defaults are experimental movement rules, not validated indicators of misconduct. Seats and rules are fixed once monitoring starts.</p>
    </fieldset>
  </details>;
}
