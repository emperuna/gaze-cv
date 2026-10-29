import { allowLocalRequest } from '@/lib/analysis-contract';
import { createReview,listReviews,readReviewForm } from '@/lib/server-review';
import { AnalysisError } from '@/lib/server-analysis';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  if(!allowLocalRequest(request)) return Response.json({error:'Local access only.'},{status:403});
  return Response.json(await listReviews(),{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:Request) {
  if(!allowLocalRequest(request)) return Response.json({error:'Local access only.'},{status:403});
  try {
    const form=await readReviewForm(request);
    const file=form.get('file');
    if(!(file instanceof File)) throw new Error('Choose a saved video.');
    const settings=JSON.parse(String(form.get('settings')));
    return Response.json(await createReview(file,settings,request.signal),{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    return Response.json({error:error instanceof Error ? error.message : 'Session processing failed.'},{status:error instanceof AnalysisError ? error.status : 400});
  }
}
