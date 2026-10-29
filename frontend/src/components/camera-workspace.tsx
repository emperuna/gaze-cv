"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, LoaderCircle, Play, RefreshCw, Square } from 'lucide-react';
import { Button } from './ui/button';
import { DIRECTIONS } from '@/lib/analysis-contract';
import type { AnalysisMethod, BackendStatus } from '@/lib/analysis-contract';
import type { CameraResult } from '@/lib/camera-contract';
import { cameraFrameSize, runCameraFrames } from '@/lib/camera-client';

type Run={active:boolean;controller:AbortController;stream?:MediaStream;sessionId?:string};
type Phase='idle'|'permission'|'loading'|'live'|'stopping';

async function stopSession(id:string) {
  await fetch(`/api/camera/${id}`,{method:'DELETE',keepalive:true,signal:AbortSignal.timeout(5000)}).catch(() => {});
}

function cameraError(error:unknown) {
  if (error instanceof DOMException) {
    if (error.name==='NotAllowedError') return 'Camera access was denied. Allow the camera in your browser and system settings, then try again.';
    if (error.name==='NotFoundError') return 'No camera was found. Connect a camera, then try again.';
    if (error.name==='NotReadableError') return 'The camera could not open. Close other apps using it, then try again.';
    if (error.name==='OverconstrainedError') return 'The selected camera is unavailable. Choose another camera and try again.';
  }
  return error instanceof Error ? error.message : 'Camera analysis failed. Stop and try again.';
}

