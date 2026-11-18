import { allowLocalRequest, validRunId } from '@/lib/analysis-contract';
import { cameraReports } from '@/lib/camera-report-store';
import { cameraIncidentReport } from '@/lib/incident-report';
import { AnalysisError } from '@/lib/server-analysis';
import { pdfResponse } from '@/lib/server-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!allowLocalRequest(request)) return Response.json({ error: 'Local access only.' }, { status: 403 });
  try {
    const id = (await params).sessionId;
    const log = validRunId(id) ? cameraReports.get(id) : undefined;
    if (!log) throw new AnalysisError('This camera report expired or the local server restarted. Start a new session and download the PDF after Stop.', 404);
    if (!log.snapshot.frames) throw new AnalysisError('No processed camera frames are available to report.', 409);
    return await pdfResponse(cameraIncidentReport(log.snapshot), request.signal);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'The camera PDF could not be generated.' }, { status: error instanceof AnalysisError ? error.status : 400 }); }
}
