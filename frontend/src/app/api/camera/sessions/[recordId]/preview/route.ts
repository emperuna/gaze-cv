import { readFile } from 'node:fs/promises';
import { allowLocalRequest } from '@/lib/analysis-contract';
import { AnalysisError } from '@/lib/server-analysis';
import { recordingPreview } from '@/lib/server-recording';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{recordId:string}>};

/** The recording's first frame as `image/jpeg`, for checking seats; works for an upload before and after the review starts. */
export async function GET(request:Request,context:Context) {
  if (!allowLocalRequest(request)) return Response.json({error:'Local access only.'},{status:403});
  try {
    const jpeg=await readFile(await recordingPreview((await context.params).recordId));
    return new Response(new Uint8Array(jpeg),{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'Preview not found.'},
      {status:error instanceof AnalysisError ? error.status : 404,headers:{'Cache-Control':'no-store'}});
  }
}
