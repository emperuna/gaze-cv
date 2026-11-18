import { allowLocalRequest, validRunId } from '@/lib/analysis-contract';
import { interruptCamera } from '@/lib/server-camera';
import { AnalysisError } from '@/lib/server-analysis';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{sessionId:string}>};
const headers={'Cache-Control':'no-store'};

/** Pause → `{recordId, state}`. Closes the worker without ending the record, which is saved as `interrupted` (404 if already gone). */
export async function POST(request:Request,context:Context) {
  if (!allowLocalRequest(request)) return Response.json({error:'Camera analysis is local only.'},{status:403});
  try {
    const {sessionId}=await context.params;
    if (!validRunId(sessionId)) throw new AnalysisError('Camera session not found.',404);
    return Response.json(await interruptCamera(sessionId),{headers});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'Monitoring could not be paused.'},
      {status:error instanceof AnalysisError ? error.status : 400,headers});
  }
}
