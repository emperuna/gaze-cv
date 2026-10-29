import { randomUUID } from 'node:crypto';
import { mkdir,mkdtemp,readFile,writeFile,readdir,stat,realpath } from 'node:fs/promises';
import { promises as fs } from 'node:fs';
import { join,relative,isAbsolute } from 'node:path';
import { AnalysisError,backendStatus,projectRoot,runPython } from './server-analysis.ts';
import { acquireProcessingSlot } from './processing-slot.ts';
import { MAX_UPLOAD_BYTES,validRunId } from './analysis-contract.ts';
import { validateReviewSettings } from './review-contract.ts';
import type { ReviewRecord,SavedReview } from './review-contract.ts';
import { validateCameraSettings } from './camera-contract.ts';
import type { ReviewPreparation } from './review-contract.ts';

export const reviewRoot=join(projectRoot,'outputs','runs','review');

export async function readReviewForm(request:Request):Promise<FormData> {
  if(!request.body)throw new Error('Choose a saved video.');
  const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>MAX_UPLOAD_BYTES+64*1024){await reader.cancel();throw new AnalysisError('Upload exceeds 64 MB.',413);}chunks.push(value);}
  } finally {reader.releaseLock();}
  return new Request(request.url,{method:'POST',headers:request.headers,body:Buffer.concat(chunks)}).formData();
}

function videoExtension(file:File) {
  const extension=file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if(!['.mp4','.webm'].includes(extension)||file.size<=0||file.size>MAX_UPLOAD_BYTES)throw new AnalysisError('Choose a nonempty MP4/WebM of at most 64 MB.',400);
  return extension;
}

export async function prepareReview(file:File,value:unknown,signal:AbortSignal):Promise<ReviewPreparation> {
  const extension=videoExtension(file);
  const settings=validateCameraSettings(value);
  const suggest=(value as {suggest?:unknown}).suggest;
  if(typeof suggest!=='boolean')throw new Error('Choose whether to suggest seats.');
  let release;
  try{release=acquireProcessingSlot();}catch(error){throw new AnalysisError((error as Error).message,409);}
  let temporary:string|undefined;
  try {
    const status=await backendStatus();
    if(!status.pythonReady)throw new AnalysisError('Prepare the local Python environment before checking a video.',503);
    if(suggest&&!status.methods[settings.method].ready)throw new AnalysisError(status.methods[settings.method].message,503);
    if(signal.aborted)throw new Error('Video setup cancelled.');
    const parent=join(projectRoot,'.work','review-setup');await mkdir(parent,{recursive:true});
    temporary=await mkdtemp(join(parent,'upload-'));
    const input=join(temporary,`input${extension}`);await writeFile(input,Buffer.from(await file.arrayBuffer()));
    const process=await runPython([join(projectRoot,'scripts','prepare_review.py'),'--input',input,'--method',settings.method,
      ...(settings.mirrored?['--mirrored']:[]),'--tile-grid',String(settings.tileGrid),...(suggest?['--suggest']:[])],120_000,signal);
    if(process.code!==0)throw new AnalysisError(process.stderr.trim().split('\n').at(-1)||'Video timing could not be checked.',422);
    return JSON.parse(process.stdout) as ReviewPreparation;
  } finally {try{if(temporary)await fs.rm(temporary,{recursive:true,force:true});}finally{release();}}
}
export const REVIEW_ASSETS:Record<string,{relative:string;mime:string}>={
  'review.json':{relative:'output/review.json',mime:'application/json'},
  'settings.json':{relative:'output/settings.json',mime:'application/json'},
  'events.json':{relative:'output/events.json',mime:'application/json'},
  'seat_history.json':{relative:'output/seat_history.json',mime:'application/json'},
  'summary.json':{relative:'output/summary.json',mime:'application/json'},
  'observations.jsonl':{relative:'output/observations.jsonl',mime:'application/x-ndjson'},
  'annotated.avi':{relative:'output/annotated.avi',mime:'video/x-msvideo'},
};

