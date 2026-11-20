import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { CameraSession } from '../src/lib/camera-session.ts';
import { workerArgs } from '../src/lib/server-camera.ts';
import { MAX_ALERT_NOTE, validateAlertMark, validateCameraSettings, validateCameraFrame, readCameraJson } from '../src/lib/camera-contract.ts';
import { createRecord, saveRecord } from '../src/lib/server-camera-record.ts';
import { recordFrame } from '../src/lib/server-live-session.ts';
import { acquireProcessingSlot } from '../src/lib/processing-slot.ts';

function worker() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => { queueMicrotask(() => child.emit('close', 0)); return true; };
  return child;
}

test('camera settings and frames reject invalid methods, types, sizes and timestamps', () => {
  assert.deepEqual(validateCameraSettings({mirrored: false, tileGrid: 1}), {mirrored: false, tileGrid: 1, headTurns: true});
  assert.deepEqual(validateCameraSettings({method:'baseline', mirrored: true, tileGrid: 2, headTurns: false}), {mirrored: true, tileGrid: 2, headTurns: false});
  for (const settings of [{method:'pose'}, {method:'head'}, {mirrored:'false'}, {tileGrid:5}, {headTurns:'yes'}, null]) assert.throws(() => validateCameraSettings(settings));
  assert.equal(validateCameraFrame({id:1,timestamp_seconds:.5,image:'/9j/'}).id, 1);
  for (const value of [-1, NaN, Infinity, '1']) assert.throws(() => validateCameraFrame({id:1,timestamp_seconds:value,image:'/9j/'}));
  assert.throws(() => validateCameraFrame({id:1,timestamp_seconds:0,image:'x'.repeat(1_400_000)}));
});

test('alert notes are accepted up to 2000 characters', () => {
  assert.equal(MAX_ALERT_NOTE, 2000);
  assert.equal(validateAlertMark({mark:'Checked',note:'x'.repeat(2000),revision:0}).note.length, 2000);
  assert.throws(() => validateAlertMark({mark:'Checked',note:'x'.repeat(2001),revision:0}), /2000 characters/);
  // A full note of escaped characters still fits the mark route's body limit.
  assert.ok(JSON.stringify({mark:'Dismissed',note:'\u0001'.repeat(2000),revision:2**40}).length < 16384);
});

test('bounded JSON reader rejects an oversized streamed body', async () => {
  const body = new ReadableStream({start(c) {c.enqueue(new Uint8Array(21)); c.close();}});
  await assert.rejects(readCameraJson(new Request('http://localhost', {method:'POST',body,duplex:'half'}),20), /large/);
});

test('inference reservation excludes uploads and releases idempotently', () => {
  const release = acquireProcessingSlot();
  assert.throws(() => acquireProcessingSlot(), /running/);
  release(); release();
  acquireProcessingSlot()();
});

test('persistent session correlates frames, rejects overlapping work, and releases only on exit', async () => {
  const child = worker();
  let releases = 0;
  const session = new CameraSession(child, () => releases++, {idleMs:1000});
  child.stdout.write('{"ready":true}\n');
  await session.ready;
  const pending = session.frame({id:1,timestamp_seconds:.1,image:'/9j/'});
  await assert.rejects(session.frame({id:2,timestamp_seconds:.2,image:'/9j/'}), /processing/);
  child.stdout.write('{"id":1,"timestamp_seconds":0.1,"counts":{},"result":{"width":80,"height":60,"detections":[],"processing_ms":1}}\n');
  assert.equal((await pending).id, 1);
  const second = session.frame({id:2,timestamp_seconds:.2,image:'/9j/'});
  child.stdout.write('{"id":2,"timestamp_seconds":0.2,"counts":{"left":1},"result":{"width":80,"height":60,"detections":[],"processing_ms":1}}\n');
  assert.deepEqual((await second).counts, {left:1});
  const closing = session.close();
  assert.equal(releases,0);
  await closing;
  assert.equal(releases,1);
  await session.close();
  assert.equal(releases,1);
});

test('slow in-flight frames use the frame timeout rather than idle expiry', async () => {
  const child = worker();
  const session = new CameraSession(child, () => {}, {idleMs:10,frameMs:200});
  child.stdout.write('{"ready":true}\n'); await session.ready;
  const pending = session.frame({id:1,timestamp_seconds:0,image:'/9j/'});
  await new Promise(resolve => setTimeout(resolve,25));
  child.stdout.write('{"id":1,"timestamp_seconds":0,"counts":{},"result":{"width":1,"height":1,"detections":[],"processing_ms":1}}\n');
  assert.equal((await pending).id,1);
  await session.close();
});

