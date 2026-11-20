import { allowLocalRequest } from '@/lib/analysis-contract';
import { AnalysisError } from '@/lib/server-analysis';
import { recordingVideoResponse } from '@/lib/server-recording';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{recordId:string}>};

/** The recording's video, with byte ranges for playback; works for an upload before and after the review starts. */
export async function GET(request:Request,context:Context) {
  if (!allowLocalRequest(request)) return Response.json({error:'Local access only.'},{status:403});
  try {return await recordingVideoResponse((await context.params).recordId,request.headers.get('range'));}
  catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'Recording not found.'},
      {status:error instanceof AnalysisError ? error.status : 404,headers:{'Cache-Control':'no-store'}});
  }
}
