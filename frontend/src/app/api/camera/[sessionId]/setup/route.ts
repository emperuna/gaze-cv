import { allowLocalRequest, validRunId } from '@/lib/analysis-contract';
import { getCamera } from '@/lib/server-camera';
import { AnalysisError } from '@/lib/server-analysis';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{sessionId:string}>};
const headers={'Cache-Control':'no-store'};

/** Suggest seats from recent setup frames → `{seats, sampledFrames, note}`. Only before monitoring starts. */
export async function POST(request:Request,context:Context) {
  if (!allowLocalRequest(request)) return Response.json({error:'Camera analysis is local only.'},{status:403});
  try {
    const {sessionId}=await context.params;
    if (!validRunId(sessionId)) throw new AnalysisError('Camera session not found.',404);
    return Response.json(await getCamera(sessionId).suggestSeats(),{headers});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'Seats could not be suggested.'},
      {status:error instanceof AnalysisError ? error.status : 400,headers});
  }
}
