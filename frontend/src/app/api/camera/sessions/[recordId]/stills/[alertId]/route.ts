import { readFile } from 'node:fs/promises';
import { allowLocalRequest } from '@/lib/analysis-contract';
import { cameraStill } from '@/lib/server-camera';
import { AnalysisError } from '@/lib/server-analysis';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{recordId:string;alertId:string}>};

/** The alert's still as `image/jpeg`. */
export async function GET(request:Request,context:Context) {
  if (!allowLocalRequest(request)) return Response.json({error:'Local access only.'},{status:403});
  try {
    const {recordId,alertId}=await context.params;
    const jpeg=await readFile(await cameraStill(recordId,alertId));
    return new Response(new Uint8Array(jpeg),{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'Still image not found.'},
      {status:error instanceof AnalysisError ? error.status : 404,headers:{'Cache-Control':'no-store'}});
  }
}
