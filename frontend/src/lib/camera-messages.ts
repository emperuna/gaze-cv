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
  const interrupted = screen === 'interrupted';
  if (name === 'NotAllowedError') return { text: `Allow camera access in the browser, then press ${action} again.`, detail: '' };
  if (name === 'NotFoundError') return { text: interrupted ? 'No camera found: reconnect it, or press Back to past sessions to pick another.'
    : `No camera found: connect it, then press ${action} again.`, detail: '' };
  if (name === 'NotReadableError') return { text: `The camera is busy: close other apps using it, then press ${action} again.`, detail: '' };
  if (name === 'OverconstrainedError') return { text: interrupted ? 'That camera is unavailable: reconnect it, or press Back to past sessions to pick another.'
    : `That camera is unavailable: choose another, then press ${action} again.`, detail: '' };
  return describeProblem(error, `The camera stopped. Press ${action} again.`);
}
