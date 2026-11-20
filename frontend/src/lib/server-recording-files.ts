import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { validRunId } from './analysis-contract.ts';
import { AnalysisError } from './server-analysis.ts';
import { cameraRecordRoot } from './server-camera-record.ts';

export const MAX_UPLOAD_BYTES = 2 * 1024 ** 3;
const SPARE_DISK_BYTES = 1024 ** 3;
const EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v']);

/** `root` overrides the storage folder (tests); `freeBytes` reports free disk space; `declaredBytes` is the request's Content-Length. */
export interface UploadOptions { root?: string; maxBytes?: number; freeBytes?: () => Promise<number>; declaredBytes?: number }
export interface DraftOptions { root?: string }

const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

function draftFolder(id: string, root: string): string {
  if (!validRunId(id)) throw new AnalysisError('Invalid recording id.', 400);
  return join(root, id);
}

/**
 * Streams an uploaded video to `<root>/<draftId>/recording<ext>` with a `draft.json` marker. Refuses a wrong type (400),
 * more than `maxBytes` (413) or too little free disk for the declared size plus 1 GB (507); any failure removes the folder.
 */
export async function saveUpload(body: ReadableStream<Uint8Array>, filename: string,
  { root = cameraRecordRoot, maxBytes = MAX_UPLOAD_BYTES, declaredBytes, freeBytes }: UploadOptions = {}): Promise<{ draftId: string; path: string }> {
  const ext = extname(filename).toLowerCase();
  if (!EXTENSIONS.has(ext)) throw new AnalysisError('Choose an MP4, MOV, WebM or M4V video.', 400);
  if (declaredBytes !== undefined && declaredBytes > maxBytes) throw new AnalysisError('This video is over 2 GB. Choose a smaller one.', 413);
  await mkdir(root, { recursive: true });
  const free = await (freeBytes ?? (async () => { const s = await statfs(root); return s.bavail * s.bsize; }))();
  if (free < (declaredBytes ?? 0) + SPARE_DISK_BYTES) throw new AnalysisError('Not enough free disk space for this video.', 507);

  const draftId = randomUUID();
  const dir = join(root, draftId);
  const path = join(dir, `recording${ext}`);
  try {
    await mkdir(dir);
    const file = await open(path, 'wx');
    try {
      let total = 0;
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) { await reader.cancel().catch(() => {}); throw new AnalysisError('This video is over 2 GB. Choose a smaller one.', 413); }
        await file.write(value);
      }
      await file.sync();
    } finally { await file.close(); }
    await writeFile(join(dir, 'draft.json'), JSON.stringify({ filename, createdAt: new Date().toISOString() }));
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return { draftId, path };
}

/** The path of a draft's video; 404 if the draft is gone. */
export async function draftVideo(draftId: string, { root = cameraRecordRoot }: DraftOptions = {}): Promise<string> {
  const dir = draftFolder(draftId, root);
  try {
    await stat(join(dir, 'draft.json'));
    const video = (await readdir(dir)).find(name => name.startsWith('recording.') && EXTENSIONS.has(extname(name)));
    if (video) return join(dir, video);
  } catch (error) { if (!missing(error)) throw error; }
  throw new AnalysisError('Recording not found.', 404);
}

async function isDraft(dir: string): Promise<boolean> {
  try { await stat(join(dir, 'draft.json')); } catch (error) { if (missing(error)) return false; throw error; }
  try { await stat(join(dir, 'session.json')); return false; } catch (error) { if (missing(error)) return true; throw error; }
}

/** Removes a draft folder. A folder that already holds a session record is never touched. */
export async function discardDraft(draftId: string, { root = cameraRecordRoot }: DraftOptions = {}): Promise<void> {
  const dir = draftFolder(draftId, root);
  if (await isDraft(dir)) await rm(dir, { recursive: true, force: true });
}

/** Removes drafts whose marker is older than `maxAgeMs`; folders with a session record are left alone. */
export async function pruneDrafts({ root = cameraRecordRoot }: DraftOptions = {}, maxAgeMs = 86_400_000): Promise<void> {
  let names: string[];
  try { names = await readdir(root); } catch (error) { if (missing(error)) return; throw error; }
  for (const name of names) {
    if (!validRunId(name)) continue;
    const dir = join(root, name);
    try {
      if (await isDraft(dir) && Date.now() - (await stat(join(dir, 'draft.json'))).mtimeMs > maxAgeMs) await rm(dir, { recursive: true, force: true });
    } catch (error) { if (!missing(error)) throw error; }
  }
}