test('timeout kills the worker, rejects pending inference, and frees reservation', async () => {
  const child = worker(); let released = false;
  const session = new CameraSession(child, () => {released=true;}, {frameMs:10});
  child.stdout.write('{"ready":true}\n'); await session.ready;
  await assert.rejects(session.frame({id:1,timestamp_seconds:0,image:'/9j/'}), /timed out/);
  await session.close(); assert.ok(released);
});

test('idle expiry and startup crash release the worker', async () => {
  const child = worker(); let released = false;
  const session = new CameraSession(child, () => {released=true;}, {idleMs:10});
  child.stdout.write('{"ready":true}\n'); await session.ready;
  await new Promise(resolve => setTimeout(resolve,30));
  assert.ok(released);
  await assert.rejects(session.frame({id:1,timestamp_seconds:0,image:'/9j/'}), /stopped/);
  const crashed = worker(); let freed = false;
  const bad = new CameraSession(crashed, () => {freed=true;});
  crashed.emit('close',1);
  await assert.rejects(bad.ready, /exited/);
  assert.ok(freed);
});

test('shutdown forces a hung worker to exit before freeing inference', async () => {
  const child=worker(); let released=false; const signals=[];
  child.kill=signal => {signals.push(signal); if(signal==='SIGKILL') queueMicrotask(() => child.emit('close',null)); return true;};
  const session=new CameraSession(child,() => {released=true;});
  child.stdout.write('{"ready":true}\n'); await session.ready;
  const watchdog=setTimeout(() => {},3000);
  try {
    const closing=session.close();
    assert.equal(released,false);
    assert.deepEqual(signals,['SIGTERM']);
    await closing;
    assert.deepEqual(signals,['SIGTERM','SIGKILL']);
    assert.equal(released,true);
  } finally {clearTimeout(watchdog);}
});

test('mismatched worker frames close the session rather than returning stale detections', async () => {
  const child=worker(); let released=false;
  const session=new CameraSession(child,() => {released=true;});
  child.stdout.write('{"ready":true}\n'); await session.ready;
  const pending=session.frame({id:1,timestamp_seconds:.5,image:'/9j/'});
  child.stdout.write('{"id":2,"timestamp_seconds":0.5,"result":{"detections":[]}}\n');
  await assert.rejects(pending,/Invalid/);
  await session.close(); assert.equal(released,true);
});

const FRAME_RESULT = id => `{"id":${id},"timestamp_seconds":0.${id},"counts":{},"result":{"width":1,"height":1,"detections":[],"processing_ms":1}}\n`;

test('frames forward open alerts verbatim', async () => {
  const child = worker(); const session = new CameraSession(child, () => {});
  let written = ''; child.stdin.on('data', chunk => {written += chunk;});
  child.stdout.write('{"ready":true}\n'); await session.ready;
  const frame = {id:1,timestamp_seconds:.1,image:'/9j/',setup:true,open_alerts:[['seat-1','right']]};
  const pending = session.frame(frame);
  assert.deepEqual(JSON.parse(written), frame);
  child.stdout.write(FRAME_RESULT(1)); await pending; await session.close();
});

test('commands resolve by key, share the single slot, and reject without closing on a command error', async () => {
  const child = worker(); const session = new CameraSession(child, () => {});
  child.stdout.write('{"ready":true}\n'); await session.ready;
  const configure = session.command({type:'configure',settings:{}});
  await assert.rejects(session.command({type:'suggest_seats'}), /already processing/);
  await assert.rejects(session.frame({id:1,timestamp_seconds:.1,image:'/9j/'}), /already processing/);
  child.stdout.write('{"configured":true,"seats":[{"id":"seat-1","roi":[0,0,1,1]}]}\n');
  assert.equal((await configure).configured, true);
  const suggest = session.command({type:'suggest_seats'});
  child.stdout.write('{"id":null,"error":"No heads found"}\n');
  await assert.rejects(suggest, /No heads found/);
  const frame = session.frame({id:1,timestamp_seconds:.1,image:'/9j/'});
  child.stdout.write(FRAME_RESULT(1)); assert.equal((await frame).id, 1);
  const wrong = session.command({type:'suggest_seats'});
  child.stdout.write('{"configured":true}\n');
  await assert.rejects(wrong, /Invalid/);
  await session.close();
});