export async function publishReview(root:string,meta:unknown,signal:AbortSignal) {
  if(signal.aborted)throw new Error('Processing cancelled.');
  await writeFile(join(root,'session.pending'),JSON.stringify(meta),{flag:'wx'});
  if(signal.aborted)throw new Error('Processing cancelled.');
  await fs.rename(join(root,'session.pending'),join(root,'session.json'));
  if(signal.aborted){await fs.unlink(join(root,'session.json'));throw new Error('Processing cancelled.');}
}

export async function readReviewMeta(id:string):Promise<SavedReview> {
  if(!validRunId(id)) throw new AnalysisError('Session not found.',404);
  const root=await realpath(reviewRoot);
  const directory=await realpath(join(root,id));
  const location=relative(root,directory);
  if(location.startsWith('..') || isAbsolute(location)) throw new AnalysisError('Session not found.',404);
  const meta=JSON.parse(await readFile(join(directory,'session.json'),'utf8')) as SavedReview;
  if(meta.id!==id || !['.mp4','.webm'].includes(meta.extension)) throw new AnalysisError('Session record is invalid.',404);
  return meta;
}

export async function reviewAsset(id:string,asset:string) {
  const meta=await readReviewMeta(id);
  const entry=asset==='source' ? {relative:`input${meta.extension}`,mime:meta.extension==='.mp4' ? 'video/mp4' : 'video/webm'} : Object.hasOwn(REVIEW_ASSETS,asset) ? REVIEW_ASSETS[asset] : null;
  if(!entry) throw new AnalysisError('Artifact not found.',404);
  const root=await realpath(join(reviewRoot,id));
  const file=await realpath(join(root,entry.relative));
  const location=relative(root,file);
  if(location.startsWith('..') || isAbsolute(location)) throw new AnalysisError('Artifact not found.',404);
  const info=await stat(file);
  if(!info.isFile()) throw new AnalysisError('Artifact not found.',404);
  return {file,size:info.size,mime:entry.mime};
}

export async function listReviews():Promise<SavedReview[]> {
  let directories;
  try {directories=await readdir(reviewRoot,{withFileTypes:true});} catch {return [];}
  const entries=await Promise.all(directories.filter(d => d.isDirectory() && validRunId(d.name)).map(async d => {
    try{return await readReviewMeta(d.name);}catch{return null;}
  }));
  return entries.filter((m):m is SavedReview => m!==null).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,50);
}

export async function createReview(file:File,value:unknown,signal:AbortSignal):Promise<SavedReview> {
  const settings=validateReviewSettings(value);
  const extension=videoExtension(file);
  let release;
  try{release=acquireProcessingSlot();}catch(error){throw new AnalysisError((error as Error).message,409);}
  try {
    const status=await backendStatus();
    if(!status.methods[settings.method].ready) throw new AnalysisError(status.methods[settings.method].message,503);
    if(signal.aborted) throw new Error('Processing cancelled.');
    const id=randomUUID();
    const root=join(reviewRoot,id);
    await mkdir(root,{recursive:true});
    const input=join(root,`input${extension}`);
    const settingsPath=join(root,'request.json');
    await writeFile(input,Buffer.from(await file.arrayBuffer()),{flag:'wx'});
    await writeFile(settingsPath,JSON.stringify(settings),{flag:'wx'});
    const process=await runPython([join(projectRoot,'scripts','review_video.py'),'--input',input,'--settings',settingsPath,'--output-dir',join(root,'output')],600_000,signal);
    if(process.code!==0) throw new AnalysisError(process.stderr.trim().split('\n').at(-1) || 'Video processing failed.',422);
    const recordPath=join(root,'output','review.json');
    if((await stat(recordPath)).size>64*1024*1024) throw new Error('Review record exceeds the size limit.');
    const record=JSON.parse(await readFile(recordPath,'utf8')) as ReviewRecord;
    const meta:SavedReview={id,filename:file.name.slice(0,180),createdAt:new Date().toISOString(),extension:extension as '.mp4'|'.webm',method:settings.method,frames:record.frames.length,events:record.events.length};
    await publishReview(root,meta,signal);
    return meta;
  } finally {release();}
}
