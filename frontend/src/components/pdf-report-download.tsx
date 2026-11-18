"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDownToLine, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';

export function PdfReportDownload({ url, filename, disabled = false, descriptionId, variant, size, buttonClassName }: {
  url: string | null; filename: string; disabled?: boolean; descriptionId?: string;
  variant?: 'default' | 'outline'; size?: 'default' | 'lg'; buttonClassName?: string;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => { setError(''); return () => pending.current?.abort(); }, [url]);
  async function download() {
    if (busy || disabled || !url) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError('');
    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(40000)]) });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'The PDF report could not be downloaded. Try again.');
      }
      if (!response.headers.get('Content-Type')?.startsWith('application/pdf')) throw new Error('The server did not return a PDF report.');
      const blob = await response.blob();
      if (await blob.slice(0, 5).text() !== '%PDF-') throw new Error('The PDF download is incomplete. Try again.');
      const objectUrl = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = objectUrl; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'PDF download failed.'); }
    finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }
  return <div className="pdf-report-download"><Button type="button" variant={variant} size={size} className={buttonClassName} aria-describedby={descriptionId} disabled={disabled || busy || !url} onClick={() => void download()}>{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowDownToLine size={16} />}{busy ? 'Preparing PDF…' : 'Download PDF report'}</Button>{error && <p className="analysis-error" role="alert">{error}</p>}</div>;
}

export function PdfReportBar({ url, filename, disabled, description }: { url: string | null; filename: string; disabled: boolean; description: string }) {
  const descriptionId = useId();
  return <section className="report-export-bar" aria-label="PDF report download"><div className="report-export-copy"><strong>PDF incident report</strong><p id={descriptionId} role="status">{description}</p></div><PdfReportDownload url={url} filename={filename} disabled={disabled} descriptionId={descriptionId}/></section>;
}
