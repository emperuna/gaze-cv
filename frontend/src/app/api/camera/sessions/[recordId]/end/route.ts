import { allowLocalRequest } from '@/lib/analysis-contract';
import { endCameraRecord } from '@/lib/server-camera';
import { AnalysisError } from '@/lib/server-analysis';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{recordId:string}>};
const headers={'Cache-Control':'no-store'};

/** End session → `{record}`. A live session is stopped; an interrupted one is saved as ended. */
export async function POST(request:Request,context:Context) {
  if (!allowLocalRequest(request)) return Response.json({error:'Local access only.'},{status:403});
  try {return Response.json({record:await endCameraRecord((await context.params).recordId)},{headers});}
  catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'The session could not be ended.'},
      {status:error instanceof AnalysisError ? error.status : 400,headers});
  }
}
