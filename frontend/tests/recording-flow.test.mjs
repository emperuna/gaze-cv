import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_MARGIN_SECONDS, acceptedFile, playWindow, pollChained, progressText, recordingStep, recordingUrl, recordingVideoUrl, reviewProgress, startReviewAgain, stoppedText } from '../src/lib/recording-flow.ts';

test('the play window is the first event plus 3 s each side', () => {
  assert.equal(PLAY_MARGIN_SECONDS, 3);
  assert.deepEqual(playWindow({ start_time: 60, end_time: 64.5 }, 600), { start: 57, end: 67.5 });
});

test('the play window is clamped at 0 and at the end of the video', () => {
  assert.deepEqual(playWindow({ start_time: 1, end_time: 2 }, 600), { start: 0, end: 5 });
  assert.deepEqual(playWindow({ start_time: 597, end_time: 599 }, 600), { start: 594, end: 600 });
  assert.deepEqual(playWindow({ start_time: 0.5, end_time: 1 }, 2), { start: 0, end: 2 });
});

test('an unknown length leaves the end of the play window open', () => {
  assert.deepEqual(playWindow({ start_time: 10, end_time: 12 }, 0), { start: 7, end: 15 });
  assert.deepEqual(playWindow({ start_time: 10, end_time: 12 }, Number.NaN), { start: 7, end: 15 });
});

test('progress text reads time in the video of its length', () => {
  assert.equal(progressText(750, 2700), 'Reviewing… 12:30 of 45:00');
  assert.equal(progressText(0, 95), 'Reviewing… 0:00 of 1:35');
  assert.equal(progressText(3725, 7200), 'Reviewing… 1:02:05 of 2:00:00');
});

test('an estimated length never shows progress past the end', () => {
  assert.equal(progressText(130, 120), 'Reviewing… 2:10 of 2:10');
  assert.equal(reviewProgress(130, 120), 1);
  assert.equal(reviewProgress(30, 120), 0.25);
  assert.equal(reviewProgress(0, 0), 0);
  assert.equal(reviewProgress(Number.NaN, 120), 0);
});

test('the screen step follows the upload and the record state', () => {
  const none = { uploading: false, hasDraft: false, recordState: null };
  assert.equal(recordingStep(none), 'choose');
  assert.equal(recordingStep({ ...none, uploading: true }), 'finding');
  assert.equal(recordingStep({ ...none, hasDraft: true }), 'seats');
  assert.equal(recordingStep({ ...none, recordState: 'monitoring' }), 'reviewing');
  assert.equal(recordingStep({ ...none, recordState: 'ended' }), 'done');
  assert.equal(recordingStep({ ...none, recordState: 'interrupted' }), 'stopped');
  // A record outranks a leftover draft or upload flag.
  assert.equal(recordingStep({ uploading: true, hasDraft: true, recordState: 'ended' }), 'done');
});

test('only MP4, MOV, WebM and M4V videos up to 2 GB are accepted', () => {
  assert.equal(acceptedFile({ name: 'exam.mp4', size: 1000 }), null);
  assert.equal(acceptedFile({ name: 'EXAM.MOV', size: 1000 }), null);
  assert.equal(acceptedFile({ name: 'a.b.webm', size: 1000 }), null);
  assert.equal(acceptedFile({ name: 'clip.m4v', size: 2 * 1024 ** 3 }), null);
  assert.equal(acceptedFile({ name: 'clip.avi', size: 1000 }), 'Choose an MP4, MOV, WebM or M4V video.');
  assert.equal(acceptedFile({ name: 'mp4', size: 1000 }), 'Choose an MP4, MOV, WebM or M4V video.');
  assert.equal(acceptedFile({ name: 'clip.mp4', size: 2 * 1024 ** 3 + 1 }), 'This video is over 2 GB. Choose a smaller one.');
  assert.equal(acceptedFile({ name: 'clip.mp4', size: 0 }), 'This file is empty. Choose another video.');
});

test('a recording opens on the recording screen and plays from its own video route', () => {
  assert.equal(recordingUrl('abc-1'), '/analyze?recording=abc-1');
  assert.equal(recordingVideoUrl('abc-1'), '/api/camera/sessions/abc-1/video');
});

test('Review again posts to the again route and explains a refusal in one sentence', async () => {
  const calls = [];
  const answer = (status, body) => async (url, init) => { calls.push([url, init.method]); return new Response(JSON.stringify(body), { status }); };
  assert.equal(await startReviewAgain('rec-1', answer(200, { recordId: 'rec-1' })), null);
  assert.deepEqual(calls[0], ['/api/camera/sessions/rec-1/again', 'POST']);
  assert.equal(await startReviewAgain('rec-1', answer(409, { error: 'Another analysis is running.' })), 'Another analysis is running.');
  assert.equal(await startReviewAgain('rec-1', answer(500, { error: 'Traceback…' })), 'The review could not start. Press Review again.');
  assert.equal(await startReviewAgain('rec-1', async () => { throw new TypeError('fetch failed'); }), 'Ocular could not be reached. Press Review again.');
});

test('a stopped review says how far it got, never past the end', () => {
  assert.equal(stoppedText(750, 2700), 'Stopped at 12:30 of 45:00');
  assert.equal(stoppedText(3725, 7200), 'Stopped at 1:02:05 of 2:00:00');
  assert.equal(stoppedText(130, 120), 'Stopped at 2:10 of 2:10');
  assert.equal(stoppedText(0, 95), 'Stopped at 0:00 of 1:35');
});

test('polling waits for each read to settle before scheduling the next, so requests never stack', async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let calls = 0, finish;
  const stop = pollChained(() => { calls++; return new Promise(resolve => { finish = resolve; }); }, 5);
  await wait(60);
  assert.equal(calls, 1, 'a slow read holds back the next one');
  finish();
  for (let i = 0; calls < 2 && i < 200; i++) await wait(5);
  assert.equal(calls, 2);
  finish(); stop();
  await wait(40);
  assert.equal(calls, 2, 'nothing runs after stop');
  let failing = 0;
  const stopFailing = pollChained(async () => { failing++; throw new Error('offline'); }, 5);
  for (let i = 0; failing < 3 && i < 200; i++) await wait(5);
  stopFailing();
  assert.ok(failing >= 3, 'a failed read does not end polling');
});
