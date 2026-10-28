import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { join, relative, isAbsolute } from "node:path";
import { Readable } from "node:stream";
import { allowLocalRequest, OUTPUT_FILES, validRunId } from "@/lib/analysis-contract";
import { analysisRoot } from "@/lib/server-analysis";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string; asset: string }> }) {
  if (!allowLocalRequest(request)) return new Response("Local access only", { status: 403 });
  const { runId, asset } = await params;
  const definition = Object.hasOwn(OUTPUT_FILES, asset) ? OUTPUT_FILES[asset] : null;
  if (!validRunId(runId) || !definition) return new Response("File not found", { status: 404 });
  try {
    const root = await realpath(join(analysisRoot, runId, "output"));
    const file = await realpath(join(root, definition.relative));
    const location = relative(root, file);
    if (location.startsWith("..") || isAbsolute(location)) return new Response("File not found", { status: 404 });
    const info = await stat(file);
    if (!info.isFile()) return new Response("File not found", { status: 404 });
    const download = new URL(request.url).searchParams.has("download") || asset !== "annotated.png";
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, { headers: {
      "Content-Type": definition.mime, "Content-Length": String(info.size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${asset}"`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch { return new Response("File not found", { status: 404 }); }
}
