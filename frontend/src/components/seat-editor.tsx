"use client";

import { useRef,useState } from 'react';
import { Plus,Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import type { ReviewSeat } from '@/lib/review-contract';

export function SeatEditor({source,seats,onChange,disabled,onPlayable}:{source:string;seats:ReviewSeat[];onChange:(seats:ReviewSeat[])=>void;disabled:boolean;onPlayable:(ready:boolean)=>void}) {
  const video=useRef<HTMLVideoElement>(null);
  const start=useRef<[number,number]|null>(null);
  const [draft,setDraft]=useState<[number,number,number,number]|null>(null);
  const [duration,setDuration]=useState(0);
  const [position,setPosition]=useState(0);
  const [error,setError]=useState('');
  const [editing,setEditing]=useState<number|null>(null);
  const [drawing,setDrawing]=useState(true);
  function nextId(){let number=1;while(seats.some(s=>s.id===`seat-${number}`))number++;return `seat-${number}`;}
  function add(roi:ReviewSeat['roi'],replace:number|null=editing) {
    if(replace===null&&seats.length>=20){setError('Use at most 20 seats.');return;}
    if(seats.some((s,index)=>index!==replace&&Math.min(roi[2],s.roi[2])>Math.max(roi[0],s.roi[0]) && Math.min(roi[3],s.roi[3])>Math.max(roi[1],s.roi[1]))){setError('That region overlaps another seat. Draw separate head regions.');return;}
    onChange(replace===null?[...seats,{id:nextId(),roi}]:seats.map((seat,index)=>index===replace?{...seat,roi}:seat));setError('');setEditing(null);setDrawing(false);
  }
  function point(event:React.PointerEvent<SVGSVGElement>):[number,number] {
    const rect=event.currentTarget.getBoundingClientRect();
    return [Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))];
  }
  function rectangle(a:[number,number],b:[number,number]):ReviewSeat['roi'] {return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];}
  return <div className="seat-editor">
    <div className="review-video-stage">
      <video ref={video} src={source} muted playsInline preload="auto" onLoadedMetadata={event=>{
        const v=event.currentTarget;setDuration(v.duration);setPosition(0);
        if(!Number.isFinite(v.duration)||v.duration>300){setError('Choose a clip of at most 5 minutes.');onPlayable(false);}
      }} onLoadedData={event=>{
        if(Number.isFinite(event.currentTarget.duration)&&event.currentTarget.duration<=300){onPlayable(true);setError('');}
      }} onError={()=>{setError('This browser cannot play the video. Convert it to constant-frame-rate MP4 (H.264) or WebM.');onPlayable(false);}} aria-label="Seat setup video frame"/>
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" role="img" aria-label="Draw seat regions over the video; numeric controls are available below" className="seat-drawing"
        onPointerDown={event=>{if(disabled||!drawing)return;start.current=point(event);event.currentTarget.setPointerCapture(event.pointerId);setDraft(null);}}
        onPointerMove={event=>{if(start.current)setDraft(rectangle(start.current,point(event)));}}
        onPointerCancel={()=>{start.current=null;setDraft(null);}}
        onPointerUp={event=>{if(!start.current)return;const roi=rectangle(start.current,point(event));start.current=null;setDraft(null);if(roi[2]-roi[0]<.01||roi[3]-roi[1]<.01){setError('Draw a region with visible width and height.');return;}add(roi);}}>
        {seats.map((seat,index)=><g key={index}><rect className={editing===index?'seat-draft':''} x={seat.roi[0]*1000} y={seat.roi[1]*1000} width={(seat.roi[2]-seat.roi[0])*1000} height={(seat.roi[3]-seat.roi[1])*1000}/><text x={seat.roi[0]*1000+8} y={Math.max(36,seat.roi[1]*1000+36)}>{seat.id}</text></g>)}
        {draft&&<rect className="seat-draft" x={draft[0]*1000} y={draft[1]*1000} width={(draft[2]-draft[0])*1000} height={(draft[3]-draft[1])*1000}/>}
      </svg>
    </div>
    <label className="review-scrubber">Setup frame: {position.toFixed(1)} s<input aria-label="Seat setup frame time" type="range" min="0" max={Number.isFinite(duration)?Math.max(0,duration-.01):0} step="0.1" value={position} disabled={disabled} onChange={event=>{const time=Number(event.target.value);setPosition(time);if(video.current)video.current.currentTime=time;}}/></label>
    <p className="review-help" role="status">{drawing?(editing===null?'Drag a box around a missed seat’s head area.':`Draw a new box for ${seats[editing]?.id??'this seat'}.`):'Review the boxes. Use Edit region to redraw a seat, or Add seat for someone missed.'} Seats identify fixed positions, not people.</p>
    <Button variant="outline" type="button" disabled={disabled||seats.length>=20} onClick={()=>{setEditing(null);setDrawing(true);setError('');}}><Plus size={15}/>Add seat</Button>
    <fieldset disabled={disabled} className="seat-fields"><legend>{seats.length?`${seats.length} seat${seats.length===1?'':'s'} to review`:'No seats added yet'}</legend>
      {seats.map((seat,index)=><div className="simple-seat-row" key={index}>
        <label>Seat name {index+1}<input value={seat.id} maxLength={40} onChange={event=>onChange(seats.map((s,i)=>i===index?{...s,id:event.target.value}:s))}/></label>
        <button type="button" aria-label={`Edit region for ${seat.id}`} onClick={()=>{setEditing(index);setDrawing(true);setError('');}}>Edit region</button>
        <button type="button" aria-label={`Remove ${seat.id}`} onClick={()=>{onChange(seats.filter((_,i)=>i!==index));setEditing(null);setDrawing(false);}}><Trash2 size={16}/></button>
      </div>)}
    </fieldset>
    <details className="review-details advanced-seat-editing"><summary>Advanced seat editing</summary>
    <p className="review-help">Optional exact coordinates, in percentages of the video frame. Visual boxes above are enough for normal setup.</p>
    <Button variant="outline" type="button" disabled={disabled||seats.length>=20} onClick={()=>{
      for(let row=0;row<5;row++)for(let col=0;col<4;col++){
        const roi:ReviewSeat['roi']=[col*.25+.01,row*.2+.01,col*.25+.2,row*.2+.18];
        if(!seats.some(s=>Math.min(roi[2],s.roi[2])>Math.max(roi[0],s.roi[0])&&Math.min(roi[3],s.roi[3])>Math.max(roi[1],s.roi[1]))){add(roi,null);return;}
      }setError('No free preset region remains. Draw a smaller region in an empty area.');
    }}><Plus size={15}/>Add seat with numeric controls</Button>
    <fieldset disabled={disabled} className="seat-fields"><legend>Exact seat coordinates</legend>
      {seats.map((seat,index)=><div className="seat-field-row" key={index}>
        <strong>{seat.id}</strong>
        <div className="seat-coordinates">{['Left','Top','Right','Bottom'].map((label,coordinate)=><label key={label}>{label} %<input aria-label={`${seat.id} ${label.toLowerCase()} percent`} type="number" min="0" max="100" step="0.1" value={Number((seat.roi[coordinate]*100).toFixed(2))} onChange={event=>onChange(seats.map((s,i)=>i===index?{...s,roi:s.roi.map((v,c)=>c===coordinate?Number(event.target.value)/100:v) as ReviewSeat['roi']}:s))}/></label>)}</div>
      </div>)}
    </fieldset>
    </details>
    {error&&<p role="alert" className="analysis-error">{error}</p>}
  </div>;
}
