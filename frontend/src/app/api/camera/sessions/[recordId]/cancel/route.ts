import { allowLocalRequest } from '@/lib/analysis-contract';
import { AnalysisError } from '@/lib/server-analysis';
import { cancelRecordingReview } from '@/lib/server-recording';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{recordId:string}>};
const headers={'Cache-Control':'no-store'};

/** → 204. Stops a running recording review and deletes its video, photos and record (or an unstarted upload). */
export async function POST(request:Request,context:Context) {
  if (!allowLocalRequest(request)) return Response.json({error:'Local access only.'},{status:403});
  try {await cancelRecordingReview((await context.params).recordId); return new Response(null,{status:204,headers});}
  catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'The review could not be cancelled.'},
      {status:error instanceof AnalysisError ? error.status : 400,headers});
  }
}
