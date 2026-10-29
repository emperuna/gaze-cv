import type { AnalysisMethod, Detection, Direction } from './analysis-contract.ts';

export interface ReviewSeat { id:string; roi:[number,number,number,number] }
export const DEFAULT_MOVEMENT={min_duration:2,repetition_count:3,repetition_window:10,repeat_min_duration:.25,max_gap:.25};
export interface ReviewSettings {method:AnalysisMethod;mirrored:boolean;tileGrid:number;seats:ReviewSeat[];movement:typeof DEFAULT_MOVEMENT}
export interface SeatState {direction:Direction;reason:string|null;estimation_source:string|null}
export interface MovementEvent {seat_id:string;event_type:string;direction:Direction;start_time:number;end_time:number;duration:number;observed_at:number;review_required:boolean;review_label:string|null;repetition_count?:number}
export interface ReviewFrame {frame_index:number;time:number;detections:Detection[];seats:Record<string,SeatState>;review_flags:MovementEvent[]}
export interface HistorySegment {start:number;end:number;direction:Direction;valid:boolean;reason:string|null}
export interface ReviewRecord {
  schema_version:1;source:{width:number;height:number;fps:number;processed_duration_seconds:number;timebase:string};
  source_sha256:string;settings:ReviewSettings;pipeline:Record<string,unknown>;
  timing:{processing_fps:number|null;scope:string};direction_counts:Record<string,number>;
  frames:ReviewFrame[];events:MovementEvent[];histories:Record<string,HistorySegment[]>;limitations:string[];
  timing_check?:TimingCheck;
}
export interface TimingCheck {verified:true;fps:number;frames:number;max_deviation_ms:number;tolerance_ms:number;method:string}
export interface ReviewPreparation {timing:TimingCheck;seats?:ReviewSeat[];sampled_frames?:number;note?:string}
export interface SavedReview {id:string;filename:string;createdAt:string;extension:'.mp4'|'.webm';method:AnalysisMethod;frames:number;events:number}

export function validateReviewSettings(value:unknown):ReviewSettings {
  if (!value || typeof value!=='object') throw new Error('Session settings are required.');
  const settings=value as ReviewSettings;
  if (!['head','baseline'].includes(settings.method) || typeof settings.mirrored!=='boolean' || !Number.isInteger(settings.tileGrid) || settings.tileGrid<1 || settings.tileGrid>4) throw new Error('Invalid analysis method, mirroring, or tiling.');
  if (!Array.isArray(settings.seats) || !settings.seats.length || settings.seats.length>20) throw new Error('Define between 1 and 20 seats.');
  const ids=new Set();
  for (let index=0;index<settings.seats.length;index++) {
    const seat=settings.seats[index];
    if (!seat || typeof seat.id!=='string' || !seat.id.trim() || seat.id.length>40 || ids.has(seat.id)) throw new Error('Seat names must be unique and contain 1–40 characters.');
    ids.add(seat.id);
    const r=seat.roi;
    if (!Array.isArray(r) || r.length!==4 || r.some(v => typeof v!=='number' || !Number.isFinite(v)) || !(0<=r[0] && r[0]<r[2] && r[2]<=1 && 0<=r[1] && r[1]<r[3] && r[3]<=1)) throw new Error('Seat regions need positive width/height inside the frame.');
    for(const prior of settings.seats.slice(0,index)) if (Math.min(r[2],prior.roi[2])>Math.max(r[0],prior.roi[0]) && Math.min(r[3],prior.roi[3])>Math.max(r[1],prior.roi[1])) throw new Error('Seat regions must not overlap.');
  }
  const m=settings.movement;
  if (!m || typeof m!=='object') throw new Error('Movement settings are required.');
  for(const [key,max] of [['min_duration',300],['repetition_window',300],['repeat_min_duration',300],['max_gap',5]] as const) if (typeof m[key]!=='number' || !Number.isFinite(m[key]) || m[key]<=0 || m[key]>max) throw new Error(`${key.replaceAll('_',' ')} must be positive and at most ${max} seconds.`);
  if (!Number.isInteger(m.repetition_count) || m.repetition_count<2 || m.repetition_count>100 || m.repeat_min_duration>m.repetition_window) throw new Error('Use 2–100 repetitions and a minimum dwell within the repetition window.');
  return {method:settings.method,mirrored:settings.mirrored,tileGrid:settings.tileGrid,
    seats:settings.seats.map(s => ({id:s.id,roi:[...s.roi]})),movement:{...m}};
}

export function mirrorSeats(seats:ReviewSeat[]):ReviewSeat[] {
  return seats.map(s => ({id:s.id,roi:[1-s.roi[2],s.roi[1],1-s.roi[0],s.roi[3]]}));
}

export function frameAtTime<T>(frames:T[],fps:number,time:number,duration:number):T|null {
  if (!Number.isFinite(time) || time<0 || time>=duration || !Number.isFinite(fps) || fps<=0) return null;
  return frames[Math.floor(time*fps+1e-7)] ?? null;
}

export function timeLabel(seconds:number) {
  return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toFixed(2).padStart(5,'0')}`;
}
