"use client";

import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { SeatEditor } from './seat-editor';
import { MOVEMENT_LABELS, SETUP_FRAMES, seatLabel, setupStep } from '@/lib/camera-setup';
import type { ReviewSeat } from '@/lib/review-contract';
import type { LiveSeatState } from '@/lib/camera-contract';
import type { DEFAULT_MOVEMENT } from '@/lib/review-contract';
import { MAX_EXAM_TEXT } from '@/lib/exam-details';
import type { ExamDetails } from '@/lib/exam-details';
import '@/app/analyze/saved-review.css';

/**
 * Camera screen phases. `interrupted`: frames stopped without Stop (the record can be resumed); `confirming`:
 * the camera is open again with the saved seats drawn, asking whether they still line up before resuming.
 */
export type CameraPhase = 'idle' | 'permission' | 'loading' | 'preparing' | 'found' | 'monitoring' | 'interrupted' | 'confirming' | 'ended' | 'stopping';
export type MovementRules = Omit<typeof DEFAULT_MOVEMENT, 'max_gap'>;
export interface MeasuredSpeed { maxGap: number; tooSlow: boolean; medianInterval: number }

const STEPS = ['Connect camera', 'Find seats', 'Monitor'] as const;

/** The numbered step header; steps before `step` show a check mark. */
export function StepList({ labels, step }: { labels: readonly string[]; step: number }) {
  return <ol className="setup-steps" aria-label="Setup steps">
    {labels.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className={index < step ? 'setup-step-done' : undefined}>
      <span aria-hidden="true">{index < step ? <Check size={12} /> : index + 1}</span>{label}
      {index < step && <span className="sr-only"> (done)</span>}
    </li>)}
  </ol>;
}

/** `stoppedFrom`: the step shown when Stop was pressed, kept while stopping. */
export function SetupSteps({ phase, stoppedFrom = null }: { phase: CameraPhase; stoppedFrom?: number | null }) {
  return <StepList labels={STEPS} step={setupStep(phase, stoppedFrom)} />;
}

/** The optional, collapsible session details (title, room, person in charge) printed at the top of the PDF report. */
export function AboutThisExam({ idPrefix, exam, onExam, disabled }: {
  idPrefix: string; exam: ExamDetails; onExam: (update: (current: ExamDetails) => ExamDetails) => void; disabled: boolean;
}) {
  const field = (key: keyof ExamDetails, label: string) => <label htmlFor={`${idPrefix}-exam-${key}`}>{label}<input id={`${idPrefix}-exam-${key}`}
    value={exam[key]} maxLength={MAX_EXAM_TEXT} onChange={event => { const value = event.target.value; onExam(current => ({ ...current, [key]: value })); }} /></label>;
  return <details className="exam-details">
    <summary>Session details <span>(optional)</span><ChevronDown size={15} aria-hidden="true" /></summary>
    <fieldset disabled={disabled}>
      <legend className="sr-only">Session details</legend>
      <div className="exam-details-fields">{field('title', 'Title')}{field('room', 'Room')}{field('proctor', 'In charge')}</div>
      <p>Printed on the PDF. Leave blank to fill in by hand.</p>
    </fieldset>
  </details>;
}

export function preparingText(received: number) {
  return `Finding students… ${Math.min(received, SETUP_FRAMES)} of ${SETUP_FRAMES}`;
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
  const heading = useRef<HTMLHeadingElement>(null);
  // The adjuster replaces the setup buttons, so keyboard focus moves to its heading.
  useEffect(() => { heading.current?.focus(); }, []);
  return <div className="seat-adjuster">
    <h3 ref={heading} tabIndex={-1}>{initial.length ? 'Adjust seats' : 'Draw seats'}</h3>
    <p className="review-help">Drag a box around each student’s head.</p>
    <SeatEditor source={{ kind: 'image', url: image }} seats={draft} onChange={setDraft} disabled={false} onPlayable={setReady} />
    <div className="camera-actions">
      <Button size="lg" className="camera-primary" onClick={() => onSave(draft)} disabled={!ready || !draft.length}>Use these seats</Button>
      <Button variant="outline" onClick={onCancel}>Cancel</Button>
    </div>
    {!draft.length && <p className="review-help">Add at least one seat to continue.</p>}
  </div>;
}

/**
 * A number input that keeps what is typed (an empty field, "0.") until it loses focus, instead of snapping
 * back to the last valid number. `onValue` gets each finite value, or null when the field is cleared.
 */
function NumberField({ value, onValue, ...props }: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: number | null; onValue: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return <input type="number" {...props} value={draft ?? (value === null ? '' : String(value))}
    onChange={event => {
      const text = event.target.value;
      setDraft(text);
      if (text.trim() === '') onValue(null);
      else if (Number.isFinite(Number(text))) onValue(Number(text));
    }}
    onBlur={event => { setDraft(null); props.onBlur?.(event); }} />;
}

