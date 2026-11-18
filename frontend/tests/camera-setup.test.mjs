import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MOVEMENT } from '../src/lib/review-contract.ts';
import {
  DEVICE_KEY, SETUP_FRAMES, cameraMovement, newSetupProgress, numberSeats, pickDevice, readSavedDevice,
  recordSetupResult, seatLabel, seatsForMonitor, setupComplete, shouldMarkSetup, markSetupFrame, writeSavedDevice,
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
