import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DELETE_CONFIRM_TEXT, countText, displaySeats, leaveAction, formatClock, formatDuration, formatSessionDate, interruptedAt, interruptionText,
  reportFilename, reportUrl, stateLabel, alertSummary,
} from '../src/lib/camera-sessions.ts';

test('session states read in plain words', () => {
  assert.equal(stateLabel('ended'), 'Ended');
  assert.equal(stateLabel('interrupted'), 'Interrupted');
  assert.equal(stateLabel('monitoring'), 'Live now');
});

test('the interruption text uses the local hh:mm clock', () => {
  const at = new Date(2026, 10, 18, 9, 5, 42);
  assert.equal(formatClock(at), '09:05');
  assert.equal(interruptionText(at), 'Stopped at 09:05 · seats and alerts saved');
  assert.equal(formatClock(new Date(2026, 10, 18, 22, 58)), '22:58');
});

test('durations, counts and unmarked text are plain words', () => {
  assert.equal(formatDuration(0), '0 s');
  assert.equal(formatDuration(44.6), '45 s');
  assert.equal(formatDuration(60), '1 min');
  assert.equal(formatDuration(12 * 60 + 20), '12 min');
  assert.equal(formatDuration(3600), '1 h');
  assert.equal(formatDuration(3600 + 5 * 60), '1 h 5 min');
  assert.equal(formatDuration(-3), '0 s');
  assert.equal(formatDuration(NaN), '0 s');
  assert.equal(countText(1, 'seat'), '1 seat');
  assert.equal(countText(3, 'alert'), '3 alerts');
  assert.equal(alertSummary(0, 0), 'No alerts');
  assert.equal(alertSummary(4, 2), '4 alerts · 2 to check');
  assert.equal(alertSummary(1, 0), '1 alert · all marked');
});

test('the interruption time comes from the record, or is estimated for a crashed server', () => {
  assert.equal(interruptedAt({ interruptedAt: '2026-11-18T10:58:00.000Z', segments: [], lastTime: 0, createdAt: '2026-11-18T10:00:00.000Z' }).toISOString(),
    '2026-11-18T10:58:00.000Z');
  // Left `monitoring`: the last segment started at 10:30 with session time 600 s, and the last frame was at 900 s.
  const estimated = interruptedAt({ interruptedAt: null, lastTime: 900, createdAt: '2026-11-18T10:00:00.000Z',
    segments: [{ startedAt: '2026-11-18T10:30:00.000Z', offsetSeconds: 600, endSeconds: null }] });
  assert.equal(estimated.toISOString(), '2026-11-18T10:35:00.000Z');
  // A first segment with a negative offset (preview time before monitoring) counts from zero.
  const first = interruptedAt({ lastTime: 30, createdAt: 'x', segments: [{ startedAt: '2026-11-18T10:00:00.000Z', offsetSeconds: -4, endSeconds: null }] });
  assert.equal(first.toISOString(), '2026-11-18T10:00:30.000Z');
});

test('saved seats are flipped back for a mirrored live view and copied otherwise', () => {
  const seats = [{ id: 'seat-1', roi: [0.1, 0.2, 0.3, 0.4] }];
  const mirrored = displaySeats({ seats, mirrored: true });
  assert.equal(mirrored[0].roi[0].toFixed(2), '0.70');
  assert.equal(mirrored[0].roi[2].toFixed(2), '0.90');
  assert.deepEqual(mirrored[0].roi.slice(1, 4).filter((_, i) => i !== 1), [0.2, 0.4]);
  const plain = displaySeats({ seats, mirrored: false });
  assert.deepEqual(plain, seats);
  assert.notEqual(plain[0].roi, seats[0].roi);
});

test('mirroring the saved seats twice gives back the live-view seats', () => {
  const seats = [{ id: 'seat-1', roi: [0.1, 0.2, 0.3, 0.4] }, { id: 'seat-2', roi: [0.55, 0.1, 0.8, 0.5] }];
  const twice = displaySeats({ seats: displaySeats({ seats, mirrored: true }), mirrored: true });
  twice.forEach((seat, index) => seat.roi.forEach((value, i) => assert.ok(Math.abs(value - seats[index].roi[i]) < 1e-9)));
});

test('leaving decides on whether a record exists, not on the screen phase', () => {
  assert.equal(leaveAction(null), 'none');
  assert.equal(leaveAction(undefined), 'none');
  // A preview (Getting ready, Found seats) has nothing to keep.
  assert.equal(leaveAction({}), 'stop');
  // Start monitoring answered but the screen still shows Found seats: the record is paused, not ended.
  assert.equal(leaveAction({ recordId: 'r1' }), 'pause');
  // The seat check of a resume, before the new worker has the record: back to the interrupted view.
  assert.equal(leaveAction({ resumeOf: 'r1' }), 'cancel-resume');
  // Yes, resume answered but the screen still shows the seat check: the record is paused again.
  assert.equal(leaveAction({ resumeOf: 'r1', recordId: 'r1' }), 'pause');
});

test('report links, file names and dates', () => {
  assert.equal(reportUrl('abc'), '/api/camera/sessions/abc/report');
  assert.equal(reportFilename(new Date(2026, 10, 18, 9, 5).toISOString()), 'ocular-camera-session-2026-11-18-0905.pdf');
  assert.equal(reportFilename('nope'), 'ocular-camera-session.pdf');
  assert.match(formatSessionDate(new Date(2026, 10, 18, 9, 5).toISOString()), /2026, 09:05$/);
  assert.equal(formatSessionDate('nope'), 'Unknown date');
  assert.equal(DELETE_CONFIRM_TEXT, 'Delete this session and its photos? This cannot be undone.');
});

import { stopSession } from '../src/lib/camera-sessions.ts';

const reply = (status, body = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function fakeFetch(answers) {
  const calls = [];
  const request = async (url, init) => { calls.push([init.method, url]); return answers.shift()(); };
  return { calls, request };
}

test('Stop on a monitored session whose worker is gone ends the saved record', async () => {
  const { calls, request } = fakeFetch([() => reply(404, { error: 'Camera session ended. Start again.' }), () => reply(200, { record: { state: 'ended' } })]);
  assert.deepEqual(await stopSession('s-1', 'r-1', request), { ok: true });
  assert.deepEqual(calls, [['DELETE', '/api/camera/s-1'], ['POST', '/api/camera/sessions/r-1/end']]);
});

test('Stop reports not saved when ending the saved record fails', async () => {
  const { request } = fakeFetch([() => reply(404), () => reply(409, { error: 'busy' })]);
  assert.deepEqual(await stopSession('s-1', 'r-1', request), { ok: false, message: 'The session is not saved yet. Press Stop again.', detail: 'busy' });
});

test('Stop on a preview session treats 404 as stopped, and a saved Stop needs no End', async () => {
  const preview = fakeFetch([() => reply(404)]);
  assert.deepEqual(await stopSession('s-1', undefined, preview.request), { ok: true });
  assert.equal(preview.calls.length, 1);
  const saved = fakeFetch([() => reply(200, { recordId: 'r-1', saveError: null })]);
  assert.deepEqual(await stopSession('s-1', 'r-1', saved.request), { ok: true });
  assert.equal(saved.calls.length, 1);
});
