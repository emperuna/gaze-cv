import { allowLocalRequest, validRunId } from '@/lib/analysis-contract';
import { readCameraJson } from '@/lib/camera-contract';
import { getCamera } from '@/lib/server-camera';
import { AnalysisError } from '@/lib/server-analysis';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{sessionId:string}>};
const headers={'Cache-Control':'no-store'};

/** Body `{seats, movement, maxGapAuto, exam?}` (exam: optional `{title, room, proctor}`) → `{recordId, record}`. Configures the worker and creates the session record. */
export async function POST(request:Request,context:Context) {
  if (!allowLocalRequest(request)) return Response.json({error:'Camera analysis is local only.'},{status:403});
  try {
    const {sessionId}=await context.params;
    if (!validRunId(sessionId)) throw new AnalysisError('Camera session not found.',404);
    const live=getCamera(sessionId);
    return Response.json(await live.monitor(await readCameraJson(request,64*1024)),{headers});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'Monitoring could not start.'},
      {status:error instanceof AnalysisError ? error.status : 400,headers});
  }
}
