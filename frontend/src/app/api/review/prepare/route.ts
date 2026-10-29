import { allowLocalRequest } from '@/lib/analysis-contract';
import { prepareReview,readReviewForm } from '@/lib/server-review';
import { AnalysisError } from '@/lib/server-analysis';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  if(!allowLocalRequest(request))return Response.json({error:'Local access only.'},{status:403});
  try {
    const form=await readReviewForm(request);const file=form.get('file');
    if(!(file instanceof File))throw new Error('Choose a saved video.');
    const result=await prepareReview(file,JSON.parse(String(form.get('settings'))),request.signal);
    return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:'Video setup failed.'},{status:error instanceof AnalysisError?error.status:400});
  }
}
