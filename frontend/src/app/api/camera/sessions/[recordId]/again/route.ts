import { allowLocalRequest } from '@/lib/analysis-contract';
import { AnalysisError } from '@/lib/server-analysis';
import { reviewAgain } from '@/lib/server-recording';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{recordId:string}>};
const headers={'Cache-Control':'no-store'};

/** → `{recordId}`. Clears an ended or interrupted recording's alerts and reviews its stored video again. */
export async function POST(request:Request,context:Context) {
  if (!allowLocalRequest(request)) return Response.json({error:'Local access only.'},{status:403});
  try {return Response.json(await reviewAgain((await context.params).recordId),{headers});}
  catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'The review could not start.'},
      {status:error instanceof AnalysisError ? error.status : 400,headers});
  }
}
