import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MOVEMENT } from '../src/lib/review-contract.ts';
import { RevisionError, alertTitle, applyFrame, chooseMaxGap, markAlert, newRecord, openAlertKeys, rateWarning } from '../src/lib/live-alerts.ts';

const settings = () => ({ mirrored: false, tileGrid: 1, seats: [{ id: 'seat-4', roi: [0, 0, 1, 1] }], movement: { ...DEFAULT_MOVEMENT }, maxGapAuto: true });
const fresh = () => newRecord('s1', settings(), new Date('2026-01-01T00:00:00Z'));
const seen = { 'seat-4': { direction: 'right', reason: null } };
const ev = (start, end, changes = {}) => ({ seat_id: 'seat-4', event_type: 'sustained_movement', direction: 'right',
  start_time: start, end_time: end, duration: end - start, observed_at: end, review_required: true, review_label: 'For review', ...changes });

test('repeated then sustained in one turn gives one alert', () => {
  const r = fresh();
  const a = applyFrame(r, 1, seen, [ev(0, 1, { event_type: 'repeated_movement', repetition_count: 3, still: 'AAAA' })]);
  const b = applyFrame(r, 3, seen, [ev(0, 3)]);
  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0].eventIndexes.length, 2);
  assert.equal(a.opened.length, 1);
  assert.equal(b.opened.length, 0);
  assert.equal(b.updated.length, 1);
  assert.equal(r.alerts[0].id, 'alert-1');
  assert.deepEqual(openAlertKeys(r), [['seat-4', 'right']]);
});

test('events join an open alert without a new still', () => {
  const r = fresh();
  applyFrame(r, 1, seen, [ev(0, 1, { still: 'AAAA' })]);
  const b = applyFrame(r, 2, seen, [ev(0, 2, { still: 'BBBB' })]);
  assert.equal(b.opened.length, 0);
  assert.equal(r.alerts[0].still, 'AAAA');
  assert.equal(r.stillsSaved, 1);
});

test('marking closes the alert and the next event opens a new one with a still', () => {
  const r = fresh();
  applyFrame(r, 1, seen, [ev(0, 1, { still: 'AAAA' })]);
  markAlert(r, 'alert-1', 'Checked', 'ok', r.revision, new Date());
  assert.deepEqual(openAlertKeys(r), []);
  const b = applyFrame(r, 5, seen, [ev(3, 5, { still: 'CCCC' })]);
  assert.equal(b.opened.length, 1);
  assert.equal(b.opened[0].still, 'CCCC');
  assert.equal(r.alerts.length, 2);
  assert.equal(r.alerts[1].id, 'alert-2');
});

test('left and right alerts for one seat stay separate', () => {
  const r = fresh();
  applyFrame(r, 2, seen, [ev(0, 2), ev(0, 2, { direction: 'left' })]);
  assert.equal(r.alerts.length, 2);
});

test('down event creates no alert', () => {
  const r = fresh();
  const out = applyFrame(r, 2, seen, [ev(0, 2, { direction: 'down', review_required: false })]);
  assert.equal(r.alerts.length, 0);
  assert.equal(out.opened.length, 0);
});

test('stale revision is refused', () => {
  const r = fresh();
  applyFrame(r, 1, seen, [ev(0, 1)]);
  markAlert(r, 'alert-1', 'Dismissed', '', r.revision, new Date());
  const before = JSON.stringify(r);
  assert.throws(() => markAlert(r, 'alert-1', 'Checked', '', r.revision - 1, new Date()), RevisionError);
  assert.equal(JSON.stringify(r), before);
});

test('coverage records unknown runs of 2 s or more only', () => {
  const r = fresh();
  const unknown = { 'seat-4': { direction: 'unknown', reason: 'no face' } };
  applyFrame(r, 0, seen, []);
  applyFrame(r, 1, unknown, []);
  applyFrame(r, 2, seen, []); // 1 s run: not a gap
  applyFrame(r, 3, unknown, []);
  applyFrame(r, 4, unknown, []);
  applyFrame(r, 5.5, seen, []); // 2.5 s run
  const c = r.coverage['seat-4'];
  assert.deepEqual(c.gaps, [{ start: 3, end: 5.5 }]);
  assert.equal(c.frames, 6);
  assert.equal(c.observedFrames, 3);
  assert.equal(c.unknownSince, null);
  applyFrame(r, 6, unknown, []);
  assert.equal(r.coverage['seat-4'].unknownSince, 6);
});

