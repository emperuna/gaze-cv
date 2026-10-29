import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReviewSettings, mirrorSeats, frameAtTime, DEFAULT_MOVEMENT } from '../src/lib/review-contract.ts';
import { parseRange } from '../src/lib/media-range.ts';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { publishReview } from '../src/lib/server-review.ts';

const config=() => ({method:'head',mirrored:false,tileGrid:1,seats:[{id:'A',roi:[.1,.2,.4,.8]}],movement:{...DEFAULT_MOVEMENT}});

test('review settings reject overlapping, duplicate, empty or out of bounds seats', () => {
  assert.equal(validateReviewSettings(config()).seats[0].id,'A');
  for (const seats of [[],[{id:'A',roi:[0,0,0,1]}],[{id:'A',roi:[0,0,2,1]}],
    [{id:'A',roi:[0,0,.5,1]},{id:'A',roi:[.5,0,1,1]}],
    [{id:'A',roi:[0,0,.6,1]},{id:'B',roi:[.5,0,1,1]}]]) assert.throws(() => validateReviewSettings({...config(),seats}));
});

test('review validates finite movement bounds and strict boolean/integer options', () => {
  for (const change of [{method:'pose'},{mirrored:'false'},{tileGrid:true},{tileGrid:5}]) assert.throws(() => validateReviewSettings({...config(),...change}));
  for (const change of [{min_duration:0},{repetition_count:2.5},{max_gap:NaN},{repeat_min_duration:301}]) assert.throws(() => validateReviewSettings({...config(),movement:{...DEFAULT_MOVEMENT,...change}}));
});

test('seat mirroring happens once between drawn source pixels and canonical coordinates', () => {
  const seats=[{id:'A',roi:[.1,.2,.3,.8]}];
  const canonical=mirrorSeats(seats);
  assert.ok(Math.abs(canonical[0].roi[0]-.7)<1e-10);
  assert.ok(Math.abs(canonical[0].roi[2]-.9)<1e-10);
  const roundtrip=mirrorSeats(canonical);
  for(let i=0;i<4;i++) assert.ok(Math.abs(roundtrip[0].roi[i]-seats[0].roi[i])<1e-10);
});

test('frame lookup follows half-open source intervals and never retains stale overlays', () => {
  const frames=[{time:0},{time:.25},{time:.5}];
  assert.equal(frameAtTime(frames,4,.249,.75),frames[0]);
  assert.equal(frameAtTime(frames,4,.25,.75),frames[1]);
  assert.equal(frameAtTime(frames,4,.749,.75),frames[2]);
  for(const time of [-1,.75,NaN,2]) assert.equal(frameAtTime(frames,4,time,.75),null);
});

test('single byte ranges support seeking, suffixes and bounded end positions', () => {
  assert.deepEqual(parseRange('bytes=10-19',100),{start:10,end:19});
  assert.deepEqual(parseRange('bytes=80-',100),{start:80,end:99});
  assert.deepEqual(parseRange('bytes=-10',100),{start:90,end:99});
  assert.deepEqual(parseRange('bytes=90-999',100),{start:90,end:99});
  assert.equal(parseRange(null,100),null);
  for(const value of ['bytes=100-','bytes=20-10','bytes=-0','bytes=0-1,4-5','oops','bytes=999999999999999999999-']) assert.throws(() => parseRange(value,100));
});

test('cancellation during final rename removes the completed manifest', async context => {
  const root=await fs.mkdtemp(join(tmpdir(),'gaze-review-'));
  context.after(()=>fs.rm(root,{recursive:true,force:true}));
  const controller=new AbortController();
  const original=fs.rename;
  context.mock.method(fs,'rename',async(...args)=>{await original(...args);controller.abort();});
  await assert.rejects(publishReview(root,{id:'test'},controller.signal),/cancelled/);
  await assert.rejects(fs.access(join(root,'session.json')));
});
