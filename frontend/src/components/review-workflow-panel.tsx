"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { timeLabel } from '@/lib/review-contract';
import type { ReviewRecord, SavedReview } from '@/lib/review-contract';
import { CONTEXT_SECONDS, GROUP_GAP_SECONDS, REVIEW_STATUSES, groupReviewEvents, seatCoverage } from '@/lib/review-workflow';
import type { ItemDecision, ReviewItem, ReviewWorkflow } from '@/lib/review-workflow';

export function ReviewWorkflowPanel({ meta, record, onContext, onSeek, onPendingChange }: {
  meta: SavedReview; record: ReviewRecord; onContext: (item: ReviewItem) => void;
  onSeek: (time: number) => void; onPendingChange: (pending: boolean) => void;
}) {
  const groups = useMemo(() => groupReviewEvents(record), [record]);
  const coverage = useMemo(() => seatCoverage(record), [record]);
  const [workflow, setWorkflow] = useState<ReviewWorkflow | null>(null);
  const [baseline, setBaseline] = useState<ReviewWorkflow | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [seat, setSeat] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const pendingCallback = useRef(onPendingChange); pendingCallback.current = onPendingChange;
  const base = `/api/review/${meta.id}`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void fetch(`${base}/workflow`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not read review notes.');
      if (!controller.signal.aborted) { setWorkflow(data); setBaseline(data); setDirty(false); }
    }).catch(error => { if (!controller.signal.aborted) setError((error as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [base]);

  useEffect(() => { pendingCallback.current(dirty || saving); }, [dirty, saving]);
  useEffect(() => () => pendingCallback.current(false), []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function edit(change: Partial<ReviewWorkflow>) {
    if (!workflow || saving) return;
    setWorkflow({ ...workflow, ...change, signedOffAt: null }); setDirty(true); setMessage('');
  }
  function decide(id: string, change: Partial<ItemDecision>) {
    if (workflow) edit({ items: { ...workflow.items, [id]: { ...workflow.items[id], ...change } } });
  }
  async function save() {
    if (!workflow || saving) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch(`${base}/workflow`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...workflow, signedOff: workflow.signedOffAt !== null }) });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error || 'Review notes could not be saved.');
      setWorkflow(saved); setBaseline(saved); setDirty(false); setMessage('Review notes and report saved on this computer.');
    } catch (error) { setError((error as Error).message); }
    finally { setSaving(false); }
  }
  async function reloadSaved() {
    setLoading(true); setError(''); setMessage('');
    try {
      const response = await fetch(`${base}/workflow`, { cache: 'no-store' });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error || 'Could not reload review notes.');
      setWorkflow(saved); setBaseline(saved); setDirty(false); setMessage('Saved review reloaded. Local unsaved changes discarded.');
    } catch (error) { setError((error as Error).message); }
    finally { setLoading(false); }
  }

  const filtered = groups.filter(item => (seat === 'all' || item.seatId === seat) &&
    (status === 'all' || (workflow?.items[item.id]?.status ?? 'Unreviewed') === status));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  const disabled = loading || saving || !workflow;
  const missingSeats = coverage.filter(seat => seat.unavailableSeconds > 1e-6);

  return <div className="review-workflow">
    <section className="coverage-checks" aria-label="Seat coverage checks">
      <div className="review-section-heading"><h3>Seat coverage checks</h3><span>{missingSeats.length} of {coverage.length} seats have gaps</span></div>
      <p className="review-help">Unavailable observations may reflect a hidden head, poor lighting, detection failure, or an obstruction. Coverage is not an accuracy or attendance measure.</p>
      <div className="coverage-grid">{coverage.map(seat => <details className={`coverage-card${seat.gaps.length ? ' coverage-warning' : ''}`} key={seat.seatId}>
        <summary><strong>{seat.seatId}</strong><span>{seat.percent.toFixed(1)}% observed</span></summary>
        <p>{seat.unavailableSeconds.toFixed(2)} s unavailable across {seat.gaps.length} intervals.</p>
        {seat.gaps.length > 0 && <ul>{seat.gaps.slice(0, 100).map((gap, index) => <li key={index}><button type="button" onClick={() => onSeek(gap.start)}>{timeLabel(gap.start)}–{timeLabel(gap.end)}</button><span>{gap.reason}</span></li>)}</ul>}
        {seat.gaps.length > 100 && <p>Showing the first 100 gaps. All observations remain in review.json.</p>}
      </details>)}</div>
    </section>

    <section aria-label="Movement review queue">
      <div className="review-section-heading"><h3>Review queue</h3><span>{groups.length} items · {record.events.length} original events</span></div>
      <p className="review-help">Same-seat, same-direction events overlap or fall within {GROUP_GAP_SECONDS} seconds to form one item. Unavailable observations break grouping. Play up to {CONTEXT_SECONDS} seconds of footage before and after each item.</p>
      <div className="queue-totals">{REVIEW_STATUSES.map(label => <span key={label}>{label}: <strong>{groups.filter(item => (workflow?.items[item.id]?.status ?? 'Unreviewed') === label).length}</strong></span>)}</div>
      <div className="review-filters"><label>Queue seat<select aria-label="Queue seat" value={seat} onChange={event => { setSeat(event.target.value); setPage(0); }}><option value="all">All seats</option>{record.settings.seats.map(seat => <option key={seat.id}>{seat.id}</option>)}</select></label>
        <label>Queue status<select aria-label="Queue status" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="all">All statuses</option>{REVIEW_STATUSES.map(label => <option key={label}>{label}</option>)}</select></label></div>
      {loading && <p role="status">Loading saved review decisions…</p>}
      {!filtered.length && <p className="review-empty">{groups.length ? 'No review items match these filters.' : 'No movement events were recorded. This does not establish that no relevant movements occurred.'}</p>}
      <div className="review-queue-items">{filtered.slice(currentPage * 20, currentPage * 20 + 20).map(item => <article className="review-queue-item" key={item.id}>
        <div className="queue-item-heading"><h4>{item.seatId} · {item.direction}</h4><span>{item.eventIndexes.length} {item.eventIndexes.length === 1 ? 'event' : 'grouped events'}</span></div>
        <p>{timeLabel(item.start)}–{timeLabel(item.end)}</p>
        <button className="review-secondary-action" type="button" onClick={() => onContext(item)}>Play context for {item.seatId} at {timeLabel(item.start)}</button>
        <fieldset disabled={disabled}><label>Review status for {item.seatId} at {timeLabel(item.start)}<select aria-label={`Review status for ${item.seatId} at ${timeLabel(item.start)}`} value={workflow?.items[item.id]?.status ?? 'Unreviewed'} onChange={event => decide(item.id, { status: event.target.value as ItemDecision['status'] })}>{REVIEW_STATUSES.map(label => <option key={label}>{label}</option>)}</select></label>
          <label>Notes for {item.seatId} at {timeLabel(item.start)}<textarea aria-label={`Notes for ${item.seatId} at ${timeLabel(item.start)}`} rows={2} maxLength={2000} value={workflow?.items[item.id]?.notes ?? ''} onChange={event => decide(item.id, { notes: event.target.value })} placeholder="Describe what you observed in the surrounding footage." /></label></fieldset>
        <details><summary>Original movement records</summary><ul>{item.eventIndexes.map(index => { const event = record.events[index]; return <li key={index}>{event.event_type === 'sustained_movement' ? 'Sustained' : 'Repeated'} {event.direction} · <button type="button" onClick={() => onSeek(event.start_time)}>{timeLabel(event.start_time)}–{timeLabel(event.end_time)}</button> · rule triggered {timeLabel(event.observed_at)}</li>; })}</ul></details>
      </article>)}</div>
      {pageCount > 1 && <div className="review-pagination"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous items</button><span>Page {currentPage + 1} of {pageCount}</span><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next items</button></div>}
    </section>

    <section className="session-report" aria-label="Editable session report">
      <div className="review-section-heading"><h3>Session report</h3><span>{dirty ? 'Unsaved changes' : workflow?.signedOffAt ? 'Signed off' : 'Draft'}</span></div>
      <p className="review-help">The report includes original event timestamps, grouped items, seat references, coverage gaps, settings, and the notes below. Save or discard changes before switching sessions or sources.</p>
      <fieldset disabled={disabled}>
        <label>Session summary<textarea aria-label="Session summary" rows={5} maxLength={20000} value={workflow?.summary ?? ''} onChange={event => edit({ summary: event.target.value })} /></label>
        <label>Proctor notes<textarea aria-label="Proctor notes" rows={3} maxLength={10000} value={workflow?.proctorNotes ?? ''} onChange={event => edit({ proctorNotes: event.target.value })} /></label>
        <label>Reviewer name<input maxLength={120} value={workflow?.reviewer ?? ''} onChange={event => edit({ reviewer: event.target.value })} autoComplete="off" /></label>
        <label className="review-checkbox"><input type="checkbox" checked={workflow?.signedOffAt !== null && !!workflow} disabled={!workflow?.reviewer.trim()} onChange={event => {
          if (workflow) { setWorkflow({ ...workflow, signedOffAt: event.target.checked ? 'pending' : null }); setDirty(true); setMessage(''); }
        }} />I have reviewed this summary and the observations it describes.</label>
      </fieldset>
      <p className="review-help">Use Download PDF report in the report bar above the workspace. Save edits first so the PDF includes your latest statuses, notes and sign-off.</p>
      {workflow?.signedOffAt && workflow.signedOffAt !== 'pending' && <p className="review-help">Signed off {new Date(workflow.signedOffAt).toLocaleString()}. Editing the report or decisions clears sign-off. This is a local acknowledgement; identity is not verified.</p>}
      <div className="report-actions"><button type="button" className="review-secondary-action" disabled={disabled || (!dirty && !!workflow?.updatedAt)} onClick={() => void save()}>{saving ? 'Saving…' : 'Save review & report'}</button>
        <button type="button" className="review-secondary-action" disabled={!dirty || saving} onClick={() => { setWorkflow(baseline); setDirty(false); setError(''); setMessage('Unsaved changes discarded.'); }}>Discard unsaved changes</button>
        <button type="button" className="review-secondary-action" disabled={saving || loading} onClick={() => void reloadSaved()}>Reload saved review (discards edits)</button>
        {!dirty && !loading && workflow?.updatedAt && <a href={`${base}/report`} download>Download editable report (.md)</a>}</div>
      {message && <p role="status" className="review-help">{message}</p>}
      {error && <p role="alert" className="analysis-error">{error} Reopen the session to reload saved decisions.</p>}
    </section>
  </div>;
}
