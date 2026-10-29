"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowDownToLine, ArrowRight, Check, ChevronDown, FileImage, FileJson, FileVideo, LoaderCircle, RefreshCw, ScanLine, Settings2, ShieldCheck, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DIRECTIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, validateUpload } from "@/lib/analysis-contract";
import type { AnalysisMethod, AnalysisResult, BackendStatus, MediaKind } from "@/lib/analysis-contract";

function formatSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

export function AnalysisWorkspace({initialKind = 'image', onRunningChange}: {initialKind?:MediaKind;onRunningChange?:(running:boolean) => void}) {
  const [kind, setKind] = useState<MediaKind>(initialKind);
  const [method, setMethod] = useState<AnalysisMethod>("head");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [mirrored, setMirrored] = useState(false);
  const [tileGrid, setTileGrid] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [tab, setTab] = useState<"preview" | "observations" | "files">("preview");
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  const checkingNow = useRef(false);

  useEffect(() => {onRunningChange?.(running);},[running,onRunningChange]);

  async function checkBackend() {
    if (checkingNow.current) return;
    checkingNow.current = true;
    setChecking(true);
    setStatusError("");
    try {
      const response = await fetch("/api/analyze", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not check the local processor.");
      if (active.current) setStatus(data);
    } catch (e) { if (active.current) setStatusError((e as Error).message); }
    finally { checkingNow.current = false; if (active.current) setChecking(false); }
  }

  useEffect(() => { active.current = true; void checkBackend(); return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const ready = !!status?.methods[method].ready && !checking && !statusError;

  function clearInput() {
    setFile(null); setResult(null); setError(""); setPreviewError(false); setTab("preview");
    if (input.current) input.current.value = "";
  }

  function chooseFile(selected: File | undefined) {
    if (!selected || running) return;
    try {
      const valid = validateUpload(selected.name, selected.size, method);
      setKind(valid.kind); setFile(selected); setResult(null); setPreviewError(false); setError(""); setTab("preview");
    } catch (e) { setError((e as Error).message); if (input.current) input.current.value = ""; }
  }

  async function analyze() {
    if (!file || !ready || running) return;
    setRunning(true); setError(""); setResult(null); setTab("preview");
    const body = new FormData();
    body.set("file", file); body.set("method", method); body.set("mirrored", String(mirrored)); body.set("tileGrid", String(tileGrid));
    try {
      const response = await fetch("/api/analyze", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis could not finish.");
      if (active.current) setResult(data);
    } catch (e) { if (active.current) setError((e as Error).message || "The local processor could not be reached."); }
    finally { if (active.current) setRunning(false); }
  }

  return <>
    <div className={`backend-banner${ready ? " backend-ready" : ""}`} role="status"><span className="backend-icon">{checking ? <LoaderCircle className="spin" size={18} /> : ready ? <Check size={18} /> : <Settings2 size={18} />}</span><div><strong>{checking ? "Checking the local processor" : ready ? "Local processor available" : "Python setup needed"}</strong><p>{checking ? "Looking for the project environment and selected models." : statusError || status?.methods[method].message || "The local processor could not be checked."}</p></div><button type="button" onClick={checkBackend} disabled={checking || running} aria-label="Recheck local processor"><RefreshCw size={15} /><span>Recheck</span></button></div>

    <div className="analysis-grid">
      <section className="workspace-card input-card" aria-labelledby="input-heading"><div className="workspace-card-header"><h2 id="input-heading"><span className="panel-number">01</span> Input</h2><span>{file ? "READY TO REVIEW" : "SELECT A SOURCE"}</span></div><div className="input-card-body">
        {file && preview ? <div className="selected-input"><div className="input-media">{previewError ? <div className="preview-fallback"><AlertCircle size={25} /><strong>Browser preview unavailable</strong><p>This format can still be sent to the Python decoder.</p></div> : kind === "image" ? <img src={preview} alt={`Selected input: ${file.name}`} onError={() => setPreviewError(true)} /> : <video src={preview} controls preload="metadata" onError={() => setPreviewError(true)} aria-label={`Selected video: ${file.name}`} />}</div><div className="selected-file"><span className="file-type-icon">{kind === "image" ? <FileImage size={20} /> : <FileVideo size={20} />}</span><div><strong title={file.name}>{file.name}</strong><span>{formatSize(file.size)} · {kind === "image" ? "Image" : "Saved video"}</span></div><button type="button" onClick={clearInput} disabled={running} aria-label="Remove selected file"><X size={17} /></button></div></div> : <label className={`upload-zone${dragging ? " is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!running) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length > 1) setError("Choose one file at a time for this workspace."); else chooseFile(event.dataTransfer.files[0]); }}><input ref={input} type="file" accept={(kind === "image" ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS).join(",")} disabled={running} onChange={(event) => chooseFile(event.target.files?.[0])} className="sr-only" aria-label={`Choose ${kind === "image" ? "an image" : "a saved video"}`} /><span className="upload-icon"><Upload size={26} strokeWidth={1.5} /></span><strong>Drop your {kind === "image" ? "image" : "video"} here</strong><span>or <u>browse files</u> on this computer</span><small>{kind === "image" ? "JPG, PNG, WEBP, BMP, TIFF" : "MP4, AVI, MOV, MKV, WEBM, M4V"} · up to 64 MB</small></label>}

        <div className="analysis-settings"><label htmlFor="analysis-method">Analysis method <span>CPU PROCESSING</span></label><div className="select-wrap"><select id="analysis-method" value={method} disabled={running} onChange={(event) => { setMethod(event.target.value as AnalysisMethod); setResult(null); }}><option value="head">Automatic head model</option><option value="baseline">Geometric baseline</option></select><ChevronDown size={16} /></div><p>{method === "head" ? "Camera-relative head direction without seat calibration. Uses the head detector and rotation model." : "Head direction from facial landmarks. Useful as the reference approach for comparison."}</p></div>
        <details className="advanced-settings"><summary><Settings2 size={15} /> Input settings <ChevronDown size={14} /></summary><label className="checkbox-label"><input type="checkbox" checked={mirrored} disabled={running} onChange={(event) => { setMirrored(event.target.checked); setResult(null); }} /><span>The input pixels are already mirrored</span></label>{method === "baseline" && <label className="tiling-label" htmlFor="detector-tiling">Detector tiling<select id="detector-tiling" value={tileGrid} disabled={running} onChange={(event) => { setTileGrid(Number(event.target.value)); setResult(null); }}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value === 1 ? "1 — full frame" : `${value} — more tiles, slower processing`}</option>)}</select></label>}<p>Left and right are subject-relative. Unknown observations remain explicit.</p></details>
        {kind === "video" && <div className="video-input-note"><AlertCircle size={15} /><span>Use a constant-frame-rate saved clip. This automatic workflow does not create seat histories or movement events.</span></div>}
        {error && <div className="analysis-error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}
        <Button className="analyze-button" onClick={analyze} disabled={!file || !ready || running}>{running ? <><LoaderCircle size={17} className="spin" /> Processing locally…</> : <>Analyze {kind === "image" ? "image" : "video"}<ArrowRight size={17} /></>}</Button><p className="input-privacy"><ShieldCheck size={13} />Use only authorized media. Runs stay in this local project.</p>
      </div></section>

      <section className="workspace-card output-card" aria-labelledby="output-heading" aria-busy={running}><div className="workspace-card-header"><h2 id="output-heading"><span className="panel-number">02</span> Output</h2><span className={result ? "output-complete" : ""}>{running ? "PROCESSING" : result ? "ANALYSIS COMPLETE" : "AWAITING INPUT"}</span></div>
        {!result ? <div className="output-empty" role="status"><span className={`output-empty-icon${running ? " is-processing" : ""}`}>{running ? <LoaderCircle size={32} className="spin" strokeWidth={1.25} /> : <ScanLine size={38} strokeWidth={1.25} />}</span><h3>{running ? "Observing visible head directions" : "A clearer view starts here."}</h3><p>{running ? "The Python prototype is decoding your file and generating annotations. Keep this page open; longer clips take more time." : "Your annotated output, direction observations, and downloadable records will appear here after analysis."}</p><div className="output-pipeline"><span className={file ? "pipeline-active" : ""}><Upload size={13} /> Input</span><i /><span className={running ? "pipeline-active" : ""}><ScanLine size={14} /> Analyze</span><i /><span><Check size={14} /> Review</span></div>{!ready && !checking && <span className="output-setup-hint">You can preview an input while the Python environment is being set up.</span>}</div> : <div className="results-body"><div className="result-meta"><span><Check size={13} /> Analysis complete</span><strong>{result.filename}</strong></div><div className="result-tabs" role="tablist" aria-label="Analysis results">{(["preview", "observations", "files"] as const).map((value) => <button type="button" key={value} role="tab" id={`tab-${value}`} aria-selected={tab === value} aria-controls={`panel-${value}`} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const options = ["preview", "observations", "files"] as const; const current = options.indexOf(value); const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (current + (event.key === "ArrowRight" ? 1 : 2)) % 3; setTab(options[next]); document.getElementById(`tab-${options[next]}`)?.focus(); } }}>{value === "preview" ? "Preview" : value === "observations" ? "Observations" : "Downloads"}</button>)}</div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
            {tab === "preview" && <>{result.kind === "image" ? <div className="output-image"><img src={result.files.find((item) => item.name === "annotated.png")?.href} alt={`Annotated head directions for ${result.filename}`} /></div> : <div className="video-output"><FileVideo size={36} strokeWidth={1.4} /><h3>Your annotated video is ready.</h3><p>The Python prototype produces MJPG AVI. Download it to view the annotations in a compatible video player.</p><Button variant="outline" asChild><a href={`${result.files.find((item) => item.name === "annotated.avi")?.href}?download=1`} download><ArrowDownToLine />Download annotated AVI</a></Button><small>The input panel previews the original video.</small></div>}<div className="result-stats"><div><strong>{result.observations.toLocaleString()}</strong><span>Detected observations</span></div><div><strong>{result.kind === "image" ? `${result.processingMs?.toFixed(0) ?? "—"} ms` : result.processedFrames?.toLocaleString() ?? "—"}</strong><span>{result.kind === "image" ? "Inference & preprocessing" : "Processed frames"}</span></div><div><strong>{result.kind === "image" ? `${result.width} × ${result.height}` : result.processingFps === null ? "Not measured" : `${result.processingFps.toFixed(1)} FPS`}</strong><span>{result.kind === "image" ? "Source dimensions" : "Processing throughput"}</span></div></div><DirectionCounts result={result} /></>}
            {tab === "observations" && <div className="observations-content"><DirectionCounts result={result} />{result.kind === "image" ? result.detections.length ? <div className="observations-table-wrap"><table className="observations-table"><caption>Frame-local detections, not tracked identities</caption><thead><tr><th scope="col">Observation</th><th scope="col">Direction</th><th scope="col">Details</th></tr></thead><tbody>{result.detections.map((detection, index) => <tr key={index}><td>{String(index + 1).padStart(2, "0")}</td><td><span className={`direction-badge direction-${detection.direction}`}>{detection.direction}</span></td><td>{detection.unavailable_reason?.replaceAll("_", " ") || "Usable direction"}</td></tr>)}</tbody></table></div> : <p className="zero-detections">No usable detections were returned. This does not establish that the scene contained no people. Try a clearer input and review the method limitations.</p> : <div className="frame-record-note"><FileJson size={23} /><div><h3>Every frame has a record.</h3><p>Download the frame observations JSONL for source timestamps, bounding boxes, direction labels, and unknown-observation reasons.</p><p>Direction counts sum observations across frames. They are not counts of unique people.</p></div></div>}</div>}
            {tab === "files" && <div className="download-list">{result.files.map((item) => <a href={`${item.href}?download=1`} download key={item.name}><span>{item.name.endsWith(".png") ? <FileImage size={21} /> : item.name.endsWith(".avi") ? <FileVideo size={21} /> : <FileJson size={21} />}</span><div><strong>{item.label}</strong><small>{item.name}</small></div><ArrowDownToLine size={17} /></a>)}<p>Each run uses a new local output folder. Metadata records the method, source, and processing conditions.</p></div>}
          </div><p className="result-disclaimer">Head direction is an observation, not eye gaze or evidence of misconduct.</p>
        </div>}
      </section>
    </div>

    <details className="setup-guide" open={!checking && !ready}><summary><Settings2 size={17} /><span>Local processor setup</span><ChevronDown size={16} /></summary><div><p>Run these commands from the repository root after the project-local cache setup in the README. They create the Python environment and download the required model assets.</p><div className="setup-command"><span>BASELINE</span><pre><code>{"python -m venv .venv\n.\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt -e .\n.\\.venv\\Scripts\\python.exe scripts/download_model.py"}</code></pre></div><div className="setup-command"><span>ADD THE HEAD MODEL</span><pre><code>{".\\.venv\\Scripts\\python.exe -m pip install -r requirements-head-pose.txt\n.\\.venv\\Scripts\\python.exe scripts/download_head_models.py"}</code></pre></div><p>After setup, use <strong>Recheck</strong> above. Model quality and classroom applicability remain under evaluation. <a href="https://github.com/emperuna/gaze-cv/blob/main/README.md" target="_blank" rel="noreferrer">Full setup instructions ↗</a></p></div></details>
  </>;
}

function DirectionCounts({ result }: { result: AnalysisResult }) {
  const highest = Math.max(1, ...Object.values(result.counts));
  return <div className="direction-counts"><div className="direction-counts-heading"><h3>Direction breakdown</h3><span>{result.kind === "video" ? "FRAME OBSERVATIONS" : "DETECTED OBSERVATIONS"}</span></div>{DIRECTIONS.map((direction) => <div className="direction-count-row" key={direction}><span className={`direction-dot direction-${direction}`} /><span>{direction}</span><div className="count-track"><i style={{ width: `${((result.counts[direction] || 0) / highest) * 100}%` }} className={`direction-${direction}`} /></div><strong>{(result.counts[direction] || 0).toLocaleString()}</strong></div>)}<p>Unknown means a usable direction could not be established.</p></div>;
}