test('onExit reports failed on a crash and stopped on close', async () => {
  const crashed = worker(); const a = new CameraSession(crashed, () => {}); const exits = [];
  a.onExit((reason, message) => exits.push([reason, message]));
  crashed.stdout.write('{"ready":true}\n'); await a.ready;
  crashed.emit('close', 1);
  await a.close();
  assert.equal(exits.length, 1); assert.equal(exits[0][0], 'failed'); assert.match(exits[0][1], /exited/);
  const child = worker(); const b = new CameraSession(child, () => {}); const stops = [];
  b.onExit((reason, message) => stops.push([reason, message]));
  child.stdout.write('{"ready":true}\n'); await b.ready;
  await b.close();
  assert.deepEqual(stops, [['stopped','Camera session stopped.']]);
  const timed = worker(); const c = new CameraSession(timed, () => {}, {frameMs:10}); const failed = [];
  c.onExit(reason => failed.push(reason));
  timed.stdout.write('{"ready":true}\n'); await c.ready;
  await assert.rejects(c.frame({id:1,timestamp_seconds:0,image:'/9j/'}), /timed out/);
  await c.close(); assert.deepEqual(failed, ['failed']);
});

// ---- Live monitored sessions (Task 5) ----
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_MOVEMENT } from '../src/lib/review-contract.ts';
import { newRecord } from '../src/lib/live-alerts.ts';
import { saveNewRecord, loadRecord } from '../src/lib/server-camera-record.ts';
import { startCamera, getCamera, stopCamera, isActive, markCameraAlert, getCameraRecord, endCameraRecord, interruptCamera, deleteCameraRecord } from '../src/lib/server-camera.ts';

const JPEG64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
const PNG64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
const SEATS = [{ id: 'seat-A', roi: [0, 0, .5, 1] }];
const MONITOR = { seats: SEATS, movement: DEFAULT_MOVEMENT, maxGapAuto: true };
const INPUT = { mirrored: false, tileGrid: 1 };
const signal = () => new AbortController().signal;
const turn = (direction, start, end, extra = {}) => ({ seat_id: 'seat-A', event_type: 'sustained_movement', direction, start_time: start,
  end_time: end, duration: end - start, observed_at: end, review_required: true, review_label: 'For review', ...extra });

/**
 * A fake worker that answers commands and lets each test decide frame replies (`null` = do not reply).
 * `beforeConfigured` runs (and is awaited) before the configure reply is sent.
 */
function liveWorker(onFrame = () => ({}), beforeConfigured = async () => {}) {
  const child = worker(); const sent = []; let buffer = '';
  child.stdin.on('data', chunk => {
    buffer += chunk; let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const message = JSON.parse(buffer.slice(0, i)); buffer = buffer.slice(i + 1); sent.push(message);
      if (message.type === 'configure') void beforeConfigured().then(() => child.stdout.write(JSON.stringify({ configured: true, seats: message.settings.seats }) + '\n'));
      else if (message.type === 'suggest_seats') child.stdout.write(JSON.stringify({ suggested: true, seats: SEATS, sampled_frames: 4, note: 'Check the boxes.' }) + '\n');
      else {
        const reply = onFrame(message);
        if (reply) child.stdout.write(JSON.stringify({ id: message.id, timestamp_seconds: message.timestamp_seconds, counts: {},
          result: { width: 1, height: 1, detections: [], processing_ms: 1 }, seats: { 'seat-A': { direction: 'left', reason: null } }, events: [], ...reply }) + '\n');
      }
    }
  });
  child.stdout.write('{"ready":true}\n');
  return { child, sent };
}

async function withLive(fn) {
  const base = resolve(process.cwd(), '..', '.work', 'tmp');
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(join(base, 'camera-live-'));
  const started = [];
  const start = async (onFrame, extra = {}, resume, beforeConfigured) => {
    const fake = liveWorker(onFrame, beforeConfigured);
    const out = await startCamera(INPUT, signal(), resume, { root, launch: async () => fake.child, ...extra });
    started.push(out.sessionId);
    return { ...fake, ...out, live: getCamera(out.sessionId) };
  };
  try { await fn({ root, start }); }
  finally {
    for (const id of started) { try { await stopCamera(id); } catch {} }
    await fs.rm(root, { recursive: true, force: true });
  }
}
const frame = (id, t) => ({ id, timestamp_seconds: t, image: '/9j/' });

test('frame validation forwards a boolean setup flag and drops browser open_alerts', () => {
  assert.deepEqual(validateCameraFrame({ id: 1, timestamp_seconds: 0, image: '/9j/', setup: true, open_alerts: [['x', 'left']] }),
    { id: 1, timestamp_seconds: 0, image: '/9j/', setup: true });
  assert.equal('setup' in validateCameraFrame(frame(1, 0)), false);
  assert.throws(() => validateCameraFrame({ ...frame(1, 0), setup: 'yes' }), /setup/);
});

