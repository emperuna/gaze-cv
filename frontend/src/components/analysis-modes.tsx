"use client";

import { useState } from 'react';
import { Camera, ImageIcon, Video } from 'lucide-react';
import { AnalysisWorkspace } from './analysis-workspace';
import { CameraWorkspace } from './camera-workspace';

export function AnalysisModes() {
  const [mode,setMode]=useState<'image'|'video'|'camera'>('image');
  const [fileRunning,setFileRunning]=useState(false);
  return <>
    <div className="media-switch source-selector" role="group" aria-label="Analysis source">
      {([{id:'image',label:'Image',icon:ImageIcon},{id:'video',label:'Saved video',icon:Video},{id:'camera',label:'Camera',icon:Camera}] as const).map(({id,label,icon:Icon}) =>
        <button type="button" key={id} aria-pressed={mode===id} disabled={fileRunning} onClick={() => setMode(id)}><Icon size={16}/>{label}</button>)}
    </div>
    {mode==='camera' ? <CameraWorkspace/> : <AnalysisWorkspace key={mode} initialKind={mode} onRunningChange={setFileRunning}/>}
  </>;
}
