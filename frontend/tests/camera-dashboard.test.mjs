import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFLICT_TEXT, LONG_SESSION_TEXT, MUTE_KEY, alertsFromRecord, announceAlerts, formatElapsed, longSessionWarning,
  mergeAlerts, newestOpenAlert, openAlertSeats, pruneFrameTimes, readMuted, recentIntervals, runningStatus,
  seatsObserved, shortcutMark, sortAlerts, withAlert, writeMuted,
} from '../src/lib/camera-dashboard.ts';

const alert = (id, extra = {}) => ({ id, seatId: 'seat-4', direction: 'right', openedAt: 10, lastAt: 12, eventIndexes: [0],
  still: null, stillError: null, mark: null, note: '', markedAt: null, ...extra });

test('a frame adds new alerts once and reports only newly opened ones for the chime', () => {
  const first = mergeAlerts({}, [alert('alert-1')]);
  assert.deepEqual(first.opened.map(a => a.id), ['alert-1']);
  const update = mergeAlerts(first.alerts, [alert('alert-1', { eventIndexes: [0, 3], lastAt: 20 })]);
  assert.deepEqual(update.opened, []);
  assert.deepEqual(update.alerts['alert-1'].eventIndexes, [0, 3]);
  assert.equal(mergeAlerts(update.alerts, []).alerts, update.alerts);
});

test('a late frame never reopens an alert already marked here', () => {
  const marked = withAlert({}, alert('alert-1', { mark: 'Checked', note: 'ok' }));
  const merged = mergeAlerts(marked, [alert('alert-1', { eventIndexes: [0, 1] })]);
  assert.equal(merged.alerts['alert-1'].mark, 'Checked');
  assert.deepEqual(merged.opened, []);
  // An alert first seen already marked (another tab) does not chime either.
  assert.deepEqual(mergeAlerts({}, [alert('alert-2', { mark: 'Dismissed' })]).opened, []);
});

test('alerts sort newest first and the newest open one gets the shortcuts', () => {
  const map = alertsFromRecord([alert('alert-1', { openedAt: 5 }), alert('alert-2', { openedAt: 30, mark: 'Checked' }),
    alert('alert-3', { openedAt: 20 }), alert('alert-10', { openedAt: 20 })]);
  const sorted = sortAlerts(map);
  assert.deepEqual(sorted.map(a => a.id), ['alert-2', 'alert-10', 'alert-3', 'alert-1']);
  assert.equal(newestOpenAlert(sorted).id, 'alert-10');
  assert.equal(newestOpenAlert([alert('alert-1', { mark: 'Checked' })]), null);
});

test('a seat stays highlighted while it has an open alert', () => {
  const map = alertsFromRecord([alert('alert-1', { seatId: 'seat-1', mark: 'Checked' }), alert('alert-2', { seatId: 'seat-2' }),
    alert('alert-3', { seatId: 'seat-1', direction: 'left' })]);
  assert.deepEqual([...openAlertSeats(map)].sort(), ['seat-1', 'seat-2']);
  assert.deepEqual([...openAlertSeats(withAlert(map, { ...map['alert-3'], mark: 'Dismissed' }))], ['seat-2']);
});

test('the running check uses only frames from the last 10 s of session time', () => {
  // Slow frames early in the session, fast frames in the last 10 s.
  const times = [0, 2, 4, 6, 8, 10, ...Array.from({ length: 31 }, (_, i) => 20 + i / 3)];
  const now = 30;
  const intervals = recentIntervals(times, now);
  assert.ok(intervals.length >= 29);
  for (const interval of intervals) assert.ok(Math.abs(interval - 1 / 3) < 1e-9);
  const status = runningStatus(times, now, 0.75);
  assert.equal(status.slow, false);
  assert.equal(status.text, 'Running smoothly');
  assert.equal(status.detail, null);
  assert.ok(Math.abs(status.fps - 3) < 1e-6);
});

test('slow recent frames give the plain warning and keep the exact text for details', () => {
  const times = [0, 1, 2, 3, 4, 5];
  const status = runningStatus(times, 5, 0.75);
  assert.equal(status.slow, true);
  assert.equal(status.text, 'Running slowly: alerts may be missed');
  assert.equal(status.detail, 'Processing is too slow for movement alerts (1.0 frames per second). Use fewer detector tiles.');
  assert.equal(runningStatus([], 0, 0.75).text, 'Running smoothly');
  assert.equal(runningStatus([], 0, 0.75).fps, null);
});

test('old frame times are pruned outside the window', () => {
  assert.deepEqual(pruneFrameTimes([1, 5, 12, 19], 20), [12, 19]);
  assert.deepEqual(pruneFrameTimes([1, 2], 20), []);
  const kept = [15, 16];
  assert.equal(pruneFrameTimes(kept, 20), kept);
});

test('elapsed time, the 2 h 45 min banner and observed seats', () => {
  assert.equal(formatElapsed(0), '0:00');
  assert.equal(formatElapsed(725.9), '12:05');
  assert.equal(formatElapsed(3600 + 61), '1:01:01');
  assert.equal(longSessionWarning(9899.9), null);
  assert.equal(longSessionWarning(9900), LONG_SESSION_TEXT);
  assert.equal(LONG_SESSION_TEXT, 'Monitoring stops automatically at 3 hours. Stop and start a new session to continue.');
  const states = { 'seat-1': { direction: 'forward', reason: null }, 'seat-2': { direction: 'unknown', reason: 'no head' } };
  assert.equal(seatsObserved(['seat-1', 'seat-2', 'seat-3'], states), 1);
  assert.equal(seatsObserved(['seat-1'], undefined), 0);
});

test('C and D shortcuts are ignored while typing or with modifier keys', () => {
  assert.equal(shortcutMark('c', { tagName: 'BODY' }), 'Checked');
  assert.equal(shortcutMark('D', { tagName: 'button' }), 'Dismissed');
  assert.equal(shortcutMark('c', { tagName: 'TEXTAREA' }), null);
  assert.equal(shortcutMark('d', { tagName: 'INPUT' }), null);
  assert.equal(shortcutMark('c', { tagName: 'DIV', isContentEditable: true }), null);
  assert.equal(shortcutMark('c', null, { metaKey: true }), null);
  assert.equal(shortcutMark('x', null), null);
});

test('new alerts are announced in plain words', () => {
  assert.equal(announceAlerts([alert('alert-1')]), 'New alert: check seat 4');
  assert.equal(announceAlerts([alert('a', { seatId: 'seat-1' }), alert('b', { seatId: 'seat-6' })]), 'New alert: check seat 1. New alert: check seat 6');
  assert.equal(CONFLICT_TEXT, 'This alert changed in another tab. Check it again.');
});

test('mute is remembered and blocked storage is tolerated', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.equal(readMuted(storage), false);
  writeMuted(true, storage);
  assert.equal(data.get(MUTE_KEY), 'true');
  assert.equal(readMuted(storage), true);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readMuted(blocked), false);
  assert.doesNotThrow(() => writeMuted(true, blocked));
  assert.equal(readMuted(null), false);
});
