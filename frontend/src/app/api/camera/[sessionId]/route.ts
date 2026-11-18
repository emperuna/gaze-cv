import { allowLocalRequest, validRunId } from '@/lib/analysis-contract';
import { MAX_FRAME_BODY, readCameraJson, validateCameraFrame } from '@/lib/camera-contract';
import { getCamera, stopCamera } from '@/lib/server-camera';
import { AnalysisError } from '@/lib/server-analysis';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{sessionId:string}>};
const headers={'Cache-Control':'no-store'};

async function sessionId(request:Request,context:Context) {
  if (!allowLocalRequest(request)) throw new AnalysisError('Camera analysis is local only.',403);
  const {sessionId}=await context.params;
  if (!validRunId(sessionId)) throw new AnalysisError('Camera session not found.',404);
  return sessionId;
}

function failure(error:unknown) {
  return Response.json({error:error instanceof Error ? error.message : 'Camera processing failed.'},
    {status:error instanceof AnalysisError ? error.status : 400,headers});
}

/** One frame. Preview: the worker result. Monitoring: the result plus `alerts`, `sessionTime`, `revision`, `state`, `saveError`, `notice`. */
export async function POST(request:Request,context:Context) {
  try {
    const live=getCamera(await sessionId(request,context));
    const frame=validateCameraFrame(await readCameraJson(request,MAX_FRAME_BODY));
    const abort=() => {void live.session.close('Camera request cancelled.');};
    request.signal.addEventListener('abort',abort,{once:true});
    try {
      if (request.signal.aborted) throw new Error('Camera request cancelled.');
      return Response.json(await live.frame(frame),{headers});
    } finally {request.signal.removeEventListener('abort',abort);}
  } catch (error) {return failure(error);}
}

/** Stop → `{recordId, saveError: null}`; a monitored record is saved as ended before the worker closes (503 if it could not be saved; Stop again retries). */
export async function DELETE(request:Request,context:Context) {
  try {return Response.json(await stopCamera(await sessionId(request,context)),{headers});}
  catch (error) {return failure(error);}
}
