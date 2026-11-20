import { allowLocalRequest } from '@/lib/analysis-contract';
import { validateCameraSettings } from '@/lib/camera-contract';
import { AnalysisError } from '@/lib/server-analysis';
import { suggestRecording } from '@/lib/server-recording';
import { discardDraft, pruneDrafts, saveUpload } from '@/lib/server-recording-files';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};

/**
 * Body: the video file itself. Query `name` (file name), `mirrored`, `tileGrid`, `headTurns` (camera settings)
 * → `{draftId, seats, sampledFrames, durationSeconds, width, height}`. The preview is at `/api/camera/sessions/<draftId>/preview`.
 */
export async function POST(request:Request) {
  if (!allowLocalRequest(request)) return Response.json({error:'Local access only.'},{status:403});
  let draftId: string | undefined;
  try {
    const query=new URL(request.url).searchParams;
    let settings;
    try {
      settings=validateCameraSettings({mirrored:query.get('mirrored')==='true',tileGrid:Number(query.get('tileGrid') ?? 2),
        headTurns:query.get('headTurns')!=='false'});
    } catch (error) {throw new AnalysisError((error as Error).message,400);}
    if (!request.body) throw new AnalysisError('Choose a video to upload.',400);
    // Tidying old uploads must never block a new one.
    await pruneDrafts().catch(error => console.error(`Old uploads could not be tidied: ${(error as Error).message}`));
    const length=request.headers.get('content-length');
    const declaredBytes=length!==null && /^\d+$/.test(length) ? Number(length) : undefined;
    ({draftId}=await saveUpload(request.body,query.get('name') ?? '',{declaredBytes}));
    return Response.json(await suggestRecording(draftId,settings),{headers});
  } catch (error) {
    if (draftId) await discardDraft(draftId).catch(() => {});
    return Response.json({error:error instanceof Error ? error.message : 'The video could not be uploaded.'},
      {status:error instanceof AnalysisError ? error.status : 400,headers});
  }
}
