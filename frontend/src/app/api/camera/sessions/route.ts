import { allowLocalRequest } from '@/lib/analysis-contract';
import { listCameraRecords } from '@/lib/server-camera';
import { AnalysisError } from '@/lib/server-analysis';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};

/** Past sessions → `{sessions: RecordSummary[]}`, newest first. */
export async function GET(request:Request) {
  if (!allowLocalRequest(request)) return Response.json({error:'Local access only.'},{status:403});
  try {return Response.json({sessions:await listCameraRecords()},{headers});}
  catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'Saved sessions could not be listed.'},
      {status:error instanceof AnalysisError ? error.status : 500,headers});
  }
}