export function CameraWorkspace() {
  const [method,setMethod]=useState<AnalysisMethod>('head');
  const [mirrored,setMirrored]=useState(false);
  const [tileGrid,setTileGrid]=useState(1);
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
  const [device,setDevice]=useState('');
  const [phase,setPhase]=useState<Phase>('idle');
  const [status,setStatus]=useState<BackendStatus|null>(null);
  const [checking,setChecking]=useState(true);
  const [error,setError]=useState('');
  const [latest,setLatest]=useState<CameraResult|null>(null);
  const [fps,setFps]=useState(0);
  const video=useRef<HTMLVideoElement>(null);
  const output=useRef<HTMLCanvasElement>(null);
  const run=useRef<Run|null>(null);
  const mounted=useRef(true);
  const busy=phase!=='idle';
  const ready=!!status?.methods[method].ready && !checking;

  const check=useCallback(async () => {
    setChecking(true);
    try {
      const response=await fetch('/api/analyze',{cache:'no-store'});
      const data=await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not check the local processor.');
      if (mounted.current) {setStatus(data);setError('');}
    } catch (error) {if (mounted.current) {setStatus(null);setError(cameraError(error));}}
    finally {if (mounted.current) setChecking(false);}
  },[]);

  const stop=useCallback(async () => {
    const current=run.current;
    if (!current) return;
    run.current=null; current.active=false; current.controller.abort();
    current.stream?.getTracks().forEach(track => track.stop());
    if (video.current) video.current.srcObject=null;
    if (mounted.current) setPhase('stopping');
    if (current.sessionId) await stopSession(current.sessionId);
    if (mounted.current && !run.current) setPhase('idle');
  },[]);

  useEffect(() => {
    mounted.current=true; void check();
    const updateDevices=() => {void navigator.mediaDevices?.enumerateDevices().then(list => {
      if (mounted.current) setDevices(list.filter(item => item.kind==='videoinput'));
    }).catch(() => {});};
    updateDevices();
    const hide=() => {if (document.hidden) void stop();};
    const leave=() => {void stop();};
    document.addEventListener('visibilitychange',hide);
    window.addEventListener('pagehide',leave);
    navigator.mediaDevices?.addEventListener('devicechange',updateDevices);
    return () => {
      mounted.current=false; void stop();
      document.removeEventListener('visibilitychange',hide);
      window.removeEventListener('pagehide',leave);
      navigator.mediaDevices?.removeEventListener('devicechange',updateDevices);
    };
  },[check,stop]);

  async function start() {
    if (run.current || !ready) return;
    setError('');setLatest(null);setFps(0);setPhase('permission');
    const current:Run={active:true,controller:new AbortController()};
    run.current=current;
    const valid=() => mounted.current && current.active && run.current===current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable. Open GAZE at http://127.0.0.1:3000 in a browser with camera support.');
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:1280},height:{ideal:720},...(device ? {deviceId:{exact:device}} : {})}});
      if (!valid()) {stream.getTracks().forEach(track => track.stop());return;}
      current.stream=stream;
      stream.getVideoTracks().forEach(track => track.addEventListener('ended',() => {
        if (valid()) {setError('The camera disconnected. Reconnect it and start again.');void stop();}
      },{once:true}));
      if (!video.current) throw new Error('Camera preview could not open. Try again.');
      video.current.srcObject=stream;
      await video.current.play();
      if (!valid()) return;
      void navigator.mediaDevices.enumerateDevices().then(list => {if (valid()) setDevices(list.filter(item => item.kind==='videoinput'));}).catch(() => {});
      setPhase('loading');
      const response=await fetch('/api/camera',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({method,mirrored,tileGrid}),signal:AbortSignal.any([current.controller.signal,AbortSignal.timeout(65_000)])});
      const data=await response.json();
      if (!response.ok) throw new Error(data.error || 'Camera processor could not start.');
      current.sessionId=data.sessionId;
      if (!valid()) {await stopSession(data.sessionId);return;}
      setPhase('live');
      const capture=document.createElement('canvas');
      const context=capture.getContext('2d');
      const draw=output.current?.getContext('2d');
      if (!context || !draw || !output.current) throw new Error('Camera drawing is unavailable in this browser.');
      const target=output.current;
      const started=performance.now(); let count=0;
      await runCameraFrames({signal:current.controller.signal,
        capture:() => {
          const source=video.current!;
          const size=cameraFrameSize(source.videoWidth,source.videoHeight);
          capture.width=size.width;capture.height=size.height;
          context.drawImage(source,0,0,size.width,size.height);
          return {id:++count,timestamp_seconds:(performance.now()-started)/1000,image:capture.toDataURL('image/jpeg',.8).split(',')[1]};
        },
        process:async frame => {
          const response=await fetch(`/api/camera/${current.sessionId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(frame),signal:current.controller.signal});
          const result=await response.json();
          if (!response.ok) throw new Error(result.error || 'Camera frame could not be processed.');
          return result as CameraResult;
        },
        display:(frame,result) => {
          if (!valid()) return;
          if (result.id!==frame.id || result.timestamp_seconds!==frame.timestamp_seconds || result.result.width!==capture.width || result.result.height!==capture.height) throw new Error('Camera result did not match its captured frame. Start again.');
          target.width=capture.width;target.height=capture.height;draw.drawImage(capture,0,0);
          draw.font='16px Arial';draw.lineWidth=2;
          for (const detection of result.result.detections) {
            const [x,y,w,h]=detection.bbox;
            draw.strokeStyle=detection.direction==='unknown' ? '#e8c76a' : '#8fe3a1';
            draw.strokeRect(x,y,w,h);
            const label=detection.direction;
            const labelY=Math.max(20,y);
            draw.fillStyle='#17291f';draw.fillRect(x,labelY-20,draw.measureText(label).width+12,23);
            draw.fillStyle='#ffffff';draw.fillText(label,x+6,labelY-3);
          }
          setLatest(result);setFps(count/((performance.now()-started)/1000));
        },
      });
    } catch (error) {
      if (valid()) {await stop(); if (mounted.current) setError(cameraError(error));}
    }
  }

  const phaseLabel=phase==='permission' ? 'Waiting for camera permission…' : phase==='loading' ? 'Loading the local model…' : phase==='live' ? 'Camera analysis running' : phase==='stopping' ? 'Stopping camera…' : 'Camera stopped';
  return <>
    <div className={`backend-banner${ready ? ' backend-ready' : ''}`} role="status"><Camera size={20}/><div><strong>{checking ? 'Checking the local processor' : ready ? 'Local processor available' : 'Python setup needed'}</strong><p>{status?.methods[method].message || 'Use the project README to prepare Python and the models.'}</p></div><button type="button" onClick={check} disabled={busy || checking} aria-label="Recheck local processor"><RefreshCw size={15}/><span>Recheck</span></button></div>
    <div className="analysis-grid camera-grid">
      <section className="workspace-card"><div className="workspace-card-header"><h2>Camera input</h2><span>LOCAL CAMERA</span></div><div className="input-card-body">
        <div className="camera-preview"><video ref={video} muted playsInline aria-label="Live camera preview"/>{phase==='idle' && <div className="camera-placeholder"><Camera size={32}/><p>Start to open your camera.</p></div>}</div>
        <div className="analysis-settings"><label htmlFor="camera-device">Camera</label><div className="select-wrap"><select id="camera-device" value={device} disabled={busy} onChange={event => setDevice(event.target.value)}><option value="">Default camera</option>{devices.filter(item => item.deviceId).map((item,index) => <option key={item.deviceId} value={item.deviceId}>{item.label || `Camera ${index+1}`}</option>)}</select></div></div>
        <div className="analysis-settings"><label htmlFor="camera-method">Analysis method</label><div className="select-wrap"><select id="camera-method" value={method} disabled={busy} onChange={event => {setMethod(event.target.value as AnalysisMethod);setLatest(null);}}><option value="head">Automatic head model</option><option value="baseline">Geometric baseline</option></select></div><p>Left and right describe the subject. The preview uses the camera’s original orientation.</p></div>
        <details className="advanced-settings"><summary>Input settings</summary><label className="checkbox-label"><input type="checkbox" checked={mirrored} disabled={busy} onChange={event => setMirrored(event.target.checked)}/>The camera pixels are already mirrored</label>{method==='baseline' && <label className="tiling-label" htmlFor="camera-tiling">Detector tiling<select id="camera-tiling" value={tileGrid} disabled={busy} onChange={event => setTileGrid(Number(event.target.value))}>{[1,2,3,4].map(value => <option key={value} value={value}>{value===1 ? '1 — full frame' : `${value} — more tiles, slower processing`}</option>)}</select></label>}</details>
        <div className="camera-actions"><Button onClick={start} disabled={busy || !ready}><Play size={16}/>Start camera</Button><Button variant="outline" onClick={() => void stop()} disabled={!busy || phase==='stopping'}><Square size={15}/>Stop</Button></div>
        <p className="camera-status" role="status">{phase==='permission' || phase==='loading' || phase==='stopping' ? <LoaderCircle size={14} className="spin"/> : null}{phaseLabel}</p>
        {error && <div className="analysis-error" role="alert"><AlertCircle size={17}/><span>{error}</span></div>}
        <p className="camera-note">Camera frames stay in memory and are processed on this computer. Nothing is recorded. Switching sources or hiding this tab stops the camera.</p>
      </div></section>
      <section className="workspace-card camera-output"><div className="workspace-card-header"><h2>Observed directions</h2><span>{phase==='live' ? 'LIVE PROCESSING' : 'NOT LIVE'}</span></div><div className="results-body">
        <div className="camera-processed"><canvas ref={output} hidden={!latest} aria-label="Latest processed camera frame with head direction annotations"/>{!latest && <div className="camera-placeholder"><Camera size={32}/><p>{phase==='loading' ? 'Preparing the model. The first result will appear here.' : 'Processed frames and direction labels appear here.'}</p></div>}</div>
        <p className="camera-note">{latest ? `${phase==='live' ? 'Latest processed frame' : 'Last processed frame — camera stopped'} · captured at ${latest.timestamp_seconds.toFixed(2)} s` : 'Annotations stay aligned with the exact frame that was processed.'}</p>
        <div className="result-stats"><div><strong>{latest ? `${fps.toFixed(1)} FPS` : '—'}</strong><span>Processed frames / elapsed time</span></div><div><strong>{latest?.id ?? '—'}</strong><span>Processed frames</span></div><div><strong>{latest ? `${latest.result.processing_ms.toFixed(0)} ms` : '—'}</strong><span>Latest inference & preprocessing</span></div></div>
        <div className="camera-counts"><h3>Latest frame</h3>{DIRECTIONS.map(direction => <div key={direction}><span>{direction}</span><strong>{latest?.counts[direction] ?? 0}</strong></div>)}</div>
        <p className="result-disclaimer">Counts describe this frame, not unique people. Unknown means direction could not be established. This mode estimates head direction; it does not assign seats or detect movement events. Head direction is not eye gaze or evidence of misconduct.</p>
      </div></section>
    </div>
  </>;
}
