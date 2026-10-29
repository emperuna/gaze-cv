import { allowLocalRequest } from '@/lib/analysis-contract';
import { readReviewMeta } from '@/lib/server-review';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{sessionId:string}>}) {
  if(!allowLocalRequest(request))return Response.json({error:'Local access only.'},{status:403});
  try{return Response.json(await readReviewMeta((await params).sessionId),{headers:{'Cache-Control':'no-store'}});}
  catch{return Response.json({error:'Saved session not found.'},{status:404});}
}
