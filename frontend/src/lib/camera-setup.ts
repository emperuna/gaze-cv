import { DEFAULT_MOVEMENT, mirrorSeats } from './review-contract.ts';
import type { ReviewSeat } from './review-contract.ts';

/**
 * The highlighted step of "1 Connect camera · 2 Find seats · 3 Monitor" (0-based). While stopping, the step
 * stopped from stays highlighted (`stoppedFrom`), so stopping from Find seats does not flash Monitor.
 */
export function setupStep(phase: string, stoppedFrom: number | null = null): number {
  if (phase === 'idle' || phase === 'permission' || phase === 'loading') return 0;
  if (phase === 'preparing' || phase === 'found') return 1;
  if (phase === 'stopping') return stoppedFrom ?? 2;
  return 2;
}

/** Frames kept by the worker for seat finding, and their spacing in capture time. */
export const SETUP_FRAMES = 5;
export const SETUP_SPACING_SECONDS = 1;
export const DEVICE_KEY = 'ocular.camera.device';

/**
 * "Getting ready" progress. `intervals` are capture-time deltas between consecutive processed
 * results (used for the automatic maximum gap); `received` counts setup frames whose result returned.
 */
export interface SetupProgress { sent: number; received: number; lastSetupAt: number | null; lastResultAt: number | null; intervals: number[] }

export function newSetupProgress(): SetupProgress {
  return { sent: 0, received: 0, lastSetupAt: null, lastResultAt: null, intervals: [] };
}

export function shouldMarkSetup(progress: SetupProgress, timestamp: number): boolean {
  return progress.sent < SETUP_FRAMES &&
    (progress.lastSetupAt === null || timestamp - progress.lastSetupAt >= SETUP_SPACING_SECONDS - 1e-9);
}

export function markSetupFrame(progress: SetupProgress, timestamp: number) {
  progress.sent++;
  progress.lastSetupAt = timestamp;
}

export function recordSetupResult(progress: SetupProgress, timestamp: number, setup: boolean) {
  if (progress.lastResultAt !== null && timestamp > progress.lastResultAt) progress.intervals.push(timestamp - progress.lastResultAt);
  progress.lastResultAt = timestamp;
  if (setup) progress.received++;
}

export function setupComplete(progress: SetupProgress): boolean {
  return progress.received >= SETUP_FRAMES;
}

/** The saved-video movement rules (`MovementSettings`) with the camera's own maximum gap. */
/** Live glances at a neighbour measured on an iPhone test clip lasted about 1.3–1.7 s, so the camera's sustained
 * rule is 1.5 s (saved video keeps 2 s). Still adjustable under Advanced settings. */
export const CAMERA_MIN_DURATION = 1.5;

export function cameraMovement(maxGap: number): typeof DEFAULT_MOVEMENT {
  return { ...DEFAULT_MOVEMENT, min_duration: CAMERA_MIN_DURATION, max_gap: maxGap };
}

/** The camera screen's editable movement rules before setup measures the maximum gap. */
export function cameraRules(): Omit<typeof DEFAULT_MOVEMENT, 'max_gap'> {
  const { max_gap: _gap, ...rules } = cameraMovement(1);
  return rules;
}

type MovementKey = keyof typeof DEFAULT_MOVEMENT;
/** The movement-rule names the instructor sees in Advanced settings (without the "(s)" unit). */
export const MOVEMENT_LABELS: Record<MovementKey, string> = {
  min_duration: 'Sustained duration', repetition_count: 'Repetition count', repetition_window: 'Repetition window',
  repeat_min_duration: 'Minimum dwell', max_gap: 'Maximum gap',
};
const MOVEMENT_ORDER: MovementKey[] = ['min_duration', 'repetition_count', 'repetition_window', 'repeat_min_duration', 'max_gap'];
const MOVEMENT_MAX: Record<Exclude<MovementKey, 'repetition_count'>, number> = { min_duration: 300, repetition_window: 300, repeat_min_duration: 300, max_gap: 5 };

/**
 * The first problem with the movement rules, in the words of the Advanced settings fields, or '' when they
 * are valid. It checks the same limits as `validateReviewSettings`; an emptied field asks for a number.
 */
export function movementProblem(movement: Record<MovementKey, number>): string {
  for (const key of MOVEMENT_ORDER) {
    const value = movement[key], label = MOVEMENT_LABELS[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return `Enter a number for ${label}.`;
    if (key === 'repetition_count') {
      if (!Number.isInteger(value) || value < 2 || value > 100) return `${label} must be a whole number from 2 to 100.`;
    } else if (value <= 0 || value > MOVEMENT_MAX[key]) return `${label} must be more than 0 and at most ${MOVEMENT_MAX[key]} seconds.`;
  }
  if (movement.repeat_min_duration > movement.repetition_window) return `${MOVEMENT_LABELS.repeat_min_duration} must not be longer than the ${MOVEMENT_LABELS.repetition_window.toLowerCase()}.`;
  return '';
}

/**
 * Seats are kept in the coordinates of the captured camera pixels, which is what the live view draws
 * and what seat finding returns. The worker matches heads in unmirrored coordinates, so mirrored
 * input is flipped back before monitoring starts (as the saved-video review does).
 */
export function seatsForMonitor(seats: ReviewSeat[], mirrored: boolean): ReviewSeat[] {
  return mirrored ? mirrorSeats(seats) : seats.map(s => ({ id: s.id, roi: [...s.roi] as ReviewSeat['roi'] }));
}

/** Seats `seat-1` … `seat-N`, left to right on the live view (top first for equal centres). */
export function numberSeats(seats: ReviewSeat[]): ReviewSeat[] {
  return [...seats]
    .sort((a, b) => (a.roi[0] + a.roi[2]) - (b.roi[0] + b.roi[2]) || a.roi[1] - b.roi[1])
    .map((seat, index) => ({ id: `seat-${index + 1}`, roi: [...seat.roi] as ReviewSeat['roi'] }));
}

export function seatLabel(id: string): string {
  return /^seat-\d+$/.test(id) ? `Seat ${id.slice(5)}` : id;
}

/** Keep the current choice if connected, else the remembered camera if connected, else the default. */
export function pickDevice(current: string, saved: string, connected: string[]): string {
  if (current && connected.includes(current)) return current;
  return saved && connected.includes(saved) ? saved : '';
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
function store(storage?: Store | null): Store | null | undefined {
  return storage === undefined ? globalThis.localStorage : storage;
}

export function readSavedDevice(storage?: Store | null): string {
  try { return store(storage)?.getItem(DEVICE_KEY) ?? ''; } catch { return ''; }
}

export function writeSavedDevice(deviceId: string, storage?: Store | null) {
  try { if (deviceId) store(storage)?.setItem(DEVICE_KEY, deviceId); } catch { /* storage blocked: nothing to remember */ }
}

export const GUIDE_KEY = 'ocular.camera.guideSeen';

/**
 * Whether How to use Ocular has been shown in this browser. Blocked storage reads as "not seen", so the guide
 * still opens for someone new; it then cannot be remembered and opens on each visit.
 */
export function readGuideSeen(storage?: Store | null): boolean {
  try { return store(storage)?.getItem(GUIDE_KEY) === 'true'; } catch { return false; }
}

export function writeGuideSeen(storage?: Store | null) {
  try { store(storage)?.setItem(GUIDE_KEY, 'true'); } catch { /* storage blocked: the guide opens again next visit */ }
}
