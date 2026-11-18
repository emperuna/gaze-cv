import { join } from 'node:path';
import { allowLocalRequest } from '@/lib/analysis-contract';
import { liveSessionReport } from '@/lib/incident-report';
import { getCameraRecord } from '@/lib/server-camera';
import { cameraRecordRoot, presentStills } from '@/lib/server-camera-record';
import { AnalysisError } from '@/lib/server-analysis';
import { pdfResponse } from '@/lib/server-pdf';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{recordId:string}>};

/** → PDF of the session's alerts, marks and stills (a missing still file is listed as unavailable). getCameraRecord reads the live in-memory record while monitoring, else the saved one (with isActive). */
export async function GET(request:Request,context:Context) {
  if (!allowLocalRequest(request)) return Response.json({error:'Local access only.'},{status:403});
  try {
    const record=await getCameraRecord((await context.params).recordId);
    const stills=await presentStills(record);
    return await pdfResponse(liveSessionReport(record,join(cameraRecordRoot,record.id),still => stills.has(still)),request.signal);
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'The report could not be prepared.'},
      {status:error instanceof AnalysisError ? error.status : 400,headers:{'Cache-Control':'no-store'}});
  }
}
