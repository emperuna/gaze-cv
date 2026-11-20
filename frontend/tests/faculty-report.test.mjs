import test from 'node:test';
import assert from 'node:assert/strict';
import { clockAt, facultyReport, videoTime } from '../src/lib/faculty-report.ts';
import { DEFAULT_MOVEMENT } from '../src/lib/review-contract.ts';

// 9:00 AM in Manila (UTC+8) is 01:00 UTC. Session seconds run from 9:00; a 3-minute camera-off gap runs 9:50–9:53.
const TZ = 'Asia/Manila';
const MOVEMENT = { ...DEFAULT_MOVEMENT, min_duration: 2, repetition_count: 3, repetition_window: 10, max_gap: .75 };
const seats = [1, 2, 3, 4, 5, 6].map(n => ({ id: `seat-${n}`, roi: [((n - 1) % 3) * .33, n > 3 ? .5 : 0, ((n - 1) % 3) * .33 + .3, n > 3 ? .95 : .45] }));
const sustained = (seat, direction, start, duration) => ({ seat_id: seat, event_type: 'sustained_movement', direction, start_time: start, end_time: start + duration, duration, observed_at: start + 2, review_required: true, review_label: 'For instructor review', segment: start > 3000 ? 1 : 0 });
const repeated = (seat, direction, start, count) => ({ ...sustained(seat, direction, start, 8), event_type: 'repeated_movement', repetition_count: count });
const alert = (id, seat, direction, openedAt, lastAt, eventIndexes, mark, note, still = `stills/${id}.jpg`, markedAt = null) =>
  ({ id, seatId: seat, direction, openedAt, lastAt, eventIndexes, still, stillError: null, mark, note, markedAt });

function sample(overrides = {}) {
  const events = [sustained('seat-4', 'right', 2460, 4.2), repeated('seat-4', 'right', 2820, 4), sustained('seat-4', 'right', 3480, 2.8),
    sustained('seat-2', 'left', 3900, 2.6), sustained('seat-5', 'left', 4320, 2.1)];
  const alerts = [
    alert('alert-1', 'seat-4', 'right', 2460, 2460, [0], 'Checked', 'Turned toward the window. Asked to face forward.', 'stills/alert-1.jpg', '2026-11-20T01:42:00.000Z'),
    alert('alert-2', 'seat-4', 'right', 2820, 2940, [1], 'Checked', 'Moved closer and watched for a minute.'),
    alert('alert-3', 'seat-4', 'right', 3480, 3480, [2], null, ''),
    alert('alert-4', 'seat-2', 'left', 3900, 3900, [3], 'Dismissed', 'Dropped a pencil.'),
    alert('alert-5', 'seat-5', 'left', 4320, 4320, [4], 'Dismissed', 'Checked the wall clock.', null),
  ];
  const full = { frames: 1000, observedFrames: 1000, gaps: [], omittedGaps: 0, unknownSince: null };
  return {
    schemaVersion: 1, id: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90', state: 'ended', revision: 7,
    createdAt: '2026-11-20T01:00:00.000Z', endedAt: '2026-11-20T02:30:00.000Z',
    settings: { mirrored: false, tileGrid: 2, seats, movement: MOVEMENT, maxGapAuto: true, exam: { title: 'Math 101 Midterm', room: '204', proctor: 'Prof. Cruz' } },
    segments: [{ startedAt: '2026-11-20T01:00:00.000Z', offsetSeconds: 0, endSeconds: 3000 }, { startedAt: '2026-11-20T01:53:00.000Z', offsetSeconds: 3180, endSeconds: 5400 }],
    events, alerts,
    coverage: { 'seat-1': { ...full, observedFrames: 970 }, 'seat-2': full, 'seat-3': full, 'seat-4': full, 'seat-5': full,
      'seat-6': { ...full, observedFrames: 880, gaps: [{ start: 1200, end: 1860 }] } },
    minutes: [], framesProcessed: 6000, stillsSaved: 4, lastTime: 5400, interruptedAt: null, ...overrides,
  };
}
const build = (record = sample(), now = new Date('2026-11-20T02:40:00.000Z')) => facultyReport(record, { hasStill: () => true, now, timeZone: TZ });

