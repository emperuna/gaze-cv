import { allowLocalRequest } from '@/lib/analysis-contract';
import { readCameraJson, validateCameraSettings } from '@/lib/camera-contract';
import { startCamera } from '@/lib/server-camera';
import { AnalysisError } from '@/lib/server-analysis';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request:Request) {
  if (!allowLocalRequest(request)) return Response.json({error:'Camera analysis is local only.'},{status:403});
  try {
    const settings=validateCameraSettings(await readCameraJson(request,4096));
    return Response.json(await startCamera(settings,request.signal),{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'Camera could not start.'},
      {status:error instanceof AnalysisError ? error.status : 400});
  }
}
