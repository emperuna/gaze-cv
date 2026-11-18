import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { AnalysisError, backendStatus, projectRoot, python, pythonEnvironment } from './server-analysis.ts';
import { acquireProcessingSlot } from './processing-slot.ts';
import { CameraSession } from './camera-session.ts';
import type { CameraSettings } from './camera-contract.ts';
import { CameraReportLog } from './incident-report.ts';
import { cameraReports } from './camera-report-store.ts';

const shared = globalThis as typeof globalThis & { gazeCameraSession?: {id:string; session:CameraSession} };

export async function startCamera(settings: CameraSettings, signal: AbortSignal) {
  let release;
  try {release=acquireProcessingSlot();}
  catch (error) {throw new AnalysisError((error as Error).message,409);}
  let session: CameraSession | undefined;
  try {
    const status=await backendStatus();
    if (!status.methods.baseline.ready) throw new AnalysisError(status.methods.baseline.message,503);
    if (signal.aborted) throw new AnalysisError('Camera startup cancelled.',499);
    const child=spawn(python,[join(projectRoot,'scripts','camera_worker.py'),'--method','baseline',
      ...(settings.mirrored ? ['--mirrored'] : []), '--tile-grid',String(settings.tileGrid)],
      {cwd:projectRoot,env:pythonEnvironment(),windowsHide:true,shell:false});
    const id=randomUUID();
    const reportLog=new CameraReportLog(id,settings);
    session=new CameraSession(child,release,{onResult:result=>reportLog.add(result)});
    shared.gazeCameraSession={id,session};
    child.once('close',() => {reportLog.end();cameraReports.finish(id);if (shared.gazeCameraSession?.id===id) shared.gazeCameraSession=undefined;});
    const current=session;
    const abort=() => {void current.close('Camera startup cancelled.');};
    signal.addEventListener('abort',abort,{once:true});
    try {await session.ready; if (signal.aborted) throw new Error('Camera startup cancelled.');}
    finally {signal.removeEventListener('abort',abort);}
    reportLog.snapshot.startedAt=new Date().toISOString();
    cameraReports.add(reportLog);
    return {sessionId:id};
  } catch (error) {
    if (session) await session.close(); else release();
    throw error;
  }
}

export function getCamera(id:string) {
  if (shared.gazeCameraSession?.id!==id) throw new AnalysisError('Camera session ended. Start again.',404);
  return shared.gazeCameraSession.session;
}