test('monitor saves the exam details, or empty ones when none are given', async () => withLive(async ({ start }) => {
  const { live } = await start();
  await live.frame(frame(1, 1));
  const { record } = await live.monitor({ ...MONITOR, exam: { title: ' Math 101 Midterm ', room: '204', proctor: 'Prof. Cruz' } });
  assert.deepEqual(record.settings.exam, { title: 'Math 101 Midterm', room: '204', proctor: 'Prof. Cruz' });
  await live.stop();
  const second = await start();
  await second.live.frame(frame(1, 1));
  const plain = await second.live.monitor(MONITOR);
  assert.deepEqual(plain.record.settings.exam, { title: '', room: '', proctor: '' });
}));

test('monitor refuses exam details that are too long', async () => withLive(async ({ start }) => {
  const { live } = await start();
  await live.frame(frame(1, 1));
  await assert.rejects(live.monitor({ ...MONITOR, exam: { title: 'x'.repeat(121) } }), error => error.status === 400);
}));

test('monitor creates a record and frames open one alert with a stored still', async () => withLive(async ({ root, start }) => {
  const { live, sent, sessionId } = await start(m => m.id === 2
    ? { events: [turn('left', 1.5, 3, { still: JPEG64 }), turn('left', 1.5, 3.2)] } : {});
  await live.frame(frame(1, 1));
  const setup = await live.suggestSeats();
  assert.deepEqual(setup, { seats: SEATS, sampledFrames: 4, note: 'Check the boxes.' });
  const { recordId, record } = await live.monitor(MONITOR);
  assert.equal(record.state, 'monitoring');
  assert.ok(isActive(recordId));
  assert.deepEqual(sent.find(m => m.type === 'configure').settings, { mirrored: false, tileGrid: 1, seats: SEATS, movement: DEFAULT_MOVEMENT });
  await assert.rejects(live.monitor(MONITOR), error => error.status === 409);
  await assert.rejects(live.suggestSeats(), error => error.status === 409);
  const out = await live.frame(frame(2, 3));
  assert.deepEqual(sent.at(-1).open_alerts, []);
  assert.equal(out.sessionTime, 2);
  assert.equal(out.alerts.length, 1, 'an alert opened and joined by one frame is listed once');
  assert.equal(out.alerts[0].still, 'stills/alert-1.jpg');
  assert.equal(out.alerts[0].openedAt, .5);
  assert.ok(out.events.every(e => !('still' in e)), 'no still bytes reach the browser');
  assert.equal(out.saveError, null);
  assert.equal(out.state, 'monitoring');
  assert.deepEqual(await fs.readFile(join(root, recordId, 'stills', 'alert-1.jpg')), Buffer.from(JPEG64, 'base64'));
  await live.frame(frame(3, 3.5));
  assert.deepEqual(sent.at(-1).open_alerts, [['seat-A', 'left']]);
  const disk = JSON.parse(await fs.readFile(join(root, recordId, 'session.json'), 'utf8'));
  assert.equal(disk.alerts[0].still, 'stills/alert-1.jpg');
  assert.equal(disk.stillsSaved, 1);
  await stopCamera(sessionId);
  const ended = await loadRecord(recordId, { root });
  assert.equal(ended.state, 'ended'); assert.ok(ended.endedAt);
  assert.equal(isActive(recordId), false);
}));

test('resume continues session time', async () => withLive(async ({ root, start }) => {
  const stoppedAt = Date.parse('2026-11-18T10:00:00Z');
  const old = newRecord('11111111-1111-4111-8111-111111111111', { ...INPUT, seats: SEATS, movement: DEFAULT_MOVEMENT, maxGapAuto: true }, new Date(stoppedAt - 30_000));
  Object.assign(old, { state: 'interrupted', lastTime: 30, interruptedAt: new Date(stoppedAt).toISOString() });
  old.segments[0].endSeconds = 30;
  old.events.push({ ...turn('left', 20, 30), segment: 0 });
  old.alerts.push({ id: 'alert-1', seatId: 'seat-A', direction: 'left', openedAt: 20, lastAt: 30, eventIndexes: [0], still: null, stillError: null, mark: 'Checked', note: '', markedAt: null });
  await saveNewRecord(old, { root });
  await fs.writeFile(join(root, old.id, 'session.lock'), '');
  const past = new Date(Date.now() - 60_000); await fs.utimes(join(root, old.id, 'session.lock'), past, past);
  const { live, sent, recordId, record } = await start(m => ({ events: [turn('left', .2, m.timestamp_seconds, { still: JPEG64 })] }),
    { now: () => new Date(stoppedAt + 10_000) }, old.id);
  assert.equal(recordId, old.id);
  assert.equal(record.state, 'monitoring');
  assert.deepEqual(record.segments.map(s => [s.offsetSeconds, s.endSeconds]), [[0, 30], [40, null]]);
  assert.deepEqual(sent[0].settings.seats, SEATS);
  assert.ok(isActive(old.id));
  const out = await live.frame(frame(1, 1));
  assert.equal(out.sessionTime, 41);
  const alert = out.alerts[0];
  assert.equal(alert.id, 'alert-2');
  assert.ok(alert.openedAt > 30 && alert.openedAt > Math.max(...old.events.map(e => e.end_time)));
  assert.equal(live.record.events.at(-1).segment, 1);
  await assert.rejects(fs.access(join(root, old.id, 'session.lock')), 'a stale lock is removed on resume');
}));