test('clock times follow each monitoring segment, including after a resume', () => {
  const record = sample();
  assert.equal(clockAt(record, 0, TZ), '9:00 AM');
  assert.equal(clockAt(record, 2460, TZ), '9:41 AM');
  assert.equal(clockAt(record, 3240, TZ), '9:54 AM');
});

test('the header uses the exam details, the local date and the clock-time range', () => {
  const report = build();
  assert.deepEqual(report.exam, { title: 'Math 101 Midterm', room: '204', proctor: 'Prof. Cruz' });
  assert.equal(report.date, 'Friday 20 November 2026');
  assert.equal(report.timeRange, '9:00–10:30 AM (1 h 30 min)');
  assert.equal(report.seatsWatched, 6);
});

test('a record from before exam details existed has empty ones', () => {
  const record = sample(); delete record.settings.exam;
  assert.deepEqual(build(record).exam, { title: '', room: '', proctor: '' });
});

test('a session still running ends its time range at now', () => {
  assert.equal(build(sample({ state: 'monitoring', endedAt: null })).timeRange, '9:00 AM – now (still running)');
});

test('the at-a-glance numbers count alerts, seats to look at again, unreviewed alerts and minutes not watched', () => {
  assert.deepEqual(build().glance, { alerts: 5, lookAgain: 1, notReviewed: 1, notWatchedMinutes: 3 });
});

test('seats with alerts not dismissed come first; dismissed-only seats follow', () => {
  const { seats: rows, quietSeats, reviewSeats } = build();
  assert.deepEqual(rows.map(row => [row.seat, row.status, row.alerts]), [['Seat 4', 'look-again', 3], ['Seat 2', 'dismissed', 1], ['Seat 5', 'dismissed', 1]]);
  assert.equal(rows[0].saw, '3 alerts · turned right 6 times · longest 4.2 s');
  assert.equal(rows[0].when, '9:41–9:58 AM');
  assert.equal(rows[0].marks, '2 Checked · 1 not reviewed');
  assert.equal(rows[1].saw, '1 alert · looked left for 2.6 s');
  assert.equal(rows[1].when, '10:05 AM');
  assert.equal(rows[1].marks, 'Dismissed');
  assert.equal(quietSeats, 'No alerts: Seats 1 and 3. Seat 6 was hidden 12% of the exam (see page 3).');
  assert.deepEqual(reviewSeats, ['Seat 4', 'Seat 2', 'Seat 5']);
});

test('the seat map marks seats to look at again and seats hidden 10% of the time or more', () => {
  const map = build().map;
  assert.equal(map.length, 6);
  assert.deepEqual(map.find(seat => seat.label === '4'), { label: '4', roi: seats[3].roi, status: 'look-again', hidden: false });
  assert.equal(map.find(seat => seat.label === '2').status, 'dismissed');
  assert.equal(map.find(seat => seat.label === '6').hidden, true, '12% hidden');
  assert.equal(map.find(seat => seat.label === '1').hidden, false, '3% hidden');
  const edge = sample(); edge.coverage['seat-3'] = { ...edge.coverage['seat-3'], observedFrames: 900 };
  assert.equal(build(edge).map.find(seat => seat.label === '3').hidden, true, 'exactly 10% counts');
});

test('a mirrored camera draws seats as the camera sees them', () => {
  const record = sample(); record.settings = { ...record.settings, mirrored: true };
  const roi = build(record).map.find(seat => seat.label === '1').roi;
  assert.deepEqual(roi.map(v => Math.round(v * 100) / 100), [.7, 0, 1, .45]);
});

