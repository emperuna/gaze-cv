import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MAX_UPLOAD_BYTES, OUTPUT_FILES, validateUpload } from "./analysis-contract.ts";
import type { AnalysisMethod, AnalysisResult, BackendStatus } from "./analysis-contract.ts";
import { acquireProcessingSlot } from './processing-slot.ts';

export const projectRoot = resolve(process.cwd(), "..");
export const analysisRoot = join(projectRoot, "outputs", "runs", "web");
export const python = join(projectRoot, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

async function exists(path: string) {
  try { await access(path); return true; } catch { return false; }
}

export function pythonEnvironment() {
  const local = (name: string) => join(projectRoot, ".work", name);
  return {
    ...process.env,
    TEMP: local("tmp"), TMP: local("tmp"), TMPDIR: local("tmp"),
    PIP_CACHE_DIR: local("pip-cache"), MPLCONFIGDIR: local("matplotlib"), XDG_CACHE_HOME: local("cache"),
    PYTHONPATH: join(projectRoot, "src"), PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1", PYTHONUNBUFFERED: "1",
  };
}

export function runnerArguments(input: string, output: string, method: AnalysisMethod, mirrored: boolean, tileGrid: number) {
  return [join(projectRoot, "scripts", "run.py"), "--input", input, "--output-dir", output,
    "--method", method, ...(mirrored ? ["--mirrored"] : []),
    ...(method === "baseline" ? ["--tile-grid", String(tileGrid)] : [])];
}

function runPython(args: string[], timeoutMs: number) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolvePromise, reject) => {
    const child = spawn(python, args, { cwd: projectRoot, env: pythonEnvironment(), windowsHide: true, shell: false });
    let stdout = "", stderr = "", expired = false;
    const timer = setTimeout(() => { expired = true; child.kill(); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk.toString()).slice(-65536); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-65536); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (expired) reject(new Error("Analysis exceeded the 10-minute limit. Use a shorter saved clip."));
      else resolvePromise({ code, stdout, stderr });
    });
  });
}

export async function backendStatus(): Promise<BackendStatus> {
  const pythonReady = await exists(python);
  const status: BackendStatus = {
    pythonReady,
    methods: {
      head: { ready: false, message: "Create the project .venv, install the Python requirements, and download the models. See setup instructions below." },
      baseline: { ready: false, message: "Create the project .venv, install the Python requirements, and download the face model. See setup instructions below." },
    },
  };
  if (!pythonReady) return status;
  try {
    const probe = await runPython(["-c", "import importlib.util,json; print(json.dumps({m: importlib.util.find_spec(m) is not None for m in ['cv2','numpy','mediapipe','onnxruntime']}))"], 10000);
    const modules = JSON.parse(probe.stdout) as Record<string, boolean>;
    const modelDir = join(projectRoot, "models", "downloads");
    const baselineReady = modules.cv2 && modules.numpy && modules.mediapipe && await exists(join(modelDir, "face_landmarker.task"));
    const headReady = modules.cv2 && modules.numpy && modules.onnxruntime && await exists(join(modelDir, "gold_yolo_n_head_post_0277_0.5071_1x3x640x640.onnx")) && await exists(join(modelDir, "sixdrepnet360_1x3x224x224_full.onnx"));
    status.methods.baseline = { ready: !!baselineReady, message: baselineReady ? "Geometric baseline available." : "Install requirements.txt and run scripts/download_model.py in the project environment." };
    status.methods.head = { ready: !!headReady, message: headReady ? "Automatic head model available." : "Install requirements-head-pose.txt and run scripts/download_head_models.py in the project environment." };
  } catch {
    for (const method of ["head", "baseline"] as const) status.methods[method].message = "The project Python environment could not be checked. Verify .venv and the documented setup.";
  }
  return status;
}

export class AnalysisError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function analyzeFile(file: File, methodValue: unknown, mirrored: boolean, tileGrid: number): Promise<AnalysisResult> {
  let upload;
  try { upload = validateUpload(file.name, file.size, methodValue); }
  catch (error) { throw new AnalysisError((error as Error).message, file.size > MAX_UPLOAD_BYTES ? 413 : 400); }
  if (!Number.isInteger(tileGrid) || tileGrid < 1 || tileGrid > 4) throw new AnalysisError("Detector tiling must be between 1 and 4.", 400);
  let release;
  try { release = acquireProcessingSlot(); }
  catch (error) { throw new AnalysisError((error as Error).message, 409); }
  try {
    const status = await backendStatus();
    if (!status.methods[upload.method].ready) throw new AnalysisError(status.methods[upload.method].message, 503);
    const runId = randomUUID();
    const runDir = join(analysisRoot, runId);
    await mkdir(runDir, { recursive: true });
    const input = join(runDir, `input${upload.extension}`);
    const output = join(runDir, "output");
    await writeFile(input, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
    const processResult = await runPython(runnerArguments(input, output, upload.method, mirrored, tileGrid), 10 * 60 * 1000);
    let report;
    try { report = JSON.parse(await readFile(join(output, "run.json"), "utf8")); }
    catch { throw new AnalysisError(processResult.stderr.trim().split("\n").at(-1) || "Python could not produce a run report. Check the project environment and input file.", 422); }
    const item = report.inputs?.[0];
    if (processResult.code !== 0 || !item || item.status !== "ok") throw new AnalysisError(item?.error || "Analysis failed. Try a readable image or constant-frame-rate saved video.", 422);
    const itemDir = join(output, "001-input");
    const details = JSON.parse(await readFile(join(itemDir, upload.kind === "image" ? "observations.json" : "summary.json"), "utf8"));
    const files: AnalysisResult["files"] = [];
    for (const [name, definition] of Object.entries(OUTPUT_FILES)) {
      if (await exists(join(output, definition.relative))) files.push({ name, label: definition.label, href: `/api/analyze/${runId}/${name}` });
    }
    return {
      runId, filename: file.name, kind: upload.kind, method: upload.method,
      counts: details.direction_counts || {}, observations: details.detected_observations || 0,
      processingMs: upload.kind === "image" ? details.result.processing_ms : null,
      processedFrames: upload.kind === "video" ? details.processed_frames : null,
      processingFps: upload.kind === "video" ? details.timing.processing_fps : null,
      detections: upload.kind === "image" ? details.result.detections : [],
      width: upload.kind === "image" ? details.result.width : details.source.width,
      height: upload.kind === "image" ? details.result.height : details.source.height,
      files,
    };
  } finally { release(); }
}
