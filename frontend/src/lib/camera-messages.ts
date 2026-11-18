/**
 * Plain-word errors for the camera screens. Each says what happened and the one thing to do next; a raw
 * server or browser message is kept separately as `detail`, shown only under "More information".
 */

export interface Problem { text: string; detail: string }

/** An error whose message is already plain words for the instructor; `detail` holds any raw server text. */
export class PlainError extends Error {
  detail: string;
  constructor(text: string, detail = '') { super(text); this.name = 'PlainError'; this.detail = detail; }
}

/** The button that tries again, and whether the screen has a camera list (the interrupted view does not). */
export type CameraAction = 'Start' | 'Resume';
export type CameraScreen = 'setup' | 'interrupted';

const rawText = (error: unknown) => error instanceof Error ? error.message : typeof error === 'string' ? error : '';

/** A problem whose text is plain: a `PlainError` keeps its own words, anything else gets `fallback`. */
export function describeProblem(error: unknown, fallback: string): Problem {
  if (error instanceof PlainError) return { text: error.message, detail: error.detail };
  return { text: fallback, detail: rawText(error) };
}

/** Opening or running the camera failed. */
export function cameraProblem(error: unknown, action: CameraAction = 'Start', screen: CameraScreen = 'setup'): Problem {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : '';
  const choose = screen === 'interrupted'
    ? 'Reconnect it and press Resume, or press Back to past sessions to choose another camera and resume from there.'
    : `Choose another camera, then press ${action} again.`;
  if (name === 'NotAllowedError') return { text: `Camera access was denied. Allow the camera in your browser and system settings, then press ${action} again.`, detail: '' };
  if (name === 'NotFoundError') return { text: screen === 'interrupted' ? `No camera was found. ${choose}` : `No camera was found. Connect the camera, then press ${action} again.`, detail: '' };
  if (name === 'NotReadableError') return { text: `The camera could not open. Close other apps using it, then press ${action} again.`, detail: '' };
  if (name === 'OverconstrainedError') return { text: `The selected camera is unavailable. ${choose}`, detail: '' };
  return describeProblem(error, `The camera stopped unexpectedly. Press ${action} again.`);
}