test('only an interrupted record can be resumed', async () => withLive(async ({ root, start }) => {
  const done = newRecord('22222222-2222-4222-8222-222222222222', { ...INPUT, seats: SEATS, movement: DEFAULT_MOVEMENT, maxGapAuto: true }, new Date());
  done.state = 'ended'; await saveNewRecord(done, { root });
  await assert.rejects(start(undefined, {}, done.id), error => error.status === 409);
  acquireProcessingSlot()();
}));

test('still write failure keeps the alert', async () => withLive(async ({ start }) => {
  const { live } = await start(m => m.id === 1 ? { events: [turn('right', 0, 2, { still: PNG64 })] } : {});
  await live.monitor(MONITOR);
  const out = await live.frame(frame(1, 2));
  assert.equal(out.alerts.length, 1);
  assert.equal(out.alerts[0].still, null);
  assert.equal(out.alerts[0].stillError, 'Still could not be saved');
  assert.equal(live.record.stillsSaved, 0);
  const next = await live.frame(frame(2, 2.5));
  assert.equal(next.sessionTime, 2.5);
  assert.equal(live.record.framesProcessed, 2);
}));

test('late result after Stop is ignored', async () => withLive(async ({ root, start }) => {
  const { live, child, sessionId } = await start(m => m.id === 1 ? null : {});
  const { recordId } = await live.monitor(MONITOR);
  const pending = live.frame(frame(1, 2));
  await new Promise(r => setImmediate(r));
  child.stdout.write(JSON.stringify({ id: 1, timestamp_seconds: 2, counts: {}, result: { width: 1, height: 1, detections: [], processing_ms: 1 },
    seats: {}, events: [turn('left', 0, 2, { still: JPEG64 })] }) + '\n');
  const stopping = stopCamera(sessionId);
  await assert.rejects(pending);
  await stopping;
  const record = await loadRecord(recordId, { root });
  assert.equal(record.state, 'ended');
  assert.equal(record.alerts.length, 0);
  assert.equal(record.framesProcessed, 0);
  await assert.rejects(fs.access(join(root, recordId, 'stills')));
}));

test('worker crash marks the record interrupted', async () => withLive(async ({ root, start }) => {
  const { live, child, sessionId } = await start();
  const { recordId } = await live.monitor(MONITOR);
  await live.frame(frame(1, 4));
  child.emit('close', 1);
  await live.exited;
  assert.equal(isActive(recordId), false);
  assert.throws(() => getCamera(sessionId), error => error.status === 404);
  const record = JSON.parse(await fs.readFile(join(root, recordId, 'session.json'), 'utf8'));
  assert.equal(record.state, 'interrupted');
  assert.ok(record.interruptedAt);
  assert.equal(record.segments[0].endSeconds, 4);
}));

test('pausing a monitored session leaves it interrupted and resumable, not ended', async () => withLive(async ({ root, start }) => {
  const { live, sessionId } = await start();
  const { recordId } = await live.monitor(MONITOR);
  await live.frame(frame(1, 4));
  assert.deepEqual(await interruptCamera(sessionId), { recordId, state: 'interrupted' });
  assert.equal(isActive(recordId), false);
  assert.throws(() => getCamera(sessionId), error => error.status === 404);
  const saved = JSON.parse(await fs.readFile(join(root, recordId, 'session.json'), 'utf8'));
  assert.equal(saved.state, 'interrupted');
  assert.ok(saved.interruptedAt);
  assert.equal(saved.endedAt, null);
  const resumed = await start(undefined, {}, recordId);
  assert.equal(resumed.record.state, 'monitoring');
  assert.equal(resumed.record.segments.length, 2);
}));

