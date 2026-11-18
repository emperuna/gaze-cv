import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { AnalysisError, projectRoot, python, pythonEnvironment } from './server-analysis.ts';
import type { IncidentReport } from './incident-report.ts';

const shared = globalThis as typeof globalThis & { ocularPdfJobs?: number };

export async function renderReportPdf(report: IncidentReport, signal: AbortSignal): Promise<Buffer> {
  if (signal.aborted) throw new AnalysisError('Report download cancelled.', 499);
  if ((shared.ocularPdfJobs || 0) >= 2) throw new AnalysisError('Two PDF reports are already being prepared. Try again shortly.', 409);
  const input = JSON.stringify(report);
  if (Buffer.byteLength(input) > 4 * 1024 * 1024) throw new AnalysisError('Report data exceeds the 4 MB limit. Shorten the report notes.', 413);
  shared.ocularPdfJobs = (shared.ocularPdfJobs || 0) + 1;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const child = spawn(python, [join(projectRoot, 'scripts', 'render_incident_report.py')],
        { cwd: projectRoot, env: pythonEnvironment(), windowsHide: true, shell: false });
      const chunks: Buffer[] = []; let size = 0, errorText = '', failure = '';
      let killer: ReturnType<typeof setTimeout> | undefined;
      const stop = () => { child.kill(); killer ??= setTimeout(() => child.kill('SIGKILL'), 2000); killer.unref(); };
      const abort = () => { failure = 'Report download cancelled.'; stop(); };
      const timer = setTimeout(() => { failure = 'PDF generation timed out. Try again with shorter notes.'; stop(); }, 30000);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      const cleanup = () => { clearTimeout(timer); clearTimeout(killer); signal.removeEventListener('abort', abort); };
      child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 8 * 1024 * 1024) { failure = 'PDF exceeds the 8 MB limit.'; stop(); } else chunks.push(chunk); });
      child.stderr.on('data', chunk => { errorText = (errorText + chunk.toString()).slice(-2000); });
      child.stdin.on('error', () => { failure ||= 'PDF renderer input failed.'; stop(); });
      child.once('error', () => { cleanup(); reject(new AnalysisError('PDF renderer could not start. Verify the project Python environment and requirements.txt.', 503)); });
      child.once('close', code => {
        cleanup();
        if (failure || code !== 0) {
          reject(new AnalysisError(failure || (errorText.includes('reportlab') ? 'PDF support needs the updated requirements.txt installed in the project .venv.' : 'PDF generation failed. Check the saved notes and local Python setup.'), signal.aborted ? 499 : 503)); return;
        }
        const pdf = Buffer.concat(chunks);
        if (pdf.subarray(0, 5).toString() !== '%PDF-') { reject(new AnalysisError('The renderer did not produce a PDF.', 503)); return; }
        resolve(pdf);
      });
      child.stdin.end(input);
    });
  } finally { shared.ocularPdfJobs = Math.max(0, (shared.ocularPdfJobs || 1) - 1); }
}

export async function pdfResponse(report: IncidentReport, signal: AbortSignal) {
  const pdf = await renderReportPdf(report, signal);
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(pdf.length),
    'Content-Disposition': `attachment; filename="ocular-${report.mode}-${report.id}.pdf"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
