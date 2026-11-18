import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { CameraFrame, CameraResult } from './camera-contract.ts';

type Waiter = { resolve: (value: any) => void; reject: (error: Error) => void; frame?: CameraFrame; key?: string };
export type ExitListener = (reason: 'stopped' | 'failed', message: string) => void;

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
  private exit?: { reason: 'stopped' | 'failed'; message: string };
  private readonly exitListeners: ExitListener[] = [];
  private readonly idleMs: number;
  private readonly frameMs: number;
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly onResult?: (result: CameraResult) => void;

  constructor(child: ChildProcessWithoutNullStreams, release: () => void,
    options: { idleMs?: number; frameMs?: number; startupMs?: number; onResult?: (result: CameraResult) => void } = {}) {
    this.child = child;
    this.onResult = options.onResult;
    this.idleMs = options.idleMs ?? 15_000;
    this.frameMs = options.frameMs ?? 30_000;
    this.ready = new Promise((resolve, reject) => {this.readyResolve=resolve; this.readyReject=reject;});
    this.exited = new Promise(resolve => {this.exitedResolve=resolve;});
    child.stdout.on('data', chunk => this.receive(chunk.toString()));
    child.stderr.on('data', chunk => {this.diagnostics = (this.diagnostics + chunk.toString()).slice(-2000);});
    child.stdin.on('error', () => {void this.close('Camera worker input failed. Start again.');});
    child.once('error', () => {void this.close('Camera worker could not start. Verify the project Python setup.');});
    child.once('close', () => {
      const message = this.initialized ? 'Camera processor exited. Start again.' : `Camera processor exited during startup. ${this.diagnostics.slice(-500)}`;
      this.fail(new Error(message));
      clearTimeout(this.killer);
      const { reason, message: why } = this.exit ?? { reason: 'failed' as const, message };
      for (const listener of this.exitListeners) listener(reason, why);
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
        } else if (this.pending?.key) {
          if (value.error) {const waiter = this.pending; this.pending = undefined; waiter.reject(new Error(String(value.error))); this.arm(this.idleMs,'Camera session expired. Start again.'); continue;}
          if (value[this.pending.key] !== true) throw new Error();
          const waiter = this.pending; this.pending = undefined; waiter.resolve(value);
          this.arm(this.idleMs,'Camera session expired. Start again.');
        } else if (this.pending?.frame && value.id === this.pending.frame.id) {
          if (value.error) {void this.close(String(value.error)); return;}
          if (value.timestamp_seconds !== this.pending.frame.timestamp_seconds || !value.result || !Array.isArray(value.result.detections)) throw new Error();
          this.lastTimestamp = value.timestamp_seconds;
          this.onResult?.(value as CameraResult);
          this.pending.resolve(value as CameraResult); this.pending=undefined;
          this.arm(this.idleMs,'Camera session expired. Start again.');
        } else throw new Error();
      } catch {void this.close('Invalid camera processor response. Start again.'); return;}
    }
  }

  async frame(frame: CameraFrame): Promise<CameraResult> {
    if (this.stopped) throw new Error('Camera session stopped. Start again.');
    if (!this.initialized) throw new Error('Camera model is still starting.');
    if (this.pending) throw new Error('A camera request is already processing.');
    if (frame.timestamp_seconds <= this.lastTimestamp) throw new Error('Capture timestamps must strictly increase.');
    return new Promise((resolve,reject) => {
      this.pending={resolve,reject,frame};
      this.arm(this.frameMs,'Camera frame processing timed out. Start again.');
      this.child.stdin.write(JSON.stringify(frame)+'\n');
    });
  }

  /** Sends a worker command (`configure`, `suggest_seats`); the reply is matched by its key, not a frame id. */
  async command<T>(message: { type: string }, timeoutMs = 30_000): Promise<T> {
    const key = ({ configure: 'configured', suggest_seats: 'suggested' } as Record<string, string>)[message.type];
    if (!key) throw new Error('Unknown camera command.');
    if (this.stopped) throw new Error('Camera session stopped. Start again.');
    if (!this.initialized) throw new Error('Camera model is still starting.');
    if (this.pending) throw new Error('A camera request is already processing.');
    return new Promise<T>((resolve,reject) => {
      this.pending={resolve,reject,key};
      this.arm(timeoutMs,'Camera request timed out. Start again.');
      this.child.stdin.write(JSON.stringify(message)+'\n');
    });
  }

  /** Called once when the worker exits: `stopped` only when close() was called without a failure message. */
  onExit(listener: ExitListener) {this.exitListeners.push(listener);}

  close(message?: string): Promise<void> {
    if (!this.stopped) {
      this.exit = message === undefined ? { reason: 'stopped', message: 'Camera session stopped.' } : { reason: 'failed', message };
      message ??= 'Camera session stopped.';
      this.fail(new Error(message));
      this.child.kill('SIGTERM');
      this.killer=setTimeout(() => {this.child.kill('SIGKILL');},2000);
      this.killer.unref();
    }
    return this.exited;
  }
}
