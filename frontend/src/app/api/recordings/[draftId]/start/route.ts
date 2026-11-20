import { allowLocalRequest } from '@/lib/analysis-contract';
import { readCameraJson } from '@/lib/camera-contract';
import { AnalysisError } from '@/lib/server-analysis';
import { startRecordingReview } from '@/lib/server-recording';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{draftId:string}>};
const headers={'Cache-Control':'no-store'};

/** Body `{seats, movement, exam?}` → `{recordId}` (the draft's id). Progress is read from `GET /api/camera/sessions/<recordId>`. */
export async function POST(request:Request,context:Context) {
  if (!allowLocalRequest(request)) return Response.json({error:'Local access only.'},{status:403});
  try {
    const {draftId}=await context.params;
    return Response.json(await startRecordingReview(draftId,await readCameraJson(request,64*1024)),{headers});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'The review could not start.'},
      {status:error instanceof AnalysisError ? error.status : 400,headers});
  }
}