test('gap list caps at 200 per seat', () => {
  const r = fresh();
  const unknown = { 'seat-4': { direction: 'unknown', reason: null } };
  for (let i = 0; i < 205; i++) {
    applyFrame(r, i * 10, unknown, []);
    applyFrame(r, i * 10 + 3, seen, []);
  }
  assert.equal(r.coverage['seat-4'].gaps.length, 200);
  assert.equal(r.coverage['seat-4'].omittedGaps, 5);
});

test('minutes accumulate direction counts and stills cap at 200', () => {
  const r = fresh();
  applyFrame(r, 61, seen, []);
  applyFrame(r, 62, seen, []);
  assert.deepEqual(r.minutes, [{ minute: 1, counts: { right: 2 } }]);
  r.stillsSaved = 200;
  const out = applyFrame(r, 70, seen, [ev(68, 70, { still: 'AAAA' })]);
  assert.equal(out.opened[0].alert.still, null);
  assert.equal(out.opened[0].alert.stillError, 'Still limit reached');
  assert.equal(r.framesProcessed, 3);
  assert.equal(r.lastTime, 70);
});

test('chooseMaxGap rounds 2.5x the median up to 0.25 s and clamps', () => {
  // At least 1 s: a face can drop out for up to about a second on a phone camera.
  assert.deepEqual(chooseMaxGap([0.29, 0.29, 0.29]), { maxGap: 1, tooSlow: false, medianInterval: 0.29 });
  assert.equal(chooseMaxGap([0.5]).maxGap, 1.25);
  assert.equal(chooseMaxGap([0.1]).maxGap, 1);
  const mid = chooseMaxGap([0.7]);
  assert.equal(mid.maxGap, 1.5); assert.equal(mid.tooSlow, false);
  assert.equal(chooseMaxGap([1.6]).tooSlow, true);
});

test('rateWarning', () => {
  assert.equal(rateWarning([0.3, 0.3], 0.75), null);
  assert.equal(rateWarning([0.5, 0.5], 0.75), null);
  assert.equal(rateWarning([0.9, 0.9], 0.75), 'Too slow for alerts (1.1 frames/s): use fewer detector tiles.');
});

test('alertTitle', () => {
  const r = fresh();
  applyFrame(r, 3, seen, [ev(1, 3.4)]);
  assert.equal(alertTitle(r.alerts[0], r.events), 'Check seat 4: looking right for 2.4 s');
  const g = fresh();
  applyFrame(g, 650, seen, [ev(642, 644), ev(642, 646), ev(642, 650)]);
  assert.equal(alertTitle(g.alerts[0], g.events), 'Check seat 4 · right · 3 events since 10:42');
  const rep = fresh();
  applyFrame(rep, 10, seen, [ev(0, 10, { event_type: 'repeated_movement', repetition_count: 3 })]);
  assert.equal(alertTitle(rep.alerts[0], rep.events), 'Check seat 4: turned right 3 times in 10 s');
});

test('an alert says when its turn was read from the shape of the head', async () => {
  const { readFromHeadShape } = await import('../src/lib/live-alerts.ts');
  const events = [{ estimation_source: 'facial_landmarks' }, { estimation_source: 'head_pose_fallback' }, {}];
  assert.equal(readFromHeadShape({ eventIndexes: [0, 2] }, events), false);
  assert.equal(readFromHeadShape({ eventIndexes: [0, 1] }, events), true);
});

test('applyFrame groups recording events within 30 s and opens a new alert after a longer pause', () => {
  const r = fresh();
  const opts = { groupWithinSeconds: 30 };
  applyFrame(r, 1, seen, [ev(0, 1)], opts);
  applyFrame(r, 21, seen, [ev(20, 21)], opts);
  applyFrame(r, 71, seen, [ev(70, 71)], opts);
  assert.equal(r.alerts.length, 2);
  assert.equal(r.alerts[0].eventIndexes.length, 2);
  assert.equal(r.alerts[1].openedAt, 70);
});

test('without the option live grouping is unchanged', () => {
  const r = fresh();
  applyFrame(r, 1, seen, [ev(0, 1)]);
  applyFrame(r, 71, seen, [ev(70, 71)]);
  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0].eventIndexes.length, 2);
});
