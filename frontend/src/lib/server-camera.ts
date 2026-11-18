import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { AnalysisError, backendStatus, projectRoot, python, pythonEnvironment } from './server-analysis.ts';
import { acquireProcessingSlot } from './processing-slot.ts';
import { CameraSession } from './camera-session.ts';
import { validateAlertMark } from './camera-contract.ts';
import type { CameraSettings } from './camera-contract.ts';
import { validRunId } from './analysis-contract.ts';
import type { LiveAlert, LiveSessionRecord } from './live-alerts.ts';
import { deleteRecord, endSavedRecord, listRecords, loadRecord, removeStaleLock, stillFile, updateAlertMark } from './server-camera-record.ts';
import type { RecordOptions, RecordSummary } from './server-camera-record.ts';
import { LiveCamera } from './server-live-session.ts';
import type { LiveOptions } from './server-live-session.ts';

/** Production defaults apply when omitted; tests inject a record root, clock and fake worker. */
export interface CameraOptions extends LiveOptions {
  launch?: (settings: CameraSettings) => Promise<ChildProcessWithoutNullStreams>;
  session?: { idleMs?: number; frameMs?: number; startupMs?: number };
}

const shared = globalThis as typeof globalThis & { gazeCameraSession?: LiveCamera };

async function launchWorker(settings: CameraSettings): Promise<ChildProcessWithoutNullStreams> {
  const status=await backendStatus();
  if (!status.methods.baseline.ready) throw new AnalysisError(status.methods.baseline.message,503);
  return spawn(python,[join(projectRoot,'scripts','camera_worker.py'),'--method','baseline',
    ...(settings.mirrored ? ['--mirrored'] : []), '--tile-grid',String(settings.tileGrid)],
    {cwd:projectRoot,env:pythonEnvironment(),windowsHide:true,shell:false});
}

/** True only while that record's worker is alive and monitoring. */
export function isActive(recordId: string): boolean {
  const live=shared.gazeCameraSession;
  return !!live && live.monitoring && live.record?.id===recordId;
}
const activeFor=(recordId:string) => isActive(recordId) ? shared.gazeCameraSession : undefined;
const recordOptions=(options:LiveOptions):RecordOptions => ({root:options.root,lockTimeoutMs:options.lockTimeoutMs,isActive});

/**
 * Starts the single live worker. With `resume`, the interrupted record continues on the new worker with its
 * saved mirroring, tiling, seats and movement settings; the request's settings are ignored.
 */
export async function startCamera(settings: CameraSettings, signal: AbortSignal, resume?: string, options: CameraOptions = {}):
  Promise<{ sessionId: string; recordId?: string; record?: LiveSessionRecord }> {
  if (resume!==undefined && !validRunId(resume)) throw new AnalysisError('Invalid session id.',400);
  let release;
  try {release=acquireProcessingSlot();}
  catch (error) {throw new AnalysisError((error as Error).message,409);}
  let session: CameraSession | undefined;
  try {
    const interrupted=async () => {
      const record=await loadRecord(resume!,recordOptions(options));
      if (record.state!=='interrupted') throw new AnalysisError('Only an interrupted session can be resumed.',409);
      return record;
    };
    if (resume) {
      const saved=await interrupted();
      settings={mirrored:saved.settings.mirrored,tileGrid:saved.settings.tileGrid};
      await removeStaleLock(resume,{root:options.root});
    }
    if (signal.aborted) throw new AnalysisError('Camera startup cancelled.',499);
    const child=await (options.launch ?? launchWorker)(settings);
    session=new CameraSession(child,release,options.session);
    const live=new LiveCamera(randomUUID(),session,settings,options);
    shared.gazeCameraSession=live;
    session.onExit(() => {if (shared.gazeCameraSession===live) shared.gazeCameraSession=undefined;});
    const current=session;
    const abort=() => {void current.close('Camera startup cancelled.');};
    signal.addEventListener('abort',abort,{once:true});
    try {
      await session.ready;
      if (signal.aborted) throw new Error('Camera startup cancelled.');
      if (resume) {
        // Re-read just before taking ownership so a mark saved during startup is kept.
        const record=await interrupted();
        await live.resume(record);
        return {sessionId:live.id,recordId:record.id,record};
      }
    } finally {signal.removeEventListener('abort',abort);}
    return {sessionId:live.id};
  } catch (error) {
    if (session) await session.close(error instanceof Error && error.message ? error.message : 'Camera startup failed.'); else release();
    throw error;
  }
}

export function getCamera(id:string): LiveCamera {
  const live=shared.gazeCameraSession;
  if (live?.id!==id) throw new AnalysisError('Camera session ended. Start again.',404);
  return live;
}

/** Stop: ends and saves the record (if monitoring), then closes the worker. A preview-only worker just closes. */
export function stopCamera(id:string) {return getCamera(id).stop();}

export function listCameraRecords(options:LiveOptions={}): Promise<RecordSummary[]> {return listRecords(recordOptions(options));}

/** The live in-memory record for the active session (disk may lag by a few seconds), otherwise the saved one. */
export async function getCameraRecord(recordId:string,options:LiveOptions={}): Promise<LiveSessionRecord> {
  return activeFor(recordId)?.record ?? loadRecord(recordId,recordOptions(options));
}

export function deleteCameraRecord(recordId:string,options:LiveOptions={}): Promise<void> {return deleteRecord(recordId,recordOptions(options));}

/** End session: stops the live worker when the record is active, otherwise ends the saved record. */
export async function endCameraRecord(recordId:string,options:LiveOptions={}): Promise<LiveSessionRecord> {
  const live=activeFor(recordId);
  if (live) {await live.stop(); return live.record!;}
  return endSavedRecord(recordId,recordOptions(options));
}

export async function markCameraAlert(recordId:string,alertId:string,body:unknown,options:LiveOptions={}):
  Promise<{ alert: LiveAlert; revision: number; saveError?: string | null }> {
  let value;
  try {value=validateAlertMark(body);} catch (error) {throw new AnalysisError((error as Error).message,400);}
  const live=activeFor(recordId);
  if (live) return live.mark(alertId,value.mark,value.note,value.revision);
  const alert=await updateAlertMark(recordId,alertId,value.mark,value.note,value.revision,recordOptions(options));
  return {alert,revision:value.revision+1};
}

export function cameraStill(recordId:string,alertId:string,options:LiveOptions={}): Promise<string> {
  return stillFile(recordId,alertId,recordOptions(options));
}