test('the timeline places alerts, hidden stretches and the camera-off gap on the session', () => {
  const { timeline } = build();
  assert.deepEqual(timeline.ticks.map(t => t.label), ['9:00', '9:30', '10:00', '10:30']);
  assert.equal(timeline.rows.length, 6);
  const seat4 = timeline.rows.find(row => row.label === 'Seat 4');
  assert.deepEqual(seat4.marks.map(m => m.kind), ['checked', 'checked', 'not-reviewed']);
  assert.ok(Math.abs(seat4.marks[0].at - 2460 / 5400) < 1e-9);
  assert.deepEqual(timeline.rows.find(row => row.label === 'Seat 6').hidden.map(h => [h.from, h.to].map(v => Math.round(v * 1000))), [[222, 344]]);
  assert.deepEqual(timeline.off.map(o => [o.from, o.to].map(v => Math.round(v * 1000))), [[556, 589]]);
});

test('alert details are grouped by seat with plain titles, clock times, marks and photo notes', () => {
  const groups = build().alertGroups;
  assert.deepEqual(groups.map(g => [g.seat, g.status, g.alerts.length]), [['Seat 4', 'look-again', 3], ['Seat 2', 'dismissed', 1], ['Seat 5', 'dismissed', 1]]);
  const [first, second, third] = groups[0].alerts;
  assert.deepEqual([first.time, first.title, first.mark, first.markedAt, first.image], ['9:41 AM', 'Looked right for 4.2 seconds', 'Checked', '9:42 AM', 'stills/alert-1.jpg']);
  assert.equal(first.rule, 'Held one direction longer than the 2-second rule.');
  assert.deepEqual([second.time, second.title], ['9:47–9:49 AM', 'Turned right 4 times']);
  assert.equal(second.rule, 'Repeated turns: 3 or more within 10 seconds.');
  assert.equal(third.mark, null);
  const fifth = groups[2].alerts[0];
  assert.deepEqual([fifth.image, fifth.imageNote], [null, 'Photo unavailable']);
});

test('a still missing from disk is reported as unavailable', () => {
  const report = facultyReport(sample(), { hasStill: still => still !== 'stills/alert-1.jpg', now: new Date(), timeZone: TZ });
  assert.deepEqual([report.alertGroups[0].alerts[0].image, report.alertGroups[0].alerts[0].imageNote], [null, 'Photo unavailable']);
});

test('blind spots list the camera-off gap and hidden seats in plain words', () => {
  assert.deepEqual(build().blindSpots, [
    { what: 'Whole room not watched', when: '9:50–9:53 AM (3 min)', reason: 'Camera stopped; monitoring resumed' },
    { what: 'Seat 6 hidden', when: '9:20–9:31 AM · 12% of the exam', reason: 'Face not visible' },
    { what: 'Seat 1 hidden', when: 'Short moments · 3% of the exam', reason: 'Face not visible' },
  ]);
});

test('a session without alerts has no seats to look at again and no alert details', () => {
  const report = build(sample({ alerts: [], events: [] }));
  assert.deepEqual(report.seats, []);
  assert.deepEqual(report.alertGroups, []);
  assert.deepEqual(report.glance, { alerts: 0, lookAgain: 0, notReviewed: 0, notWatchedMinutes: 3 });
  assert.equal(report.quietSeats, 'No alerts: Seats 1, 2, 3, 4 and 5. Seat 6 was hidden 12% of the exam (see page 3).');
});

test('the rules and session lines use the session settings', () => {
  const report = build();
  assert.equal(report.rules, 'An alert means a head in that seat turned left or right for 2 seconds or more, or 3 times within 10 seconds. Looking down (writing) never raises an alert. Ocular does not recognise anyone and does not decide whether anyone cheated: you do.');
  assert.equal(report.sessionLine, 'Session details for your records: session 3f2a9c1e · camera started 9:00 AM · alert rules: 2 s, 3 turns in 10 s.');
});

