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
export function cameraMovement(maxGap: number): typeof DEFAULT_MOVEMENT {
  return { ...DEFAULT_MOVEMENT, max_gap: maxGap };
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
