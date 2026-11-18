import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MOVEMENT } from '../src/lib/review-contract.ts';
import {
  DEVICE_KEY, GUIDE_KEY, SETUP_FRAMES, cameraMovement, newSetupProgress, numberSeats, pickDevice, readGuideSeen, readSavedDevice,
  recordSetupResult, seatLabel, seatsForMonitor, setupComplete, setupStep, shouldMarkSetup, markSetupFrame, writeGuideSeen, writeSavedDevice,
} from '../src/lib/camera-setup.ts';

test('setup marks one frame per second until five are sent and collects result intervals', () => {
  const p = newSetupProgress();
  const marked = [];
  for (let t = 0.1; t < 8; t += 0.3) {
    const time = Math.round(t * 10) / 10;
    const setup = shouldMarkSetup(p, time);
    if (setup) { markSetupFrame(p, time); marked.push(time); }
    recordSetupResult(p, time, setup);
  }
  assert.equal(marked.length, SETUP_FRAMES);
  for (let i = 1; i < marked.length; i++) assert.ok(marked[i] - marked[i - 1] >= 1 - 1e-9);
  assert.ok(setupComplete(p));
  assert.ok(p.intervals.length > 10);
  for (const interval of p.intervals) assert.ok(Math.abs(interval - 0.3) < 1e-9);
});

test('setup is not complete until five setup results have returned', () => {
  const p = newSetupProgress();
  for (let i = 0; i < 5; i++) { markSetupFrame(p, i); }
  assert.equal(setupComplete(p), false);
  for (let i = 0; i < 5; i++) recordSetupResult(p, i, true);
  assert.equal(setupComplete(p), true);
  assert.deepEqual(p.intervals, [1, 1, 1, 1]);
});

test('camera movement uses the saved-video rules with the measured maximum gap', () => {
  assert.deepEqual(cameraMovement(0.75), { ...DEFAULT_MOVEMENT, max_gap: 0.75 });
  assert.equal(DEFAULT_MOVEMENT.max_gap, 0.25);
});

test('seats shown on the live view are mirrored back to canonical regions for monitoring', () => {
  const seats = [{ id: 'seat-1', roi: [0.1, 0.2, 0.3, 0.4] }];
  assert.deepEqual(seatsForMonitor(seats, false), seats);
  const canonical = seatsForMonitor(seats, true);
  assert.deepEqual(canonical, [{ id: 'seat-1', roi: [1 - 0.3, 0.2, 1 - 0.1, 0.4] }]);
  assert.deepEqual(seatsForMonitor(canonical, true), [{ id: 'seat-1', roi: [1 - (1 - 0.1), 0.2, 1 - (1 - 0.3), 0.4] }]);
});

test('seats are numbered left to right as seat-1 … seat-N', () => {
  const seats = numberSeats([
    { id: 'seat-7', roi: [0.6, 0.1, 0.8, 0.3] },
    { id: 'seat-2', roi: [0.0, 0.5, 0.2, 0.7] },
    { id: 'seat-9', roi: [0.3, 0.1, 0.5, 0.3] },
  ]);
  assert.deepEqual(seats.map(s => s.id), ['seat-1', 'seat-2', 'seat-3']);
  assert.deepEqual(seats.map(s => s.roi[0]), [0.0, 0.3, 0.6]);
  assert.equal(seatLabel('seat-4'), 'Seat 4');
  assert.equal(seatLabel('front'), 'front');
});

test('the remembered camera is preselected only when it is connected', () => {
  assert.equal(pickDevice('', 'b', ['a', 'b']), 'b');
  assert.equal(pickDevice('', 'gone', ['a', 'b']), '');
  assert.equal(pickDevice('a', 'b', ['a', 'b']), 'a');
  assert.equal(pickDevice('gone', 'b', ['a', 'b']), 'b');
});

test('camera storage failures are ignored', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
  writeSavedDevice('cam-1', storage);
  assert.equal(values.get(DEVICE_KEY), 'cam-1');
  assert.equal(readSavedDevice(storage), 'cam-1');
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readSavedDevice(broken), '');
  assert.doesNotThrow(() => writeSavedDevice('cam-1', broken));
  assert.equal(DEVICE_KEY, 'ocular.camera.device');
});

test('the step indicator keeps the step Stop was pressed from while stopping', () => {
  assert.equal(setupStep('idle'), 0);
  assert.equal(setupStep('loading'), 0);
  assert.equal(setupStep('preparing'), 1);
  assert.equal(setupStep('found'), 1);
  assert.equal(setupStep('monitoring'), 2);
  assert.equal(setupStep('interrupted'), 2);
  // Stop from Find seats must not flash Monitor.
  assert.equal(setupStep('stopping', 1), 1);
  assert.equal(setupStep('stopping', 2), 2);
  assert.equal(setupStep('stopping'), 2);
});

test('the how-to guide is remembered per browser, and blocked storage never throws', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
  assert.equal(GUIDE_KEY, 'ocular.camera.guideSeen');
  assert.equal(readGuideSeen(storage), false);
  writeGuideSeen(storage);
  assert.equal(values.get(GUIDE_KEY), 'true');
  assert.equal(readGuideSeen(storage), true);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readGuideSeen(broken), false);
  assert.doesNotThrow(() => writeGuideSeen(broken));
  assert.equal(readGuideSeen(null), false);
});

import { movementProblem } from '../src/lib/camera-setup.ts';
import { validateReviewSettings } from '../src/lib/review-contract.ts';

test('movement setting problems use the Advanced settings field names, never internal names or NaN', () => {
  const ok = cameraMovement(.5);
  assert.equal(movementProblem(ok), '');
  const cases = [
    [{ min_duration: Number.NaN }, 'Enter a number for Sustained duration.'],
    [{ repetition_count: Number.NaN }, 'Enter a number for Repetition count.'],
    [{ repetition_window: Number.NaN }, 'Enter a number for Repetition window.'],
    [{ repeat_min_duration: Number.NaN }, 'Enter a number for Minimum dwell.'],
    [{ max_gap: Number.NaN }, 'Enter a number for Maximum gap.'],
    [{ min_duration: 0 }, 'Sustained duration must be more than 0 and at most 300 seconds.'],
    [{ repetition_window: 301 }, 'Repetition window must be more than 0 and at most 300 seconds.'],
    [{ max_gap: 6 }, 'Maximum gap must be more than 0 and at most 5 seconds.'],
    [{ repetition_count: 1 }, 'Repetition count must be a whole number from 2 to 100.'],
    [{ repetition_count: 2.5 }, 'Repetition count must be a whole number from 2 to 100.'],
    [{ repeat_min_duration: 12, repetition_window: 10 }, 'Minimum dwell must not be longer than the repetition window.'],
  ];
  const seats = [{ id: 'seat-1', roi: [0, 0, .5, 1] }];
  for (const [change, expected] of cases) {
    const movement = { ...ok, ...change };
    const text = movementProblem(movement);
    assert.equal(text, expected);
    assert.doesNotMatch(text, /NaN|_|min duration|repeat min|max gap/);
    // The server-side validator refuses the same values, so the helper never hides a real problem.
    assert.throws(() => validateReviewSettings({ method: 'baseline', mirrored: false, tileGrid: 1, seats, movement }));
  }
});