test('no banned words appear anywhere in the report data', () => {
  const text = JSON.stringify(build()).toLowerCase();
  for (const word of ['suspicious', 'incident', 'violation', 'catch']) assert.equal(text.includes(word), false, word);
});

test('more than 500 alerts are capped in the details, seats to look at again first, with the rest counted', () => {
  const record = sample();
  record.events = []; record.alerts = [];
  for (let i = 0; i < 520; i++) {
    const seat = i < 20 ? 'seat-4' : 'seat-2';
    record.events.push(sustained(seat, 'left', 10 + i * 10, 2.5));
    record.alerts.push(alert(`alert-${i + 1}`, seat, 'left', 10 + i * 10, 10 + i * 10, [i], seat === 'seat-4' ? null : 'Dismissed', '', null));
  }
  const report = build(record);
  const shown = report.alertGroups.reduce((sum, group) => sum + group.alerts.length, 0);
  assert.equal(shown, 500);
  assert.equal(report.omittedAlerts, 20);
  assert.equal(report.alertGroups[0].seat, 'Seat 4');
  assert.equal(report.alertGroups[0].alerts.length, 20, 'every look-again alert is kept');
  assert.equal(report.glance.alerts, 520, 'the at-a-glance count stays the true total');
  assert.ok(report.timeline.rows.every(row => row.marks.length <= 500));
});

test('a resume that received no frames does not push the camera-off gap past the end of the session', () => {
  const record = sample({ lastTime: 3000, alerts: [], events: [],
    segments: [{ startedAt: '2026-11-20T01:00:00.000Z', offsetSeconds: 0, endSeconds: 3000 }, { startedAt: '2026-11-20T01:53:00.000Z', offsetSeconds: 3180, endSeconds: 3000 }] });
  const report = build(record);
  assert.ok(report.timeline.off.every(span => span.from >= 0 && span.to <= 1));
  assert.deepEqual(report.timeline.off, []);
  assert.equal(report.glance.notWatchedMinutes, 0);
  assert.equal(report.blindSpots.filter(spot => spot.what === 'Whole room not watched').length, 0);
});

test('two failed resumes in a row are one camera-off gap, counted once', () => {
  const record = sample({ lastTime: 3500, alerts: [], events: [],
    segments: [{ startedAt: '2026-11-20T01:00:00.000Z', offsetSeconds: 0, endSeconds: 3000 },
      { startedAt: '2026-11-20T01:53:00.000Z', offsetSeconds: 3180, endSeconds: 3000 },
      { startedAt: '2026-11-20T01:56:40.000Z', offsetSeconds: 3400, endSeconds: 3500 }] });
  const report = build(record);
  assert.equal(report.timeline.off.length, 1);
  assert.equal(report.glance.notWatchedMinutes, 7);
  assert.equal(report.blindSpots.filter(spot => spot.what === 'Whole room not watched').length, 1);
});

test('a mark made on a later day shows its date', () => {
  const record = sample();
  record.alerts[0] = { ...record.alerts[0], markedAt: '2026-11-23T01:00:00.000Z' };
  assert.equal(build(record).alertGroups[0].alerts[0].markedAt, 'Mon 23 Nov, 9:00 AM');
  assert.equal(build().alertGroups[0].alerts[0].markedAt, '9:42 AM', 'same day: time only');
});

test('a quiet seat hidden most of the time is not reported as simply having no alerts', () => {
  const record = sample({ alerts: [], events: [] });
  record.coverage['seat-3'] = { ...record.coverage['seat-3'], observedFrames: 0 };
  assert.equal(build(record).quietSeats, 'No alerts: Seats 1, 2, 4 and 5. Seat 3 was hidden 100% and Seat 6 12% of the exam (see page 3).');
});

test('an alert read from the shape of the head says so in the report', () => {
  const record = sample();
  record.events[3] = { ...record.events[3], estimation_source: 'head_pose_fallback' };
  const seat2 = build(record).alertGroups.find(group => group.seat === 'Seat 2').alerts[0];
  assert.match(seat2.rule, /shape of the head/);
  const seat5 = build(record).alertGroups.find(group => group.seat === 'Seat 5').alerts[0];
  assert.doesNotMatch(seat5.rule, /shape of the head/);
});

