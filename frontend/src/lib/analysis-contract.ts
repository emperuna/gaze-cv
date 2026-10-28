export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"];
export const VIDEO_EXTENSIONS = [".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v"];
export type AnalysisMethod = "head" | "baseline";
export type MediaKind = "image" | "video";
export type Direction = "forward" | "left" | "right" | "down" | "unknown";
export const DIRECTIONS: Direction[] = ["forward", "left", "right", "down", "unknown"];

export interface BackendStatus {
  pythonReady: boolean;
  methods: Record<AnalysisMethod, { ready: boolean; message: string }>;
}

export interface Detection {
  bbox: number[];
  direction: string;
  unavailable_reason?: string | null;
  estimation_source?: string;
}

export interface AnalysisResult {
  runId: string;
  filename: string;
  kind: MediaKind;
  method: AnalysisMethod;
  counts: Record<string, number>;
  observations: number;
  processingMs: number | null;
  processedFrames: number | null;
  processingFps: number | null;
  detections: Detection[];
  width: number;
  height: number;
  files: { name: string; label: string; href: string }[];
}

export function validateUpload(filename: string, size: number, method: unknown) {
  if (method !== "head" && method !== "baseline") throw new Error("Choose the head model or geometric baseline.");
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error("Choose a nonempty image or saved video.");
  if (size > MAX_UPLOAD_BYTES) throw new Error("Files must be 64 MB or smaller.");
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const kind = IMAGE_EXTENSIONS.includes(extension) ? "image" : VIDEO_EXTENSIONS.includes(extension) ? "video" : null;
  if (!kind) throw new Error("Choose a supported image or saved-video format.");
  return { extension, kind, method } as { extension: string; kind: MediaKind; method: AnalysisMethod };
}

export function allowLocalRequest(request: Request) {
  const url = new URL(request.url);
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!localHosts.has(url.hostname)) return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin);
    return localHosts.has(source.hostname) && source.port === url.port && source.protocol === url.protocol;
  } catch { return false; }
}

export function validRunId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

export const OUTPUT_FILES: Record<string, { relative: string; mime: string; label: string }> = {
  "annotated.png": { relative: "001-input/annotated.png", mime: "image/png", label: "Annotated image" },
  "annotated.avi": { relative: "001-input/annotated.avi", mime: "video/x-msvideo", label: "Annotated video (AVI)" },
  "observations.json": { relative: "001-input/observations.json", mime: "application/json", label: "Image observations (JSON)" },
  "observations.jsonl": { relative: "001-input/observations.jsonl", mime: "application/x-ndjson", label: "Frame observations (JSONL)" },
  "summary.json": { relative: "001-input/summary.json", mime: "application/json", label: "Video summary (JSON)" },
  "run.json": { relative: "run.json", mime: "application/json", label: "Run settings & metadata (JSON)" },
};
