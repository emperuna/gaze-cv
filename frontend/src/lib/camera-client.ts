export function cameraFrameSize(width:number,height:number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width<=0 || height<=0) throw new Error('Camera has not produced a readable frame yet.');
  const scale=Math.min(1,1280/width,720/height);
  return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}

/** A captured frame stays unchanged until its inference result has been displayed. */
export async function runCameraFrames<Frame,Result>({signal,capture,process,display,intervalMs=100}:{
  signal:AbortSignal; capture:() => Frame; process:(frame:Frame) => Promise<Result>;
  display:(frame:Frame,result:Result) => void; intervalMs?:number;
}) {
  while (!signal.aborted) {
    const started=performance.now();
    const frame=capture();
    const result=await process(frame);
    if (signal.aborted) return;
    display(frame,result);
    if (signal.aborted) return;
    await new Promise<void>(resolve => {
      const finish=() => {clearTimeout(timer);signal.removeEventListener('abort',finish);resolve();};
      const timer=setTimeout(finish,Math.max(0,intervalMs-(performance.now()-started)));
      signal.addEventListener('abort',finish,{once:true});
    });
  }
}
