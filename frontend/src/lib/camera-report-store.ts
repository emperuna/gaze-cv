import { CameraReportLog } from './incident-report.ts';

export const CAMERA_REPORT_TTL = 30 * 60 * 1000;
export class CameraReportCache {
  private readonly logs = new Map<string, CameraReportLog>();
  private readonly expiry = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly maxSessions: number;
  constructor(maxSessions = 8) { this.maxSessions = maxSessions; }
  private remove(id: string) { clearTimeout(this.expiry.get(id)); this.expiry.delete(id); this.logs.delete(id); }
  private schedule(log: CameraReportLog, now: number) {
    if (!log.snapshot.endedAt) return;
    clearTimeout(this.expiry.get(log.snapshot.id));
    const timer = setTimeout(() => this.remove(log.snapshot.id), Math.max(0, CAMERA_REPORT_TTL - (now - Date.parse(log.snapshot.endedAt))));
    timer.unref(); this.expiry.set(log.snapshot.id, timer);
  }
  private purge(now: number) {
    for (const [id, log] of this.logs) if (log.snapshot.endedAt && now - Date.parse(log.snapshot.endedAt) >= CAMERA_REPORT_TTL) this.remove(id);
  }
  add(log: CameraReportLog, now = Date.now()) {
    this.purge(now);
    if (this.logs.has(log.snapshot.id)) this.remove(log.snapshot.id);
    while (this.logs.size >= this.maxSessions) this.remove(this.logs.keys().next().value!);
    this.logs.set(log.snapshot.id, log);
    this.schedule(log, now);
  }
  finish(id: string) { const log = this.logs.get(id); if (log) { log.end(); this.schedule(log, Date.now()); } }
  get(id: string, now = Date.now()) { this.purge(now); return this.logs.get(id); }
}
const globalReports = globalThis as typeof globalThis & { ocularCameraReports?: CameraReportCache };
export const cameraReports = globalReports.ocularCameraReports ??= new CameraReportCache();
