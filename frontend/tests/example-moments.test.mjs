import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLE_DURATION, EXAMPLE_SEATS, EXAMPLE_TIMELINES, EXAMPLE_MOMENTS, directionAt } from '../src/lib/example-moments.ts';

test('segments cover 0..duration contiguously', () => {
  for (const seat of EXAMPLE_SEATS) {
    const segments = EXAMPLE_TIMELINES[seat.id];
    assert.ok(segments.length > 0, `seat ${seat.id} has segments`);
    assert.equal(segments[0].start, 0);
    assert.equal(segments.at(-1).end, EXAMPLE_DURATION);
    for (let i = 0; i < segments.length - 1; i++) assert.equal(segments[i].end, segments[i + 1].start, `seat ${seat.id} segment ${i}`);
  }
});

test('tag direction matches timeline at every moment', () => {
  assert.deepEqual(EXAMPLE_MOMENTS.map(m => [m.time, m.seat, directionAt(m.seat, m.time)]),
    [[12, '03', 'Left'], [24, '01', 'Down'], [36, '04', 'Right'], [38, '02', 'Unknown']]);
});

test('moments are in order and inside the session', () => {
  for (let i = 0; i < EXAMPLE_MOMENTS.length; i++) {
    const { time } = EXAMPLE_MOMENTS[i];
    assert.ok(time > 0 && time < EXAMPLE_DURATION);
    if (i) assert.ok(time > EXAMPLE_MOMENTS[i - 1].time);
  }
});

test('left and right turns are illustrative "Check seat" alerts; down and gaps are not', () => {
  const bySeat = Object.fromEntries(EXAMPLE_MOMENTS.map(m => [m.seat, m]));
  assert.match(bySeat['03'].title, /^Check seat 03/);
  assert.match(bySeat['04'].title, /^Check seat 04/);
  assert.match(bySeat['01'].note, /down never alerts/i);
  assert.doesNotMatch(bySeat['01'].title, /^Check seat/);
  assert.match(bySeat['02'].title, /out of view/i);
  assert.match(bySeat['02'].note, /gaps are never filled in/i);
});

test('example copy avoids accusatory wording', () => {
  const text = EXAMPLE_MOMENTS.map(m => `${m.title} ${m.note}`).join(' ');
  assert.doesNotMatch(text, /cheat|suspicious|catch|incident|violation/i);
});
