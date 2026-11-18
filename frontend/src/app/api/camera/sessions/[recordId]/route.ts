import { allowLocalRequest } from '@/lib/analysis-contract';
import { deleteCameraRecord, getCameraRecord } from '@/lib/server-camera';
import { AnalysisError } from '@/lib/server-analysis';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{recordId:string}>};
const headers={'Cache-Control':'no-store'};

function failure(error:unknown) {
  return Response.json({error:error instanceof Error ? error.message : 'The saved session could not be read.'},
    {status:error instanceof AnalysisError ? error.status : 400,headers});
}

/** → `{record}`; the active session returns its live in-memory record. */
export async function GET(request:Request,context:Context) {
  if (!allowLocalRequest(request)) return Response.json({error:'Local access only.'},{status:403});
  try {return Response.json({record:await getCameraRecord((await context.params).recordId)},{headers});}
  catch (error) {return failure(error);}
}

/** → 204; refused with 409 while the session is live. */
export async function DELETE(request:Request,context:Context) {
  if (!allowLocalRequest(request)) return Response.json({error:'Local access only.'},{status:403});
  try {await deleteCameraRecord((await context.params).recordId); return new Response(null,{status:204,headers});}
  catch (error) {return failure(error);}
}
