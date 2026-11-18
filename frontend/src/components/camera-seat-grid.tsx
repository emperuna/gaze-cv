"use client";

import type { LiveSeatState } from '@/lib/camera-contract';
import { formatElapsed, seatNumber } from '@/lib/camera-dashboard';
import type { RunningStatus } from '@/lib/camera-dashboard';
import type { ReviewSeat } from '@/lib/review-contract';

/** "Running smoothly · 5/6 seats observed · 12:05"; shown in the monitoring header so it stays in sight. */
export function SeatStatusLine({ status, observed, total, sessionTime }: { status: RunningStatus; observed: number; total: number; sessionTime: number }) {
  return <p className={`seat-grid-status${status.slow ? ' seat-grid-slow' : ''}`}>
    <span>{status.text}</span> · <span>{observed}/{total} seats observed</span> · <span aria-label={`Elapsed ${formatElapsed(sessionTime)}`}>{formatElapsed(sessionTime)}</span>
  </p>;
}

/** One tile per seat with its current direction and whether it has an open alert; speed under Details. */
export function CameraSeatGrid({ seats, states, openSeats, status }: {
  seats: ReviewSeat[]; states: Record<string, LiveSeatState> | undefined; openSeats: Set<string>; status: RunningStatus;
}) {
  return <section className="seat-grid" aria-labelledby="seat-grid-title">
    <h3 id="seat-grid-title">Seats</h3>
    <ul>
      {seats.map(seat => {
        const direction = states?.[seat.id]?.direction ?? 'unknown';
        const open = openSeats.has(seat.id);
        return <li key={seat.id} className={`seat-tile${open ? ' seat-tile-alert' : ''}${direction === 'unknown' ? ' seat-tile-unknown' : ''}`}>
          <span className="seat-tile-number" aria-hidden="true">{seatNumber(seat.id)}</span>
          <span className="sr-only">Seat {seatNumber(seat.id)}: </span>
          <span className="seat-tile-direction">{direction}</span>
          {open && <span className="seat-tile-flag">Check</span>}
          {open && <span className="sr-only">, has an open alert</span>}
        </li>;
      })}
    </ul>
    <details className="seat-grid-details">
      <summary>Details</summary>
      <p>{status.fps === null ? 'Processing speed: measuring.' : `Processing speed over the last 10 s: ${status.fps.toFixed(1)} FPS.`}</p>
      {status.detail && <p>{status.detail}</p>}
    </details>
  </section>;
}
