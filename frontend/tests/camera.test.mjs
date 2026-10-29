import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { CameraSession } from '../src/lib/camera-session.ts';
import { validateCameraSettings, validateCameraFrame, readCameraJson } from '../src/lib/camera-contract.ts';
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
  assert.deepEqual(validateCameraSettings({method: 'head', mirrored: false, tileGrid: 1}), {method: 'head', mirrored: false, tileGrid: 1});
  for (const settings of [{method:'pose'}, {method:'head',mirrored:'false'}, {method:'head',tileGrid:5}, null]) assert.throws(() => validateCameraSettings(settings));
  assert.equal(validateCameraFrame({id:1,timestamp_seconds:.5,image:'/9j/'}).id, 1);
  for (const value of [-1, NaN, Infinity, '1']) assert.throws(() => validateCameraFrame({id:1,timestamp_seconds:value,image:'/9j/'}));
  assert.throws(() => validateCameraFrame({id:1,timestamp_seconds:0,image:'x'.repeat(1_400_000)}));
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
