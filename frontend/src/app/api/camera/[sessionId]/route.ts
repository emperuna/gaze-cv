import { allowLocalRequest, validRunId } from '@/lib/analysis-contract';
import { MAX_FRAME_BODY, readCameraJson, validateCameraFrame } from '@/lib/camera-contract';
import { getCamera } from '@/lib/server-camera';
import { AnalysisError } from '@/lib/server-analysis';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{sessionId:string}>};

async function sessionFor(request:Request,context:Context) {
  if (!allowLocalRequest(request)) throw new AnalysisError('Camera analysis is local only.',403);
  const {sessionId}=await context.params;
  if (!validRunId(sessionId)) throw new AnalysisError('Camera session not found.',404);
  return getCamera(sessionId);
}

function failure(error:unknown) {
  return Response.json({error:error instanceof Error ? error.message : 'Camera processing failed.'},
    {status:error instanceof AnalysisError ? error.status : 400});
}

export async function POST(request:Request,context:Context) {
  try {
    const session=await sessionFor(request,context);
    const frame=validateCameraFrame(await readCameraJson(request,MAX_FRAME_BODY));
    const abort=() => {void session.close('Camera request cancelled.');};
    request.signal.addEventListener('abort',abort,{once:true});
    try {
      if (request.signal.aborted) throw new Error('Camera request cancelled.');
      return Response.json(await session.frame(frame),{headers:{'Cache-Control':'no-store'}});
    } finally {request.signal.removeEventListener('abort',abort);}
  } catch (error) {return failure(error);}
}

export async function DELETE(request:Request,context:Context) {
  try {await (await sessionFor(request,context)).close(); return new Response(null,{status:204});}
  catch (error) {return failure(error);}
}