const RULE_FIELDS = [
  { key: 'min_duration', label: `${MOVEMENT_LABELS.min_duration} (s)`, max: 300, step: .25, help: 'How long a head must stay turned.' },
  { key: 'repetition_count', label: MOVEMENT_LABELS.repetition_count, max: 100, step: 1, help: 'Turns that count as repeated.' },
  { key: 'repetition_window', label: `${MOVEMENT_LABELS.repetition_window} (s)`, max: 300, step: .25, help: 'Time in which the turns must happen.' },
  { key: 'repeat_min_duration', label: `${MOVEMENT_LABELS.repeat_min_duration} (s)`, max: 300, step: .05, help: 'How long each turn must last.' },
] as const;

/** Short wording per screen: a recording has no live camera, so its panel never mentions one. */
const ADVANCED_TEXT = {
  camera: { intro: 'Optional. Camera settings apply at Start; rules at Start monitoring.', input: 'Camera input', mirrored: 'Picture is mirrored',
    headTurns: 'Reads turns when the face is hidden. Turn off if running slowly.' },
  recording: { intro: 'Optional. Video settings apply when you choose it; rules at Start review.', input: 'Video', mirrored: 'Video is mirrored',
    headTurns: 'Reads turns when the face is hidden. Off is faster.' },
} as const;

/**
 * `source` picks the wording. `fixedMaxGap` (recordings): the maximum gap is fixed, so its field is read-only and
 * the speed lines are hidden.
 */
export function CameraAdvancedSettings({ source = 'camera', inputLocked, rulesLocked, mirrored, onMirrored, tileGrid, onTileGrid, headTurns, onHeadTurns, rules, onRules, gapOverride, onGapOverride, measured, fixedMaxGap }: {
  source?: keyof typeof ADVANCED_TEXT;
  inputLocked: boolean; rulesLocked: boolean;
  mirrored: boolean; onMirrored: (value: boolean) => void; tileGrid: number; onTileGrid: (value: number) => void;
  headTurns: boolean; onHeadTurns: (value: boolean) => void;
  rules: MovementRules; onRules: (rules: MovementRules) => void;
  gapOverride: number | null; onGapOverride: (value: number | null) => void; measured: MeasuredSpeed | null;
  fixedMaxGap?: number;
}) {
  const fixed = fixedMaxGap !== undefined;
  const fps = measured && measured.medianInterval > 0 ? 1 / measured.medianInterval : null;
  const text = ADVANCED_TEXT[source];
  return <details className="advanced-settings camera-advanced">
    <summary>Advanced settings <span>(optional)</span><ChevronDown size={15} aria-hidden="true" /></summary>
    <p>{text.intro}</p>
    <fieldset disabled={inputLocked} className="camera-advanced-group"><legend>{text.input}</legend>
      <label className="checkbox-label"><input type="checkbox" checked={mirrored} onChange={event => onMirrored(event.target.checked)} aria-describedby="camera-mirrored-help" />{text.mirrored}</label>
      <p id="camera-mirrored-help">Only if left and right are flipped.</p>
      <label className="tiling-label" htmlFor="camera-tiling">Detector tiles<select id="camera-tiling" value={tileGrid} aria-describedby="camera-tiling-help" onChange={event => onTileGrid(Number(event.target.value))}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>{value === 1 ? '1 — full frame' : `${value} — slower`}</option>)}</select></label>
      <p id="camera-tiling-help">More tiles find small faces at the back, but run slower.</p>
      <label className="checkbox-label"><input type="checkbox" checked={headTurns} onChange={event => onHeadTurns(event.target.checked)} aria-describedby="camera-head-turns-help" />Read strong head turns</label>
      <p id="camera-head-turns-help">{text.headTurns}</p>
    </fieldset>
    <fieldset disabled={rulesLocked} className="camera-advanced-group"><legend>Movement rules</legend>
      <div className="review-setting-grid">
        {RULE_FIELDS.map(({ key, label, max, step, help }) => <label key={key}>{label}
          <NumberField min={key === 'repetition_count' ? 2 : step} max={max} step={step} value={rules[key]} aria-describedby={`camera-rule-${key}`}
            onValue={next => onRules({ ...rules, [key]: next ?? Number.NaN })} />
          <small id={`camera-rule-${key}`}>{help}</small></label>)}
        <label>{MOVEMENT_LABELS.max_gap} (s)
          <NumberField min={.05} max={5} step={.05} value={fixed ? fixedMaxGap : gapOverride ?? measured?.maxGap ?? null} placeholder="Automatic" readOnly={fixed}
            aria-describedby={fixed ? 'camera-rule-max-gap' : 'camera-rule-max-gap camera-max-gap-help'} onValue={fixed ? () => {} : onGapOverride} />
          <small id="camera-rule-max-gap">{fixed ? 'Fixed for videos.' : gapOverride === null ? 'Automatic.' : 'Set by you.'}</small></label>
      </div>
      {!fixed && <>
        <p id="camera-max-gap-help">Joins short unseen moments into one movement; set from the measured speed.</p>
        {measured && fps !== null && <p>Measured: {fps.toFixed(1)} frames/s · automatic gap {measured.maxGap} s</p>}
        {measured?.tooSlow && fps !== null && <p role="note">Too slow for alerts ({fps.toFixed(1)} frames/s): use fewer detector tiles.</p>}
        {gapOverride !== null && <button type="button" className="review-secondary-action" onClick={() => onGapOverride(null)}>Use automatic gap</button>}
      </>}
    </fieldset>
  </details>;
}