test('pausing a preview-only session just closes it', async () => withLive(async ({ start }) => {
  const { sessionId } = await start();
  assert.deepEqual(await interruptCamera(sessionId), { recordId: null, state: null });
  await assert.rejects(interruptCamera(sessionId), error => error.status === 404);
}));

test('3-hour limit ends the record', async () => withLive(async ({ root, start }) => {
  const { live, sessionId } = await start();
  await live.frame(frame(1, 1));
  const { recordId } = await live.monitor(MONITOR);
  const early = await live.frame(frame(2, 9_901));
  assert.equal(early.sessionTime, 9_900); assert.equal(early.notice, null);
  const out = await live.frame(frame(3, 10_801));
  assert.equal(out.sessionTime, 10_800);
  assert.equal(out.state, 'ended');
  assert.equal(out.notice, 'Monitoring stopped at the 3-hour limit.');
  await live.exited;
  assert.throws(() => getCamera(sessionId));
  assert.equal((await loadRecord(recordId, { root })).state, 'ended');
}));

test('a failed live save keeps monitoring and retries on the next frame', async () => withLive(async ({ root, start }) => {
  const { live } = await start(m => m.id === 1 ? { events: [turn('left', 0, 2, { still: JPEG64 })] } : {}, { lockTimeoutMs: 30 });
  const { recordId } = await live.monitor(MONITOR);
  const lock = join(root, recordId, 'session.lock');
  await fs.writeFile(lock, '');
  const failed = await live.frame(frame(1, 2));
  assert.match(failed.saveError, /busy saving/);
  assert.equal(failed.state, 'monitoring');
  assert.equal(JSON.parse(await fs.readFile(join(root, recordId, 'session.json'), 'utf8')).alerts.length, 0);
  await fs.unlink(lock);
  const next = await live.frame(frame(2, 2.2));
  assert.equal(next.saveError, null);
  assert.equal(JSON.parse(await fs.readFile(join(root, recordId, 'session.json'), 'utf8')).alerts.length, 1);
}));

test('marking through the route returns 409 on stale revision', async () => withLive(async ({ root, start }) => {
  const { live, sessionId } = await start(m => m.id === 1 ? { events: [turn('left', 0, 2)] } : {});
  const { recordId } = await live.monitor(MONITOR);
  await live.frame(frame(1, 2));
  const marked = await markCameraAlert(recordId, 'alert-1', { mark: 'Checked', note: 'Looked at seat', revision: 0 }, { root });
  assert.equal(marked.revision, 1); assert.equal(marked.alert.mark, 'Checked');
  assert.equal(live.record.alerts[0].mark, 'Checked', 'the live in-memory record is marked');
  await assert.rejects(markCameraAlert(recordId, 'alert-1', { mark: 'Dismissed', note: '', revision: 0 }, { root }), error => error.status === 409);
  await assert.rejects(markCameraAlert(recordId, 'alert-1', { mark: 'Maybe', note: '', revision: 1 }, { root }), error => error.status === 400);
  await assert.rejects(markCameraAlert(recordId, 'alert-9', { mark: 'Checked', note: '', revision: 1 }, { root }), error => error.status === 404);
  assert.equal((await getCameraRecord(recordId, { root })).revision, 1);
  await stopCamera(sessionId);
  await assert.rejects(markCameraAlert(recordId, 'alert-1', { mark: 'Dismissed', note: '', revision: 0 }, { root }), error => error.status === 409);
  const saved = await markCameraAlert(recordId, 'alert-1', { mark: 'Dismissed', note: '', revision: 1 }, { root });
  assert.equal(saved.revision, 2); assert.equal(saved.alert.mark, 'Dismissed');
}));

test('ending a saved interrupted record marks it ended', async () => withLive(async ({ root, start }) => {
  const { live, child } = await start();
  const { recordId } = await live.monitor(MONITOR);
  child.emit('close', 1); await live.exited;
  const ended = await endCameraRecord(recordId, { root });
  assert.equal(ended.state, 'ended'); assert.ok(ended.endedAt);
  assert.equal((await loadRecord(recordId, { root })).state, 'ended');
}));

test('Stop while the record lock is held briefly still saves the record as ended', async () => withLive(async ({ root, start }) => {
  const { live, sessionId } = await start(undefined, { lockTimeoutMs: 30 });
  const { recordId } = await live.monitor(MONITOR);
  const lock = join(root, recordId, 'session.lock');
  await fs.writeFile(lock, '');
  setTimeout(() => { void fs.unlink(lock); }, 80);
  assert.deepEqual(await stopCamera(sessionId), { recordId, saveError: null });
  assert.equal(JSON.parse(await fs.readFile(join(root, recordId, 'session.json'), 'utf8')).state, 'ended');
}));

