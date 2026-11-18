import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_MOVEMENT } from '../src/lib/review-contract.ts';
import { applyFrame } from '../src/lib/live-alerts.ts';
import { createRecord, endSavedRecord, loadRecord, saveRecord, writeStill, stillFile, listRecords, updateAlertMark, deleteRecord } from '../src/lib/server-camera-record.ts';

const settings = { mirrored: false, tileGrid: 2, seats: [{ id: 'seat-A' }], movement: DEFAULT_MOVEMENT, maxGapAuto: true };
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function withRoot(fn) {
  const base = resolve(process.cwd(), '..', '.work', 'tmp');
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(join(base, 'camera-record-'));
  try { await fn(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}
const alertEvent = (start) => ({ seat_id: 'seat-A', event_type: 'sustained_movement', direction: 'left', start_time: start,
  end_time: start + 3, duration: 3, observed_at: start + 3, review_required: true, review_label: 'For review' });
async function withAlert(root) {
  const record = await createRecord(settings, { root });
  applyFrame(record, 5, {}, [alertEvent(1)]);
  await saveRecord(record, { root });
  return record;
}

test('create then load round trips', async () => withRoot(async (root) => {
  const record = await createRecord(settings, { root });
  assert.deepEqual(await loadRecord(record.id, { root, isActive: () => true }), record);
}));

test('saved monitoring record loads as interrupted unless active', async () => withRoot(async (root) => {
  const record = await createRecord(settings, { root });
  assert.equal((await loadRecord(record.id, { root })).state, 'interrupted');
  assert.equal((await loadRecord(record.id, { root, isActive: id => id === record.id })).state, 'monitoring');
  assert.equal(JSON.parse(await fs.readFile(join(root, record.id, 'session.json'), 'utf8')).state, 'monitoring');
}));

test('writeStill accepts JPEG and refuses PNG or oversize', async () => withRoot(async (root) => {
  const record = await createRecord(settings, { root });
  assert.equal(await writeStill(record.id, 'alert-1', JPEG, { root }), 'stills/alert-1.jpg');
  assert.deepEqual(await fs.readFile(await stillFile(record.id, 'alert-1', { root })), JPEG);
  await assert.rejects(writeStill(record.id, 'alert-2', PNG, { root }), { status: 400 });
  const big = Buffer.concat([JPEG, Buffer.alloc(200_001 - JPEG.length)]);
  assert.equal(big.length, 200_001);
  await assert.rejects(writeStill(record.id, 'alert-2', big, { root }), { status: 413 });
  await assert.rejects(writeStill(record.id, '../x', JPEG, { root }), { status: 400 });
}));

test('listRecords sorts newest first and counts unmarked', async () => withRoot(async (root) => {
  const a = await createRecord(settings, { root });
  const b = await createRecord(settings, { root });
  a.createdAt = '2026-01-01T00:00:00.000Z'; b.createdAt = '2026-02-01T00:00:00.000Z';
  applyFrame(b, 5, {}, [alertEvent(1)]);
  await saveRecord(a, { root }); await saveRecord(b, { root });
  const list = await listRecords({ root });
  assert.deepEqual(list.map(r => r.id), [b.id, a.id]);
  assert.equal(list[0].alerts, 1); assert.equal(list[0].unmarked, 1); assert.equal(list[0].seats, 1); assert.equal(list[0].seconds, 5);
}));

test('updateAlertMark refuses a stale revision with 409 and bumps revision', async () => withRoot(async (root) => {
  const record = await withAlert(root);
  const alert = await updateAlertMark(record.id, 'alert-1', 'Checked', 'ok', 0, { root });
  assert.equal(alert.mark, 'Checked');
  assert.equal((await loadRecord(record.id, { root })).revision, 1);
  await assert.rejects(updateAlertMark(record.id, 'alert-1', 'Dismissed', 'other', 0, { root }), { status: 409 });
  assert.equal((await loadRecord(record.id, { root })).alerts[0].note, 'ok');
  await assert.rejects(updateAlertMark(record.id, 'alert-9', 'Checked', '', 1, { root }), { status: 404 });
}));

test('deleteRecord removes the folder and refuses active records', async () => withRoot(async (root) => {
  const record = await createRecord(settings, { root });
  await assert.rejects(deleteRecord(record.id, { root, isActive: () => true }), { status: 409 });
  await deleteRecord(record.id, { root });
  await assert.rejects(fs.stat(join(root, record.id)));
  await assert.rejects(loadRecord(record.id, { root }), { status: 404 });
}));

test('unsafe ids are refused', async () => withRoot(async (root) => {
  await assert.rejects(loadRecord('..', { root }), { status: 400 });
  await assert.rejects(deleteRecord('../x', { root }), { status: 400 });
  await assert.rejects(stillFile('../x', 'alert-1', { root }), { status: 400 });
}));

test('marking a monitoring record keeps its on-disk state', async () => withRoot(async (root) => {
  const record = await withAlert(root);
  await updateAlertMark(record.id, 'alert-1', 'Checked', '', 0, { root });
  assert.equal(JSON.parse(await fs.readFile(join(root, record.id, 'session.json'), 'utf8')).state, 'monitoring');
}));

test('updateAlertMark refuses a live session', async () => withRoot(async (root) => {
  const record = await withAlert(root);
  await assert.rejects(updateAlertMark(record.id, 'alert-1', 'Checked', '', 0, { root, isActive: () => true }), { status: 409 });
}));

test('saveRecord waits for a held lock then succeeds', async () => withRoot(async (root) => {
  const record = await createRecord(settings, { root });
  const lock = join(root, record.id, 'session.lock');
  await fs.writeFile(lock, '');
  setTimeout(() => fs.unlink(lock), 150);
  record.framesProcessed = 7;
  await saveRecord(record, { root });
  assert.equal((await loadRecord(record.id, { root })).framesProcessed, 7);
}));

test('saveRecord gives 409 when the lock is never released', async () => withRoot(async (root) => {
  const record = await createRecord(settings, { root });
  await fs.writeFile(join(root, record.id, 'session.lock'), '');
  await assert.rejects(saveRecord(record, { root, lockTimeoutMs: 100 }), { status: 409 });
}));

test('listRecords skips malformed records and loadRecord reports 422', async () => withRoot(async (root) => {
  const good = await createRecord(settings, { root });
  const bad = await createRecord(settings, { root });
  const file = join(root, bad.id, 'session.json');
  const broken = JSON.parse(await fs.readFile(file, 'utf8'));
  delete broken.settings;
  await fs.writeFile(file, JSON.stringify(broken));
  assert.deepEqual((await listRecords({ root })).map(r => r.id), [good.id]);
  await assert.rejects(loadRecord(bad.id, { root }), { status: 422 });
}));

test('saving or writing a still never recreates a deleted session folder', async () => withRoot(async (root) => {
  const record = await createRecord(settings, { root });
  await deleteRecord(record.id, { root });
  await assert.rejects(saveRecord(record, { root }), { status: 404 });
  await assert.rejects(writeStill(record.id, 'alert-1', JPEG, { root }), { status: 404 });
  await assert.rejects(fs.access(join(root, record.id)));
}));

test('a stale lock left by a crashed save is cleared before a mark or End; a fresh one gives a plain 409', async () => withRoot(async (root) => {
  const record = await withAlert(root);
  const lock = join(root, record.id, 'session.lock');
  await fs.writeFile(lock, '');
  await assert.rejects(updateAlertMark(record.id, 'alert-1', 'Checked', '', 0, { root, lockTimeoutMs: 50 }),
    { status: 409, message: 'This session is busy saving. Try again in a moment.' });
  const past = new Date(Date.now() - 60_000);
  await fs.utimes(lock, past, past);
  assert.equal((await updateAlertMark(record.id, 'alert-1', 'Checked', '', 0, { root, lockTimeoutMs: 50 })).mark, 'Checked');
  await fs.writeFile(lock, ''); await fs.utimes(lock, past, past);
  assert.equal((await endSavedRecord(record.id, { root, lockTimeoutMs: 50 })).state, 'ended');
  await assert.rejects(fs.access(lock));
}));
