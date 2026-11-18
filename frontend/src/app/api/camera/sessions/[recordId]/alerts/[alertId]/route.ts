import { allowLocalRequest } from '@/lib/analysis-contract';
import { readCameraJson } from '@/lib/camera-contract';
import { markCameraAlert } from '@/lib/server-camera';
import { AnalysisError } from '@/lib/server-analysis';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{recordId:string;alertId:string}>};
const headers={'Cache-Control':'no-store'};

/** Body `{mark: 'Checked'|'Dismissed', note, revision}` → `{alert, revision}` (409 on a stale revision). */
export async function PUT(request:Request,context:Context) {
  if (!allowLocalRequest(request)) return Response.json({error:'Local access only.'},{status:403});
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return Response.json({error:'Send the mark as JSON.'},{status:415});
  try {
    const {recordId,alertId}=await context.params;
    return Response.json(await markCameraAlert(recordId,alertId,await readCameraJson(request,16384)),{headers});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'The alert could not be marked.'},
      {status:error instanceof AnalysisError ? error.status : 400,headers});
  }
}
