import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_MOVEMENT } from '../src/lib/review-contract.ts';
import { createRecord, deleteRecord, listRecords, loadRecord, saveNewRecord } from '../src/lib/server-camera-record.ts';
import { discardDraft, draftVideo, pruneDrafts, saveUpload } from '../src/lib/server-recording-files.ts';

const settings = { mirrored: false, tileGrid: 2, seats: [{ id: 'seat-A' }], movement: DEFAULT_MOVEMENT, maxGapAuto: true };
const GB = 1024 ** 3;
const plenty = async () => 100 * GB;

async function withRoot(fn) {
  const base = resolve(process.cwd(), '..', '.work', 'tmp');
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(join(base, 'recording-files-'));
  try { await fn(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}
const stream = (chunks) => new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(new Uint8Array(x)); c.close(); } });
const cutOff = () => { let sent = false; return new ReadableStream({ pull(c) { if (sent) c.error(new Error('connection lost')); else { sent = true; c.enqueue(new Uint8Array(10)); } } }); };
const refused = (status) => (error) => error.status === status;
const emptyRoot = async (root) => (await fs.readdir(root)).length === 0;

test('upload streams the file to a draft folder with a marker', async () => withRoot(async (root) => {
  const { draftId, path } = await saveUpload(stream([[1, 2, 3], [4, 5]]), 'Exam.MP4', { root, freeBytes: plenty, declaredBytes: 5 });
  assert.equal(path, join(root, draftId, 'recording.mp4'));
  assert.deepEqual([...await fs.readFile(path)], [1, 2, 3, 4, 5]);
  const marker = JSON.parse(await fs.readFile(join(root, draftId, 'draft.json'), 'utf8'));
  assert.equal(marker.filename, 'Exam.MP4');
  assert.equal(await draftVideo(draftId, { root }), path);
}));

test('upload refuses a wrong extension without creating a folder', async () => withRoot(async (root) => {
  await assert.rejects(saveUpload(stream([[1]]), 'notes.txt', { root, freeBytes: plenty }), refused(400));
  assert.ok(await emptyRoot(root));
}));

test('upload over the limit is refused mid-stream and the folder removed', async () => withRoot(async (root) => {
  await assert.rejects(saveUpload(stream([[1, 2, 3], [4, 5, 6]]), 'a.mov', { root, maxBytes: 4, freeBytes: plenty }), refused(413));
  assert.ok(await emptyRoot(root));
}));

test('upload declared over the limit is refused before any write', async () => withRoot(async (root) => {
  await assert.rejects(saveUpload(stream([[1]]), 'a.webm', { root, maxBytes: 4, freeBytes: plenty, declaredBytes: 10 }), refused(413));
  assert.ok(await emptyRoot(root));
}));

test('upload refused when free disk is under declared size plus 1 GB', async () => withRoot(async (root) => {
  await assert.rejects(saveUpload(stream([[1]]), 'a.m4v', { root, freeBytes: async () => GB + 99, declaredBytes: 100 }), refused(507));
  assert.ok(await emptyRoot(root));
  await saveUpload(stream([[1]]), 'a.m4v', { root, freeBytes: async () => GB + 100, declaredBytes: 100 });
}));

test('a cut-off stream leaves nothing behind', async () => withRoot(async (root) => {
  await assert.rejects(saveUpload(cutOff(), 'a.mp4', { root, freeBytes: plenty }), /connection lost/);
  assert.ok(await emptyRoot(root));
}));

test('drafts are not listed, and discard removes them', async () => withRoot(async (root) => {
  const { draftId } = await saveUpload(stream([[1]]), 'a.mp4', { root, freeBytes: plenty });
  assert.deepEqual(await listRecords({ root }), []);
  await discardDraft(draftId, { root });
  assert.ok(await emptyRoot(root));
  await assert.rejects(draftVideo(draftId, { root }), refused(404));
}));

test('draftVideo rejects an invalid id', async () => withRoot(async (root) => {
  await assert.rejects(draftVideo('../x', { root }), refused(400));
}));

test('prune removes day-old drafts only', async () => withRoot(async (root) => {
  const old = await saveUpload(stream([[1]]), 'a.mp4', { root, freeBytes: plenty });
  const fresh = await saveUpload(stream([[1]]), 'b.mp4', { root, freeBytes: plenty });
  const past = new Date(Date.now() - 2 * 86_400_000);
  await fs.utimes(join(root, old.draftId, 'draft.json'), past, past);
  const live = await createRecord(settings, { root });
  await pruneDrafts({ root });
  assert.deepEqual((await fs.readdir(root)).sort(), [fresh.draftId, live.id].sort());
}));

test('prune never removes a folder that already has a session record', async () => withRoot(async (root) => {
  const { draftId } = await saveUpload(stream([[1]]), 'a.mp4', { root, freeBytes: plenty });
  await fs.writeFile(join(root, draftId, 'session.json'), '{}');
  const past = new Date(Date.now() - 2 * 86_400_000);
  await fs.utimes(join(root, draftId, 'draft.json'), past, past);
  await pruneDrafts({ root });
  assert.ok((await fs.readdir(root)).includes(draftId));
}));

test('records without a source list with recording null; with a source they list it', async () => withRoot(async (root) => {
  const live = await createRecord(settings, { root });
  const made = await createRecord(settings, { root });
  made.source = { kind: 'recording', filename: 'Exam.mp4', durationSeconds: 90, video: 'recording.mp4' };
  await saveNewRecord(made, { root });
  const list = await listRecords({ root });
  assert.equal(list.find(r => r.id === live.id).recording, null);
  assert.deepEqual(list.find(r => r.id === made.id).recording, { filename: 'Exam.mp4', durationSeconds: 90 });
  assert.equal((await loadRecord(live.id, { root })).source, undefined);
}));

test('deleting a record removes its video too', async () => withRoot(async (root) => {
  const made = await createRecord(settings, { root });
  await fs.writeFile(join(root, made.id, 'recording.mp4'), 'x');
  await deleteRecord(made.id, { root });
  assert.ok(await emptyRoot(root));
}));

test('prune carries on past a folder it cannot read or remove', async () => withRoot(async (root) => {
  const past = new Date(Date.now() - 2 * 86_400_000);
  const stuck = await saveUpload(stream([[1]]), 'a.mp4', { root, freeBytes: plenty });
  const old = await saveUpload(stream([[1]]), 'b.mp4', { root, freeBytes: plenty });
  for (const { draftId } of [stuck, old]) await fs.utimes(join(root, draftId, 'draft.json'), past, past);
  // A plain file with a session-like name cannot be read as a folder (ENOTDIR).
  const blocker = '00000000-0000-4000-8000-000000000000';
  await fs.writeFile(join(root, blocker), 'x');
  // A folder whose files cannot be deleted (EACCES/EPERM; like a file held open on Windows).
  const lockable = process.platform !== 'win32' && process.getuid?.() !== 0;
  if (lockable) await fs.chmod(join(root, stuck.draftId), 0o500);
  const logged = [];
  const error = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try { await pruneDrafts({ root }); }
  finally { console.error = error; if (lockable) await fs.chmod(join(root, stuck.draftId), 0o700); }
  const left = await fs.readdir(root);
  assert.ok(!left.includes(old.draftId));
  assert.ok(left.includes(blocker));
  if (lockable) assert.ok(left.includes(stuck.draftId));
  assert.ok(logged.length >= 1);
}));
