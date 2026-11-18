import { allowLocalRequest } from '@/lib/analysis-contract';
import { readCameraJson, validateCameraSettings } from '@/lib/camera-contract';
import { startCamera } from '@/lib/server-camera';
import { AnalysisError } from '@/lib/server-analysis';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Body `{mirrored, tileGrid, resume?}`; with `resume` (an interrupted record id) monitoring continues that record. */
export async function POST(request:Request) {
  if (!allowLocalRequest(request)) return Response.json({error:'Camera analysis is local only.'},{status:403});
  try {
    const value=await readCameraJson(request,4096);
    const settings=validateCameraSettings(value);
    const {resume}=value as {resume?:unknown};
    if (resume!==undefined && typeof resume!=='string') throw new Error('Choose a saved session to resume.');
    return Response.json(await startCamera(settings,request.signal,resume),{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'Camera could not start.'},
      {status:error instanceof AnalysisError ? error.status : 400});
  }
}
