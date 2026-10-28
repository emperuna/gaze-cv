import { allowLocalRequest, MAX_UPLOAD_BYTES } from "@/lib/analysis-contract";
import { AnalysisError, analyzeFile, backendStatus } from "@/lib/server-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!allowLocalRequest(request)) return Response.json({ error: "Analysis is available on the local computer only." }, { status: 403 });
  return Response.json(await backendStatus(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!allowLocalRequest(request)) return Response.json({ error: "Analysis is available on the local computer only." }, { status: 403 });
  const maxBody = MAX_UPLOAD_BYTES + 128 * 1024;
  if (Number(request.headers.get("content-length")) > maxBody) return Response.json({ error: "Files must be 64 MB or smaller." }, { status: 413 });
  try {
    if (!request.body) throw new AnalysisError("Choose an image or saved video.", 400);
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBody) { await reader.cancel(); throw new AnalysisError("Files must be 64 MB or smaller.", 413); }
      chunks.push(value);
    }
    let form;
    try { form = await new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(chunks) }).formData(); }
    catch { throw new AnalysisError("Send the input as a file upload.", 400); }
    const file = form.get("file");
    if (!(file instanceof File)) throw new AnalysisError("Choose an image or saved video.", 400);
    const result = await analyzeFile(file, form.get("method"), form.get("mirrored") === "true", Number(form.get("tileGrid") || 1));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Analysis could not finish." }, { status: error instanceof AnalysisError ? error.status : 500 });
  }
}