const recordingOf = (overrides = {}) => sample({
  segments: [], lastTime: 2100, state: 'ended',
  source: { kind: 'recording', filename: 'midterm.mp4', durationSeconds: 2100, video: 'video.mp4' }, ...overrides,
});

test('a finished recording reports video times and its length', () => {
  const report = build(recordingOf());
  assert.equal(report.date, 'Recording: midterm.mp4');
  assert.equal(report.timeRange, '35 min');
  assert.equal(report.offLabel, 'not reviewed');
  assert.equal(report.glance.notWatchedMinutes, 0);
  assert.deepEqual(report.timeline.off, []);
  assert.equal(report.alertGroups[0].alerts[0].time, '41:00');
  assert.equal(report.alertGroups[0].alerts[1].time, '47:00–49:00');
  assert.match(report.sessionLine, /^Session details for your records: session 3f2a9c1e · recording midterm\.mp4 · alert rules: /);
  assert.deepEqual(report.timeline.ticks.slice(0, 2).map(t => t.label), ['0:00', '10:00']);
  assert.equal(build(recordingOf({ lastTime: 35, source: { kind: 'recording', filename: 'a.mp4', durationSeconds: 35, video: 'v' } })).timeRange, '35 s');
});

test('video times past an hour carry hours', () => {
  assert.equal(videoTime(65), '1:05');
  assert.equal(videoTime(3723), '1:02:03');
});

test('an interrupted recording shows the unreviewed rest as not reviewed', () => {
  const report = build(recordingOf({ state: 'interrupted', lastTime: 750, source: { kind: 'recording', filename: 'midterm.mp4', durationSeconds: 2700, video: 'v' } }));
  assert.equal(report.timeRange, 'reviewed 12:30 of 45:00');
  assert.equal(report.glance.notWatchedMinutes, 33);
  assert.equal(report.timeline.off.length, 1);
  assert.ok(Math.abs(report.timeline.off[0].from - 750 / 2700) < 1e-9 && report.timeline.off[0].to === 1);
  assert.match(report.blindSpots[0].what, /not reviewed/);
  assert.equal(report.blindSpots[0].when, '12:30–45:00 (33 min)');
});

test('an estimated length shorter than the reviewed part never makes a negative span', () => {
  const report = build(recordingOf({ state: 'interrupted', lastTime: 900, source: { kind: 'recording', filename: 'm.mp4', durationSeconds: 800, video: 'v' } }));
  assert.deepEqual(report.timeline.off, []);
  assert.equal(report.glance.notWatchedMinutes, 0);
});

test('a recording whose video stopped decoding early shows the unreached rest as not reviewed', () => {
  const report = build(recordingOf({ state: 'ended', lastTime: 1500, source: { kind: 'recording', filename: 'midterm.mp4', durationSeconds: 2100, video: 'v' } }));
  assert.equal(report.timeRange, 'reviewed 25:00 of 35:00');
  assert.equal(report.glance.notWatchedMinutes, 10);
  assert.equal(report.timeline.off.length, 1);
  assert.ok(Math.abs(report.timeline.off[0].from - 1500 / 2100) < 1e-9 && report.timeline.off[0].to === 1);
  assert.deepEqual(report.blindSpots[0], { what: 'Rest of the video not reviewed', when: '25:00–35:00 (10 min)', reason: 'The video could not be read further' });
  // A finished review a few seconds short of an estimated length is complete.
  const near = build(recordingOf({ state: 'ended', lastTime: 2097, source: { kind: 'recording', filename: 'midterm.mp4', durationSeconds: 2100, video: 'v' } }));
  assert.deepEqual(near.timeline.off, []);
  assert.doesNotMatch(near.timeRange, /reviewed/);
});
