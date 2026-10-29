"use client";

import { useCallback,useEffect,useRef,useState } from 'react';
import { LoaderCircle,Play,Square } from 'lucide-react';
import { AnalysisWorkspace } from './analysis-workspace';
import { SeatEditor } from './seat-editor';
import { SessionPlayer } from './session-player';
import { Button } from './ui/button';
import { DEFAULT_MOVEMENT,mirrorSeats,validateReviewSettings } from '@/lib/review-contract';
import type { ReviewSettings,ReviewSeat,ReviewRecord,SavedReview,ReviewPreparation,TimingCheck } from '@/lib/review-contract';
import type { AnalysisMethod,BackendStatus } from '@/lib/analysis-contract';
import '@/app/analyze/saved-review.css';

export function VideoWorkspace({onRunningChange}:{onRunningChange:(running:boolean)=>void}) {
  const [mode,setMode]=useState<'review'|'quick'>('review');
  const [busy,setBusy]=useState(false);
  return <>
    <div className="review-mode-switch" role="group" aria-label="Video workflow"><button aria-pressed={mode==='review'} disabled={busy} onClick={()=>setMode('review')}>Seats & movement review</button><button aria-pressed={mode==='quick'} disabled={busy} onClick={()=>setMode('quick')}>Directions only</button></div>
    {mode==='quick'?<AnalysisWorkspace initialKind="video" onRunningChange={running=>{setBusy(running);onRunningChange(running);}}/>:<SavedReviewWorkspace onRunningChange={running=>{setBusy(running);onRunningChange(running);}}/>}
  </>;
}

