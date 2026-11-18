import { allowLocalRequest } from '@/lib/analysis-contract';
import { AnalysisError } from '@/lib/server-analysis';
import { analysisIncidentReport } from '@/lib/server-analysis-report';
import { pdfResponse } from '@/lib/server-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  if (!allowLocalRequest(request)) return Response.json({ error: 'Local access only.' }, { status: 403 });
  try { return await pdfResponse(await analysisIncidentReport((await params).runId, request.signal), request.signal); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'The PDF report could not be generated.' }, { status: error instanceof AnalysisError ? error.status : 400 }); }
}
