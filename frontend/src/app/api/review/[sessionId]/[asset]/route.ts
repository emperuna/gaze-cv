import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { allowLocalRequest } from '@/lib/analysis-contract';
import { reviewAsset } from '@/lib/server-review';
import { parseRange } from '@/lib/media-range';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{sessionId:string;asset:string}>}) {
  if(!allowLocalRequest(request)) return new Response('Local access only',{status:403});
  try {
    const {sessionId,asset}=await params;
    const {file,size,mime}=await reviewAsset(sessionId,asset);
    let range;
    try{range=parseRange(request.headers.get('range'),size);}catch{return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});}
    const download=new URL(request.url).searchParams.has('download') || asset==='annotated.avi';
    const headers:Record<string,string>={'Content-Type':mime,'Content-Length':String(range ? range.end-range.start+1 : size),
      'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Content-Disposition':`${download ? 'attachment' : 'inline'}; filename="${asset==='source' ? 'source-video' : asset}"`};
    if(range)headers['Content-Range']=`bytes ${range.start}-${range.end}/${size}`;
    const stream=createReadStream(file,range ?? undefined);
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>,{status:range ? 206 : 200,headers});
  } catch{return new Response('Session or artifact not found',{status:404});}
}
