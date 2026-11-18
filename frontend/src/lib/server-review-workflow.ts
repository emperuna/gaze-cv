import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AnalysisError } from './server-analysis.ts';
import { readReviewMeta, reviewAsset } from './server-review.ts';
import { emptyWorkflow, validateWorkflowUpdate } from './review-workflow.ts';
import type { ReviewRecord } from './review-contract.ts';
import type { ReviewWorkflow } from './review-workflow.ts';

export const MAX_WORKFLOW_BYTES = 2 * 1024 * 1024;

export async function workflowSession(id: string) {
  const meta = await readReviewMeta(id);
  const asset = await reviewAsset(id, 'review.json');
  const record = JSON.parse(await readFile(asset.file, 'utf8')) as ReviewRecord;
  return { meta, record, root: dirname(dirname(asset.file)) };
}

export async function readWorkflowFile(root: string, record: ReviewRecord): Promise<ReviewWorkflow> {
  const filename = join(root, 'review-workflow.json');
  try {
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_WORKFLOW_BYTES) throw new Error('Invalid saved review notes.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyWorkflow(record);
    throw error;
  }
  const saved = JSON.parse(await readFile(filename, 'utf8')) as ReviewWorkflow;
  if (saved.schemaVersion !== 1 || typeof saved.updatedAt !== 'string' || !Number.isFinite(Date.parse(saved.updatedAt)) ||
      (saved.signedOffAt !== null && (typeof saved.signedOffAt !== 'string' || !Number.isFinite(Date.parse(saved.signedOffAt))))) throw new Error('The saved review notes are invalid.');
  const normalized = validateWorkflowUpdate({ ...saved, signedOff: saved.signedOffAt !== null }, record);
  return { schemaVersion: 1, revision: normalized.revision, updatedAt: saved.updatedAt, items: normalized.items,
    summary: normalized.summary, proctorNotes: normalized.proctorNotes, reviewer: normalized.reviewer, signedOffAt: saved.signedOffAt };
}

/** Exclusive lock plus a revision check prevents simultaneous reviewers from silently overwriting notes. */
export async function saveWorkflowFile(root: string, record: ReviewRecord, value: unknown): Promise<ReviewWorkflow> {
  const input = validateWorkflowUpdate(value, record);
  const lockPath = join(root, 'review-workflow.lock');
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new AnalysisError('Another save is in progress. Retry; if this persists after a server crash, remove the session review-workflow.lock file.', 409);
    throw error;
  }
  const temporary = join(root, `review-workflow-${randomUUID()}.pending`);
  try {
    const current = await readWorkflowFile(root, record);
    if (input.revision !== current.revision) throw new AnalysisError('Review notes changed in another tab. Reopen this session before saving; your current edits have not been saved.', 409);
    const now = new Date().toISOString();
    const saved: ReviewWorkflow = { schemaVersion: 1, revision: current.revision + 1, updatedAt: now,
      items: input.items, summary: input.summary, proctorNotes: input.proctorNotes, reviewer: input.reviewer,
      signedOffAt: input.signedOff ? now : null };
    const json = JSON.stringify(saved);
    if (Buffer.byteLength(json) > MAX_WORKFLOW_BYTES) throw new AnalysisError('Review notes exceed the 2 MB session limit. Shorten the notes before saving.', 413);
    const file = await open(temporary, 'wx');
    try { await file.writeFile(json, 'utf8'); await file.sync(); } finally { await file.close(); }
    await rename(temporary, join(root, 'review-workflow.json'));
    return saved;
  } finally {
    await unlink(temporary).catch(() => {});
    await lock.close(); await unlink(lockPath);
  }
}