test('a Stop whose save keeps failing reports 503, and Stop or End again retries it', async () => withLive(async ({ root, start }) => {
  const { live, sessionId } = await start(undefined, { lockTimeoutMs: 20 });
  const { recordId } = await live.monitor(MONITOR);
  const lock = join(root, recordId, 'session.lock');
  await fs.writeFile(lock, '');
  await assert.rejects(stopCamera(sessionId), error => error.status === 503 && /could not be saved/.test(error.message));
  assert.equal(isActive(recordId), false);
  assert.equal(JSON.parse(await fs.readFile(join(root, recordId, 'session.json'), 'utf8')).state, 'monitoring');
  assert.equal((await getCameraRecord(recordId, { root })).state, 'ended', 'the in-memory ended record is what is reported');
  await assert.rejects(endCameraRecord(recordId, { root }), error => error.status === 503);
  await fs.unlink(lock);
  assert.deepEqual(await stopCamera(sessionId), { recordId, saveError: null });
  assert.equal(JSON.parse(await fs.readFile(join(root, recordId, 'session.json'), 'utf8')).state, 'ended');
  assert.throws(() => getCamera(sessionId), error => error.status === 404, 'once saved, the stopped session is released');
}));

test('Stop waits for an in-flight frame before the final save', async () => withLive(async ({ root, start }) => {
  const { live, sessionId } = await start(m => ({ events: [turn('left', 0, m.timestamp_seconds, { still: JPEG64 })] }));
  const { recordId } = await live.monitor(MONITOR);
  const pending = live.frame(frame(1, 2));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  await stopCamera(sessionId);
  await pending.catch(() => {});
  const disk = JSON.parse(await fs.readFile(join(root, recordId, 'session.json'), 'utf8'));
  assert.equal(disk.state, 'ended');
  assert.ok(disk.alerts.every(a => a.still === null || a.still === 'stills/alert-1.jpg'), 'no base64 still reaches the file');
}));

test('worker crash during a brief lock still saves the record as interrupted', async () => withLive(async ({ root, start }) => {
  const { live, child } = await start(undefined, { lockTimeoutMs: 30 });
  const { recordId } = await live.monitor(MONITOR);
  const lock = join(root, recordId, 'session.lock');
  await fs.writeFile(lock, '');
  setTimeout(() => { void fs.unlink(lock); }, 80);
  child.emit('close', 1);
  await live.exited;
  assert.equal(JSON.parse(await fs.readFile(join(root, recordId, 'session.json'), 'utf8')).state, 'interrupted');
}));

test('a frame cancelled right before Stop leaves the record ended, not interrupted', async () => withLive(async ({ root, start }) => {
  const { live, sessionId } = await start(m => m.id === 1 ? null : {}, { cancelGraceMs: 5_000 });
  const { recordId } = await live.monitor(MONITOR);
  const pending = live.frame(frame(1, 2));
  await new Promise(resolve => setImmediate(resolve));
  live.cancelFrame();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(await stopCamera(sessionId), { recordId, saveError: null });
  await pending.catch(() => {});
  await live.exited;
  assert.equal(JSON.parse(await fs.readFile(join(root, recordId, 'session.json'), 'utf8')).state, 'ended');
}));

test('a cancelled frame without Stop interrupts after the grace, and End then saves it as ended', async () => withLive(async ({ root, start }) => {
  const { live, sessionId } = await start(m => m.id === 1 ? null : {}, { cancelGraceMs: 10 });
  const { recordId } = await live.monitor(MONITOR);
  const pending = live.frame(frame(1, 2));
  await new Promise(resolve => setImmediate(resolve));
  live.cancelFrame();
  await pending.catch(() => {});
  // End arrives while the exiting worker may still be saving the interruption; it must win.
  const ended = await endCameraRecord(recordId, { root });
  assert.equal(ended.state, 'ended');
  assert.throws(() => getCamera(sessionId), error => error.status === 404);
  await live.exited;
  assert.equal(JSON.parse(await fs.readFile(join(root, recordId, 'session.json'), 'utf8')).state, 'ended');
}));

test('a cancelled preview frame closes the worker at once', async () => withLive(async ({ start }) => {
  const { live } = await start(m => m.id === 1 ? null : {}, { cancelGraceMs: 60_000 });
  const pending = live.frame(frame(1, 2));
  await new Promise(resolve => setImmediate(resolve));
  live.cancelFrame();
  await assert.rejects(pending);
  await live.exited;
  assert.equal(live.workerExited, true);
}));

