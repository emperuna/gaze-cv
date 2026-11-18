import { allowLocalRequest } from '@/lib/analysis-contract';
import { readCameraJson } from '@/lib/camera-contract';
import { AnalysisError } from '@/lib/server-analysis';
import { MAX_WORKFLOW_BYTES, readWorkflowFile, saveWorkflowFile, workflowSession } from '@/lib/server-review-workflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ sessionId: string }> };
const headers = { 'Cache-Control': 'no-store' };

function failure(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : 'Could not read or save review notes.' },
    { status: error instanceof AnalysisError ? error.status : 400, headers });
}

export async function GET(request: Request, context: Context) {
  if (!allowLocalRequest(request)) return Response.json({ error: 'Local access only.' }, { status: 403 });
  try {
    const { root, record } = await workflowSession((await context.params).sessionId);
    return Response.json(await readWorkflowFile(root, record), { headers });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request, context: Context) {
  if (!allowLocalRequest(request)) return Response.json({ error: 'Local access only.' }, { status: 403 });
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return Response.json({ error: 'Send review notes as JSON.' }, { status: 415 });
  try {
    let value: unknown;
    try { value = await readCameraJson(request, MAX_WORKFLOW_BYTES); }
    catch (error) {
      if (error instanceof Error && error.message === 'Camera request is too large.') throw new AnalysisError('Review notes exceed the 2 MB session limit.', 413);
      throw error;
    }
    const { root, record } = await workflowSession((await context.params).sessionId);
    return Response.json(await saveWorkflowFile(root, record, value), { headers });
  } catch (error) { return failure(error); }
}
