import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraFrameSize, runCameraFrames } from '../src/lib/camera-client.ts';

test('camera capture preserves aspect ratio within the frame limit', () => {
  assert.deepEqual(cameraFrameSize(1920,1080),{width:1280,height:720});
  assert.deepEqual(cameraFrameSize(1080,1920),{width:405,height:720});
  assert.deepEqual(cameraFrameSize(640,480),{width:640,height:480});
  assert.throws(() => cameraFrameSize(0,0));
});

test('frame loop waits for inference and pairs display with its captured frame', async () => {
  const controller=new AbortController();
  let captures=0; let inFlight=0; const shown=[];
  await runCameraFrames({
    signal:controller.signal,
    capture:() => ++captures,
    process:async value => {
      assert.equal(++inFlight,1);
      await new Promise(resolve => setTimeout(resolve,2));
      inFlight--; return value*10;
    },
    display:(frame,result) => {shown.push([frame,result]); if(shown.length===2) controller.abort();},
    intervalMs:0,
  });
  assert.deepEqual(shown,[[1,10],[2,20]]);
  assert.equal(captures,2);
});

test('stopping during inference discards the late result', async () => {
  const controller=new AbortController(); let shown=false;
  await runCameraFrames({signal:controller.signal,capture:() => 1,
    process:async () => {controller.abort(); return 2;},
    display:() => {shown=true;},intervalMs:0});
  assert.equal(shown,false);
});
