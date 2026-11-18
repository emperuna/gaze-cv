import { allowLocalRequest } from '@/lib/analysis-contract';
import { readWorkflowFile, workflowSession } from '@/lib/server-review-workflow';
import { sessionReport } from '@/lib/review-workflow';
import { savedIncidentReport } from '@/lib/incident-report';
import { pdfResponse } from '@/lib/server-pdf';
import { AnalysisError } from '@/lib/server-analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!allowLocalRequest(request)) return new Response('Local access only.', { status: 403 });
  try {
    const { root, record, meta } = await workflowSession((await params).sessionId);
    const workflow = await readWorkflowFile(root, record);
    if (new URL(request.url).searchParams.get('format') === 'pdf') return await pdfResponse(savedIncidentReport(meta, record, workflow), request.signal);
    return new Response(sessionReport(meta, record, workflow), { headers: {
      'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `attachment; filename="ocular-session-${meta.id}.md"`,
    } });
  } catch (error) { return Response.json({ error: error instanceof AnalysisError ? error.message : 'The session report could not be generated. Reopen the session and check its saved notes.' }, { status: error instanceof AnalysisError ? error.status : 400 }); }
}
