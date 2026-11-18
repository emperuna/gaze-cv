import { createReadStream } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { createInterface } from 'node:readline';
import { validRunId } from './analysis-contract.ts';
import type { AnalysisResult, Detection } from './analysis-contract.ts';
import { AnalysisError, analysisRoot } from './server-analysis.ts';
import { MAX_REPORT_ITEMS, baseReport, countDirections, imageIncidentReport, observationItems } from './incident-report.ts';
import { timeLabel } from './review-contract.ts';

async function contained(base: string, path: string) {
  const root = await realpath(base), file = await realpath(join(root, path)), location = relative(root, file);
  if (location.startsWith('..') || isAbsolute(location)) throw new AnalysisError('Analysis report not found.', 404);
  return file;
}

export async function analysisIncidentReport(id: string, signal: AbortSignal) {
  if (!validRunId(id)) throw new AnalysisError('Analysis report not found.', 404);
  const root = await contained(analysisRoot, id);
  let meta: AnalysisResult & { processedAt: string };
  try { meta = JSON.parse(await readFile(await contained(root, 'analysis-result.json'), 'utf8')); }
  catch { throw new AnalysisError('This run has no report record. Analyze the source again to create one.', 404); }
  if (meta.runId !== id || !['image', 'video'].includes(meta.kind) || !['head', 'baseline'].includes(meta.method)) throw new AnalysisError('The analysis report record is invalid.', 404);
  if (meta.kind === 'image') {
    const details = JSON.parse(await readFile(await contained(root, 'output/001-input/observations.json'), 'utf8'));
    return imageIncidentReport(id, meta.filename, details, meta.method, meta.processedAt);
  }
  const summary = JSON.parse(await readFile(await contained(root, 'output/001-input/summary.json'), 'utf8'));
  const report = baseReport('video', id, meta.filename);
  report.metadata = [['Method', meta.method], ['Processed at (UTC)', meta.processedAt], ['Source SHA256', summary.input_sha256 || 'Unavailable'],
    ['Timebase', summary.source.timebase], ['Processed source duration', timeLabel(summary.source.processed_duration_seconds)],
    ['Processed frames', String(meta.processedFrames)]];
  const stream = createReadStream(await contained(root, 'output/001-input/observations.jsonl'), { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let candidates = 0, missing = 0, frames = 0, lastTime = -1;
  try {
    for await (const line of lines) {
      if (signal.aborted) throw new AnalysisError('Report download cancelled.', 499);
      if (!line.trim()) continue;
      if (line.length > 4 * 1024 * 1024) throw new Error('A frame record exceeds the report input limit.');
      const row = JSON.parse(line) as { frame_index: number; source_timestamp_seconds: number; result: { detections: Detection[] } };
      if (!Number.isFinite(row.source_timestamp_seconds) || row.source_timestamp_seconds <= lastTime || !Array.isArray(row.result.detections)) throw new Error('Frame observations are invalid or out of order.');
      lastTime = row.source_timestamp_seconds; frames++;
      const counts = countDirections(row.result.detections);
      if (Object.entries(counts).filter(([direction]) => direction !== 'unknown').reduce((sum, [, count]) => sum + count, 0) === 0) missing++;
      const item = observationItems([{ frame: row.frame_index, time: lastTime, counts }]).items[0];
      if (item) { candidates++; if (report.items.length < MAX_REPORT_ITEMS) report.items.push(item); }
    }
  } finally { lines.close(); stream.destroy(); }
  if (frames !== meta.processedFrames) throw new AnalysisError('The saved frame observations are incomplete. Reprocess the source before exporting a report.', 422);
  report.omittedItems = Math.max(0, candidates - report.items.length);
  report.summary = `${candidates} processed frames have non-forward observations. Each row is a source-frame observation; no person or incident is tracked across frames.`;
  report.coverage = [`${missing} of ${frames} processed frames have no usable head direction. Undetected/unknown heads do not establish absence of incidents.`];
  report.limitations.push('Directions-only video mode has no seat histories, sustained/repeated movement events, or identity tracking. Use Seats & movement review for configured seat events.', 'Directions are camera-relative. Timestamped observations require contextual review of the original source.');
  return report;
}
