"use client";

import { useEffect,useState } from 'react';
import { Camera, ImageIcon, Video } from 'lucide-react';
import { AnalysisWorkspace } from './analysis-workspace';
import { CameraWorkspace } from './camera-workspace';
import { VideoWorkspace } from './video-workspace';

export function AnalysisModes() {
  const [mode,setMode]=useState<'image'|'video'|'camera'>('image');
  const [fileRunning,setFileRunning]=useState(false);
  useEffect(()=>{if(new URLSearchParams(window.location.search).has('session'))setMode('video');},[]);
  return <>
    <div className="media-switch source-selector" role="group" aria-label="Analysis source">
      {([{id:'image',label:'Image',icon:ImageIcon},{id:'video',label:'Saved video',icon:Video},{id:'camera',label:'Camera',icon:Camera}] as const).map(({id,label,icon:Icon}) =>
        <button type="button" key={id} aria-pressed={mode===id} disabled={fileRunning} onClick={() => setMode(id)}><Icon size={16}/>{label}</button>)}
    </div>
    {mode==='camera' ? <CameraWorkspace/> : mode==='video'?<VideoWorkspace onRunningChange={setFileRunning}/>:<AnalysisWorkspace initialKind="image" onRunningChange={setFileRunning}/>}
  </>;
}
