"use client";

import { useEffect,useRef,useState } from 'react';
import { frameAtTime,mirrorSeats,timeLabel } from '@/lib/review-contract';
import type { ReviewRecord,SavedReview,ReviewFrame } from '@/lib/review-contract';

const ASSETS=['settings.json','events.json','seat_history.json','summary.json','observations.jsonl','review.json','annotated.avi'];

export function SessionPlayer({meta,record}:{meta:SavedReview;record:ReviewRecord}) {
  const video=useRef<HTMLVideoElement>(null);
  const canvas=useRef<HTMLCanvasElement>(null);
  const [time,setTime]=useState(0);
  const [error,setError]=useState('');
  const [seatFilter,setSeatFilter]=useState('all');
  const [eventFilter,setEventFilter]=useState('all');
  const [page,setPage]=useState(0);
  const [historySeat,setHistorySeat]=useState(record.settings.seats[0].id);
  const [historyPage,setHistoryPage]=useState(0);
  const base=`/api/review/${meta.id}`;
  const frame=frameAtTime(record.frames,record.source.fps,time,record.source.processed_duration_seconds);
  const visibleEvents=record.events.filter(e=>(seatFilter==='all'||e.seat_id===seatFilter)&&(eventFilter==='all'||e.event_type===eventFilter));
  const histories=record.histories[historySeat]??[];
  function seek(seconds:number){if(video.current){video.current.pause();video.current.currentTime=seconds;setTime(seconds);}}

  useEffect(()=>{
    const source=video.current;const target=canvas.current;if(!source||!target)return;
    let handle:number|undefined;let last=-1;
    const seats=record.settings.mirrored?mirrorSeats(record.settings.seats):record.settings.seats;
    function draw(at:number,force=false) {
      if(!source||!target)return;
      const context=target.getContext('2d');if(!context)return;
      target.width=record.source.width;target.height=record.source.height;
      context.clearRect(0,0,target.width,target.height);
      const matched=frameAtTime(record.frames,record.source.fps,at,record.source.processed_duration_seconds);
      if(source.videoWidth!==record.source.width||source.videoHeight!==record.source.height)return;
      if(force||Math.abs(at-last)>=.1){setTime(at);last=at;}
      if(!matched)return;
      const scale=Math.max(1,record.source.width/800);
      context.font=`${Math.round(15*scale)}px Arial`;context.lineWidth=2*scale;
      function label(text:string,x:number,y:number,color:string){
        if(!context)return;
        context.fillStyle='#17291f';context.fillRect(x,Math.max(0,y),Math.min(context.measureText(text).width+12*scale,target!.width-x),24*scale);
        context.fillStyle=color;context.fillText(text,x+5*scale,Math.max(0,y)+17*scale);
      }
      for(const detection of matched.detections){const [x,y,w,h]=detection.bbox;context.strokeStyle='#b5dfbd';context.strokeRect(x,y,w,h);}
      for(const seat of seats){
        const state=matched.seats[seat.id];const [left,top,right,bottom]=seat.roi;
        const x=left*target.width,y=top*target.height;
        context.strokeStyle=state?.direction==='unknown'?'#f0cb68':'#8fe3a1';
        context.strokeRect(x,y,(right-left)*target.width,(bottom-top)*target.height);
        label(`${seat.id}: ${state?.direction??'unknown'}`,x,y,context.strokeStyle);
      }
      matched.review_flags.forEach((flag,index)=>label(`${flag.seat_id}: For instructor review`,8*scale,(32+index*28)*scale,'#f0cb68'));
    }
    const paint=()=>draw(source.currentTime,true);
    const onFrame=(_now:number,metadata:VideoFrameCallbackMetadata)=>{draw(metadata.mediaTime);handle=source.requestVideoFrameCallback(onFrame);};
    source.addEventListener('seeked',paint);source.addEventListener('loadeddata',paint);source.addEventListener('timeupdate',paint);source.addEventListener('ended',paint);
    if(source.requestVideoFrameCallback)handle=source.requestVideoFrameCallback(onFrame);
    paint();
    return()=>{if(handle!==undefined)source.cancelVideoFrameCallback(handle);source.removeEventListener('seeked',paint);source.removeEventListener('loadeddata',paint);source.removeEventListener('timeupdate',paint);source.removeEventListener('ended',paint);};
  },[record]);

  return <section className="session-review" aria-label="Saved session review">
    <div className="review-heading"><div><h2>Review this session</h2><p>{meta.filename}</p></div><span className="review-saved">Saved on this computer</span></div>
    <div className="review-video-stage"><video ref={video} src={`${base}/source`} controls playsInline preload="metadata" onError={()=>setError('This browser cannot play the saved source. Download the records/AVI, or convert a copy to constant-frame-rate H.264 MP4 or WebM for a new session.')} aria-label="Saved session video"/><canvas ref={canvas} aria-label="Synchronized seat and direction annotations"/></div>
    {error&&<p role="alert" className="analysis-error">{error}</p>}
    <p className="review-help">Source time {timeLabel(time)} · {frame?`Frame ${frame.frame_index}`:'Outside processed coverage — no annotations'} · {record.frames.length} processed frames · {record.timing.processing_fps===null?'Speed not measured':`${record.timing.processing_fps.toFixed(1)} processing FPS`}</p>
    <div className="review-seat-status" aria-label="Seat observations at the current time">{record.settings.seats.map(seat=><div key={seat.id}><strong>{seat.id}</strong><span>{frame?.seats[seat.id]?.direction??'unavailable'}</span><small>{frame?.seats[seat.id]?.reason?.replaceAll('_',' ')}</small></div>)}</div>
    <div className="review-section-heading"><h3>Movement events</h3><span>{visibleEvents.length} matching events</span></div>
    <div className="review-filters"><label>Filter events by seat<select value={seatFilter} onChange={event=>{setSeatFilter(event.target.value);setPage(0);}}><option value="all">All seats</option>{record.settings.seats.map(seat=><option key={seat.id}>{seat.id}</option>)}</select></label><label>Event type<select value={eventFilter} onChange={event=>{setEventFilter(event.target.value);setPage(0);}}><option value="all">All movement events</option><option value="sustained_movement">Sustained</option><option value="repeated_movement">Repeated</option></select></label></div>
    {!visibleEvents.length?<p className="review-empty">No movement events match these settings and observations. This does not establish that no relevant movements occurred.</p>:<div className="review-table-wrap"><table className="review-table"><caption>Select a time to pause and seek to the event start. Observed at is when the movement rule first triggered.</caption><thead><tr><th>Start–end</th><th>Seat</th><th>Movement</th><th>Observed at</th><th>Review</th></tr></thead><tbody>{visibleEvents.slice(page*50,page*50+50).map((event,index)=><tr key={index}><td><button type="button" onClick={()=>seek(event.start_time)} aria-label={`Seek ${event.seat_id} ${event.direction} event at ${timeLabel(event.start_time)}`}>{timeLabel(event.start_time)}–{timeLabel(event.end_time)}</button></td><td>{event.seat_id}</td><td>{event.event_type==='sustained_movement'?'Sustained':'Repeated'} {event.direction}{event.repetition_count?` (${event.repetition_count} entries)`:''}</td><td>{timeLabel(event.observed_at)}</td><td>{event.review_required?'For instructor review':'Movement record'}</td></tr>)}</tbody></table></div>}
    {visibleEvents.length>50&&<div className="review-pagination"><button disabled={page===0} onClick={()=>setPage(page-1)}>Previous events</button><span>Page {page+1} of {Math.ceil(visibleEvents.length/50)}</span><button disabled={(page+1)*50>=visibleEvents.length} onClick={()=>setPage(page+1)}>Next events</button></div>}
    <details className="review-details"><summary>Per-seat direction history</summary><label>History seat<select value={historySeat} onChange={event=>{setHistorySeat(event.target.value);setHistoryPage(0);}}>{record.settings.seats.map(seat=><option key={seat.id}>{seat.id}</option>)}</select></label><div className="review-table-wrap"><table className="review-table"><caption>Observed intervals only. Missing/ambiguous observations reset continuity.</caption><thead><tr><th>Start–end</th><th>Direction</th><th>Observation</th></tr></thead><tbody>{histories.slice(historyPage*50,historyPage*50+50).map((segment,index)=><tr key={index}><td><button onClick={()=>seek(segment.start)}>{timeLabel(segment.start)}–{timeLabel(segment.end)}</button></td><td>{segment.direction}</td><td>{segment.valid?'Observed':segment.reason?.replaceAll('_',' ')||'Unknown'}</td></tr>)}</tbody></table></div>{histories.length>50&&<div className="review-pagination"><button disabled={historyPage===0} onClick={()=>setHistoryPage(historyPage-1)}>Previous intervals</button><span>Page {historyPage+1}</span><button disabled={(historyPage+1)*50>=histories.length} onClick={()=>setHistoryPage(historyPage+1)}>Next intervals</button></div>}</details>
    <details className="review-details"><summary>Session settings and provenance</summary><dl><dt>Method</dt><dd>{record.settings.method==='head'?'Automatic head model — camera-relative':'Geometric baseline'}</dd><dt>Source SHA256</dt><dd className="review-hash">{record.source_sha256}</dd><dt>Timebase</dt><dd>{record.source.timebase}</dd><dt>Duration threshold</dt><dd>{record.settings.movement.min_duration} seconds</dd><dt>Repetition rule</dt><dd>{record.settings.movement.repetition_count} entries in {record.settings.movement.repetition_window} seconds; minimum dwell {record.settings.movement.repeat_min_duration} seconds</dd><dt>Maximum observation gap</dt><dd>{record.settings.movement.max_gap} seconds</dd><dt>Mirrored source pixels</dt><dd>{record.settings.mirrored?'Yes':'No'}</dd><dt>Timing scope</dt><dd>{record.timing.scope}</dd></dl></details>
    <details className="review-details"><summary>Download session records</summary><p>The saved source and records remain local. Reopen this session from the saved-session list without running inference again.</p><div className="review-downloads">{ASSETS.map(asset=><a key={asset} href={`${base}/${asset}?download=1`} download>{asset}</a>)}</div></details>
    <p className="review-help">Head movements support instructor review, not misconduct decisions. Seat consistency, real event accuracy, and classroom performance still require independently labeled validation. Regions do not calibrate head direction relative to a desk.</p>
  </section>;
}
