"use client";

import type { LiveSeatState } from '@/lib/camera-contract';
import { formatElapsed, seatNumber, seatsObserved } from '@/lib/camera-dashboard';
import type { RunningStatus } from '@/lib/camera-dashboard';
import type { ReviewSeat } from '@/lib/review-contract';

/** One tile per seat with its current direction and whether it has an open alert, plus the status line. */
export function CameraSeatGrid({ seats, states, openSeats, status, sessionTime }: {
  seats: ReviewSeat[]; states: Record<string, LiveSeatState> | undefined; openSeats: Set<string>;
  status: RunningStatus; sessionTime: number;
}) {
  const observed = seatsObserved(seats.map(seat => seat.id), states);
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
    <p className={`seat-grid-status${status.slow ? ' seat-grid-slow' : ''}`}>
      <span>{status.text}</span> · <span>{observed}/{seats.length} seats observed</span> · <span aria-label={`Elapsed ${formatElapsed(sessionTime)}`}>{formatElapsed(sessionTime)}</span>
    </p>
    <details className="seat-grid-details">
      <summary>Details</summary>
      <p>{status.fps === null ? 'Processing speed: measuring.' : `Processing speed over the last 10 s: ${status.fps.toFixed(1)} FPS.`}</p>
      {status.detail && <p>{status.detail}</p>}
    </details>
  </section>;
}