async function interruptedRecord(root, id) {
  const old = newRecord(id, { ...INPUT, seats: SEATS, movement: DEFAULT_MOVEMENT, maxGapAuto: true }, new Date(Date.now() - 60_000));
  Object.assign(old, { state: 'interrupted', lastTime: 30, interruptedAt: new Date(Date.now() - 30_000).toISOString() });
  old.segments[0].endSeconds = 30;
  old.events.push({ ...turn('left', 20, 30), segment: 0 });
  old.alerts.push({ id: 'alert-1', seatId: 'seat-A', direction: 'left', openedAt: 20, lastAt: 30, eventIndexes: [0], still: null, stillError: null, mark: null, note: '', markedAt: null });
  await saveNewRecord(old, { root });
  return old;
}

test('a mark saved while a resume configures the worker is kept', async () => withLive(async ({ root, start }) => {
  const old = await interruptedRecord(root, '33333333-3333-4333-8333-333333333333');
  const { live, sessionId, record } = await start(undefined, {}, old.id,
    () => markCameraAlert(old.id, 'alert-1', { mark: 'Checked', note: 'Seen', revision: 0 }, { root }));
  assert.equal(record.alerts[0].mark, 'Checked');
  assert.equal(live.record.revision, 1);
  await stopCamera(sessionId);
  const disk = JSON.parse(await fs.readFile(join(root, old.id, 'session.json'), 'utf8'));
  assert.equal(disk.state, 'ended');
  assert.equal(disk.alerts[0].mark, 'Checked');
  assert.equal(disk.alerts[0].note, 'Seen');
}));

test('a session deleted while a resume configures the worker is not resumed or recreated', async () => withLive(async ({ root, start }) => {
  const old = await interruptedRecord(root, '44444444-4444-4444-8444-444444444444');
  await assert.rejects(start(undefined, {}, old.id, () => deleteCameraRecord(old.id, { root })),
    error => error.status === 409 && error.message === 'This session was ended or deleted in another tab.');
  await assert.rejects(fs.access(join(root, old.id)), 'the deleted folder stays deleted');
  assert.equal(isActive(old.id), false);
  const next = await start();
  assert.ok(next.sessionId, 'the worker was closed and the processing slot released');
}));

test('a session ended while a resume configures the worker is not resumed', async () => withLive(async ({ root, start }) => {
  const old = await interruptedRecord(root, '55555555-5555-4555-8555-555555555555');
  await assert.rejects(start(undefined, {}, old.id, () => endCameraRecord(old.id, { root })),
    error => error.status === 409 && error.message === 'This session was ended or deleted in another tab.');
  assert.equal(JSON.parse(await fs.readFile(join(root, old.id, 'session.json'), 'utf8')).state, 'ended');
  assert.equal(isActive(old.id), false);
}));

test('the worker reads strong head turns only when asked and the head model is installed', () => {
  const on = { mirrored: false, tileGrid: 2, headTurns: true };
  assert.deepEqual(workerArgs(on, true).slice(1), ['--method', 'baseline', '--tile-grid', '2', '--head-turns']);
  assert.ok(!workerArgs(on, false).includes('--head-turns'));
  assert.ok(!workerArgs({ ...on, headTurns: false }, true).includes('--head-turns'));
  assert.ok(workerArgs({ ...on, mirrored: true }, true).includes('--mirrored'));
});

test('recordFrame writes the opening event\'s still and never stores base64 in the record', async () => {
  const base = resolve(process.cwd(), '..', '.work', 'tmp');
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(join(base, 'record-frame-'));
  try {
    const record = await createRecord({ mirrored: false, tileGrid: 2, seats: [{ id: 'seat-A' }], movement: DEFAULT_MOVEMENT, maxGapAuto: true }, { root });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const event = { seat_id: 'seat-A', event_type: 'sustained_movement', direction: 'left', start_time: 1, end_time: 4, duration: 3,
      observed_at: 4, review_required: true, review_label: 'For review', still: jpeg.toString('base64') };
    const { opened } = await recordFrame(record, 4, {}, [event], { recordOptions: { root }, groupWithinSeconds: 30 });
    assert.equal(opened.length, 1);
    assert.equal(record.alerts[0].still, 'stills/alert-1.jpg');
    assert.deepEqual(await fs.readFile(join(root, record.id, 'stills', 'alert-1.jpg')), jpeg);
    await saveRecord(record, { root });
    const saved = await fs.readFile(join(root, record.id, 'session.json'), 'utf8');
    assert.ok(!saved.includes(jpeg.toString('base64')));
    assert.equal((await loadRecord(record.id, { root })).alerts[0].still, 'stills/alert-1.jpg');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
