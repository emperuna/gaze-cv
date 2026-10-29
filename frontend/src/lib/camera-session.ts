import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { CameraFrame, CameraResult } from './camera-contract.ts';

type Waiter = { resolve: (value: CameraResult) => void; reject: (error: Error) => void; frame: CameraFrame };

/** Owns one model process. The reservation survives termination until actual exit. */
export class CameraSession {
  readonly ready: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  private exitedResolve!: () => void;
  private readonly exited: Promise<void>;
  private initialized = false;
  private stopped = false;
  private pending?: Waiter;
  private buffer = '';
  private diagnostics = '';
  private timer?: ReturnType<typeof setTimeout>;
  private killer?: ReturnType<typeof setTimeout>;
  private lastTimestamp = -1;
  private readonly idleMs: number;
  private readonly frameMs: number;
  private readonly child: ChildProcessWithoutNullStreams;

  constructor(child: ChildProcessWithoutNullStreams, release: () => void,
    options: { idleMs?: number; frameMs?: number; startupMs?: number } = {}) {
    this.child = child;
    this.idleMs = options.idleMs ?? 15_000;
    this.frameMs = options.frameMs ?? 30_000;
    this.ready = new Promise((resolve, reject) => {this.readyResolve=resolve; this.readyReject=reject;});
    this.exited = new Promise(resolve => {this.exitedResolve=resolve;});
    child.stdout.on('data', chunk => this.receive(chunk.toString()));
    child.stderr.on('data', chunk => {this.diagnostics = (this.diagnostics + chunk.toString()).slice(-2000);});
    child.stdin.on('error', () => {void this.close('Camera worker input failed. Start again.');});
    child.once('error', () => {void this.close('Camera worker could not start. Verify the project Python setup.');});
    child.once('close', () => {
      this.fail(new Error(this.initialized ? 'Camera processor exited. Start again.' : `Camera processor exited during startup. ${this.diagnostics.slice(-500)}`));
      clearTimeout(this.killer);
      release(); this.exitedResolve();
    });
    this.arm(options.startupMs ?? 60_000, 'Camera model startup timed out. Verify the project setup.');
  }

  private arm(ms: number, message: string) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {void this.close(message);}, ms);
  }

  private fail(error: Error) {
    this.stopped = true;
    clearTimeout(this.timer);
    this.readyReject(error);
    this.pending?.reject(error); this.pending = undefined;
  }

  private receive(chunk: string) {
    if (this.stopped) return;
    this.buffer += chunk;
    if (this.buffer.length > 2_000_000) {void this.close('Camera worker response is too large.'); return;}
    let newline;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0,newline); this.buffer=this.buffer.slice(newline+1);
      try {
        const value = JSON.parse(line);
        if (!this.initialized && value.ready === true) {
          this.initialized=true; this.readyResolve(); this.arm(this.idleMs,'Camera session expired. Start again.');
        } else if (this.pending && value.id === this.pending.frame.id) {
          if (value.error) {void this.close(String(value.error)); return;}
          if (value.timestamp_seconds !== this.pending.frame.timestamp_seconds || !value.result || !Array.isArray(value.result.detections)) throw new Error();
          this.lastTimestamp = value.timestamp_seconds;
          this.pending.resolve(value as CameraResult); this.pending=undefined;
          this.arm(this.idleMs,'Camera session expired. Start again.');
        } else throw new Error();
      } catch {void this.close('Invalid camera processor response. Start again.'); return;}
    }
  }

  async frame(frame: CameraFrame): Promise<CameraResult> {
    if (this.stopped) throw new Error('Camera session stopped. Start again.');
    if (!this.initialized) throw new Error('Camera model is still starting.');
    if (this.pending) throw new Error('A camera frame is already processing.');
    if (frame.timestamp_seconds <= this.lastTimestamp) throw new Error('Capture timestamps must strictly increase.');
    return new Promise((resolve,reject) => {
      this.pending={resolve,reject,frame};
      this.arm(this.frameMs,'Camera frame processing timed out. Start again.');
      this.child.stdin.write(JSON.stringify(frame)+'\n');
    });
  }

  close(message = 'Camera session stopped.'): Promise<void> {
    if (!this.stopped) {
      this.fail(new Error(message));
      this.child.kill('SIGTERM');
      this.killer=setTimeout(() => {this.child.kill('SIGKILL');},2000);
      this.killer.unref();
    }
    return this.exited;
  }
}