function SavedReviewWorkspace({onRunningChange}:{onRunningChange:(running:boolean)=>void}) {
  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState<string|null>(null);
  const [seats,setSeats]=useState<ReviewSeat[]>([]);
  const [method,setMethod]=useState<AnalysisMethod>('head');
  const [mirrored,setMirrored]=useState(false);
  const [tileGrid,setTileGrid]=useState(1);
  const [movement,setMovement]=useState({...DEFAULT_MOVEMENT});
  const [timing,setTiming]=useState<TimingCheck|null>(null);
  const [preparing,setPreparing]=useState(false);
  const [suggestionNote,setSuggestionNote]=useState('');
  const [pendingSeats,setPendingSeats]=useState<ReviewSeat[]|null>(null);
  const [playable,setPlayable]=useState(false);
  const [status,setStatus]=useState<BackendStatus|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [sessions,setSessions]=useState<SavedReview[]>([]);
  const [meta,setMeta]=useState<SavedReview|null>(null);
  const [record,setRecord]=useState<ReviewRecord|null>(null);
  const [loading,setLoading]=useState(false);
  const active=useRef(true);
  const request=useRef<AbortController|null>(null);
  const loadNumber=useRef(0);
  const setupNumber=useRef(0);
  const busyCallback=useRef(onRunningChange);busyCallback.current=onRunningChange;
  useEffect(()=>{busyCallback.current(busy||preparing);},[busy,preparing]);

  const refresh=useCallback(async()=>{
    try{const response=await fetch('/api/review',{cache:'no-store'});if(!response.ok)throw new Error('Could not read saved sessions.');const list=await response.json();if(active.current)setSessions(list);}
    catch(error){if(active.current)setError((error as Error).message);}
  },[]);
  const openSession=useCallback(async(id:string,list?:SavedReview[])=>{
    const current=++loadNumber.current;setLoading(true);setError('');
    try {
      let found=(list??sessions).find(s=>s.id===id);
      if(!found){const metadata=await fetch(`/api/review/${encodeURIComponent(id)}`,{cache:'no-store'});if(!metadata.ok)throw new Error('Saved session is unavailable. Its files may have been moved or removed.');found=await metadata.json() as SavedReview;}
      const response=await fetch(`/api/review/${id}/review.json`,{cache:'no-store'});
      if(!response.ok)throw new Error('Could not reopen this session. Its files may have been moved or removed.');
      const result=await response.json() as ReviewRecord;
      if(result.schema_version!==1||!Array.isArray(result.frames)||!result.frames.length)throw new Error('The saved review record is invalid.');
      if(active.current&&current===loadNumber.current){setMeta(found);setRecord(result);window.history.replaceState(null,'',`?session=${id}`);}
    }catch(error){if(active.current&&current===loadNumber.current)setError((error as Error).message);}
    finally{if(active.current&&current===loadNumber.current)setLoading(false);}
  },[sessions]);

  useEffect(()=>{
    active.current=true;
    void fetch('/api/analyze',{cache:'no-store'}).then(r=>r.json()).then(data=>{if(active.current)setStatus(data);}).catch(()=>{if(active.current)setError('Could not check the local Python processor.');});
    void fetch('/api/review',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Could not read saved sessions.');return r.json();}).then(list=>{
      if(!active.current)return;setSessions(list);
      const id=new URLSearchParams(window.location.search).get('session');if(id)void openSession(id,list);
    }).catch(error=>{if(active.current)setError((error as Error).message);});
    return()=>{active.current=false;request.current?.abort();loadNumber.current++;setupNumber.current++;busyCallback.current(false);};
    // Initial URL restoration runs once; manual reopening uses the current list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{if(!file){setPreview(null);return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);

  let settings:ReviewSettings|null=null;let validation='';
  try{settings=validateReviewSettings({method,mirrored,tileGrid,seats:mirrored?mirrorSeats(seats):seats,movement});}catch(error){validation=(error as Error).message;}
  async function prepare(selected:File,suggest:boolean) {
    request.current?.abort();const controller=new AbortController();request.current=controller;
    const revision=++setupNumber.current;setPreparing(true);setError('');setPendingSeats(null);
    try {
      const form=new FormData();form.set('file',selected);form.set('settings',JSON.stringify({method,mirrored,tileGrid,suggest}));
      const response=await fetch('/api/review/prepare',{method:'POST',body:form,signal:controller.signal});
      const result=await response.json() as ReviewPreparation&{error?:string};
      if(!response.ok)throw new Error(result.error||'Video setup failed.');
      if(!active.current||controller.signal.aborted||revision!==setupNumber.current)return;
      setTiming(result.timing);
      if(suggest){setSuggestionNote(result.note??'Review all suggested boxes.');
        if(result.seats?.length){if(seats.length)setPendingSeats(result.seats);else setSeats(result.seats);}}
    }catch(error){if(active.current&&revision===setupNumber.current)setError(controller.signal.aborted?'Video setup stopped.':(error as Error).message);}
    finally{if(request.current===controller)request.current=null;if(active.current&&revision===setupNumber.current)setPreparing(false);}
  }

  async function process() {
    if(!file||!settings||busy||preparing||!timing?.verified||!playable)return;
    const controller=new AbortController();request.current=controller;
    setBusy(true);setError('');loadNumber.current++;setRecord(null);setMeta(null);
    try {
      const form=new FormData();form.set('file',file);form.set('settings',JSON.stringify(settings));
      const response=await fetch('/api/review',{method:'POST',body:form,signal:controller.signal});
      const saved=await response.json();if(!response.ok)throw new Error(saved.error||'Video processing failed.');
      if(!active.current||controller.signal.aborted)return;
      await openSession(saved.id,[saved]);await refresh();
    }catch(error){if(active.current)setError(controller.signal.aborted?'Processing stopped. Incomplete files remain local but are not listed as completed sessions.':(error as Error).message);}
    finally{if(request.current===controller)request.current=null;if(active.current)setBusy(false);}
  }

  return <div className="saved-video-workspace">
    <section className="review-library" aria-label="Saved sessions"><label>Reopen a saved session<select aria-label="Saved session" value={meta?.id??''} disabled={busy||preparing||loading} onChange={event=>{if(event.target.value)void openSession(event.target.value);}}><option value="">Choose a completed session</option>{meta&&!sessions.some(s=>s.id===meta.id)&&<option value={meta.id}>{meta.filename} · opened by link</option>}{sessions.map(session=><option key={session.id} value={session.id}>{session.filename} · {new Date(session.createdAt).toLocaleString()} · {session.events} events</option>)}</select></label><button type="button" disabled={busy||preparing||loading} onClick={()=>void refresh()}>Refresh sessions</button><p>The latest 50 sessions are listed. Bookmark the session URL to reopen an older one. Files remain on this computer until you remove their local run folders.</p></section>
    <div className="review-layout">
      <section className="workspace-card review-setup"><div className="workspace-card-header"><h2>Set up a video review</h2></div><div className="input-card-body">
        <label className="review-upload">Saved video<input type="file" accept=".mp4,.webm" disabled={busy||preparing} onChange={event=>{
          const selected=event.target.files?.[0];if(!selected)return;
          if(!/\.(mp4|webm)$/i.test(selected.name)||selected.size<=0||selected.size>64*1024*1024){setError('Choose a nonempty MP4/WebM of at most 64 MB.');event.target.value='';return;}
          loadNumber.current++;setFile(selected);setSeats([]);setPlayable(false);setTiming(null);setSuggestionNote('');setPendingSeats(null);setRecord(null);setMeta(null);setError('');window.history.replaceState(null,'',window.location.pathname);void prepare(selected,false);
        }}/></label>
        <p className="review-help">Upload an authorized clip from one fixed camera, up to 64 MB and 5 minutes. Original video and results will be saved on this computer.</p>
        {file&&<p role="status" className="review-timing-status">{preparing?'Checking footage…':timing?.verified?'Video timing checked. Ready to set up seats.':'Video timing needs checking before processing.'}</p>}
        {file&&!timing&&!preparing&&<button className="review-secondary-action" onClick={()=>void prepare(file,false)}>Check video again</button>}
        {preview&&<><div className="seat-suggestion-controls"><Button variant="outline" disabled={busy||preparing||!playable||!status?.methods[method]?.ready} onClick={()=>file&&void prepare(file,true)}>{preparing?<LoaderCircle size={15} className="spin"/>:null}Suggest seats</Button><p>We look for heads across several frames. Check every suggested box and add anyone missed.</p></div>
          {suggestionNote&&<p className="review-help" role="status">{suggestionNote}</p>}
          {pendingSeats&&<div className="seat-replacement"><p>Found {pendingSeats.length} suggested seats. Your current boxes are unchanged.</p><button disabled={busy||preparing} onClick={()=>{setSeats(pendingSeats);setPendingSeats(null);}}>Replace current seats</button><button disabled={busy||preparing} onClick={()=>setPendingSeats(null)}>Keep my seats</button></div>}
          <SeatEditor key={preview} source={preview} seats={seats} onChange={next=>{setSeats(next);setPendingSeats(null);}} disabled={busy||preparing} onPlayable={setPlayable}/></>}
        <div className="review-rule-summary"><strong>Movement rules</strong><p>Records movements held for {movement.min_duration} seconds, or {movement.repetition_count} qualifying turns within {movement.repetition_window} seconds. Missing observations reset continuity. These records support human review.</p><span>{status?.methods[method]?.ready?`Using ${method==='head'?'the automatic head model':'the reference method'}.`:status?.methods[method]?.message??'Checking the local processor…'}</span></div>
        <details className="review-details advanced-review-settings"><summary>Advanced settings</summary>
        <fieldset disabled={busy||preparing} className="review-settings"><legend>Customize analysis (optional)</legend>
          <label>Analysis method<select value={method} onChange={event=>setMethod(event.target.value as AnalysisMethod)}><option value="head">Automatic head model</option><option value="baseline">Geometric baseline</option></select></label>
          <p className="review-help">{status?.methods[method]?.message??'Checking the local processor…'} Direction labels are camera-relative, not calibrated to a desk.</p>
          <label className="review-checkbox"><input type="checkbox" checked={mirrored} onChange={event=>setMirrored(event.target.checked)}/>Source pixels are already mirrored</label>
          {method==='baseline'&&<label>Detector tiling<select value={tileGrid} onChange={event=>setTileGrid(Number(event.target.value))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n===1?'1 — full frame':`${n} — more tiles, slower`}</option>)}</select></label>}
          <div className="review-setting-grid">{([{key:'min_duration',label:'Sustained duration (s)',max:300,step:.25},{key:'repetition_count',label:'Repetition count',max:100,step:1},{key:'repetition_window',label:'Repetition window (s)',max:300,step:.25},{key:'repeat_min_duration',label:'Minimum dwell (s)',max:300,step:.05},{key:'max_gap',label:'Maximum gap (s)',max:5,step:.05}] as const).map(({key,label,max,step})=><label key={key}>{label}<input type="number" min={key==='repetition_count'?2:step} max={max} step={step} value={movement[key]} onChange={event=>setMovement({...movement,[key]:Number(event.target.value)})}/></label>)}</div>
          <p className="review-help">Defaults are experimental movement rules, not validated indicators of misconduct. Changes apply to new sessions; saved sessions retain their original settings.</p>
        </fieldset>
        </details>
        {file&&validation&&<p className="review-validation" role="status">{validation}</p>}
        <p className="review-help">Confirm the boxes cover the correct fixed seats before processing. Add or edit any missed regions.</p>
        <div className="camera-actions"><Button disabled={busy||preparing||!file||!settings||!timing?.verified||!playable||!status?.methods[method]?.ready} onClick={()=>void process()}>{busy?<LoaderCircle size={16} className="spin"/>:<Play size={16}/>}Confirm seats & process</Button><Button variant="outline" disabled={!busy&&!preparing} onClick={()=>request.current?.abort()}><Square size={15}/>Stop</Button></div>
        {busy&&<p role="status" className="review-help">Processing locally. Keep this page open; model loading and longer clips take time. No percentage is estimated.</p>}
        {error&&<p className="analysis-error" role="alert">{error}</p>}
      </div></section>
      <div className="review-results" aria-busy={busy||loading}>{record&&meta?<SessionPlayer key={meta.id} meta={meta} record={record}/>:<section className="workspace-card review-waiting"><h2>{loading?'Opening saved records…':busy?'Building this session’s review…':'Review directions over time'}</h2><p>Upload a clip and define fixed seats. After processing, play the annotated source, inspect explicit observation gaps, and select movement events to jump to their source time.</p><p>Completed sessions reopen from the list above without running inference again.</p></section>}</div>
    </div>
  </div>;
}
