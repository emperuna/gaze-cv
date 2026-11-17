"use client";

import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CircleHelp, Play } from "lucide-react";
import { EXAMPLE_DURATION, EXAMPLE_MOMENTS, EXAMPLE_SEATS, EXAMPLE_TIMELINES, directionAt, type ExampleDirection } from "@/lib/example-moments";

const icons = { Forward: ArrowUp, Left: ArrowLeft, Right: ArrowRight, Down: ArrowDown, Unknown: CircleHelp };
const label = (direction: ExampleDirection) => direction === "Unknown" ? "Not visible" : direction;
const clock = (seconds: number) => `00:${String(seconds).padStart(2, "0")}`;
const percent = (seconds: number) => `${(seconds / EXAMPLE_DURATION) * 100}%`;

export function SessionPreview() {
  const [selected, setSelected] = useState(0);
  const moment = EXAMPLE_MOMENTS[selected];
  return <div className="session-example">
    <div className="example-frame">
      <img src="/images/ocular-output-mockup.png" alt="Illustrative fixed-camera classroom view with four numbered seats; observations are fictional" width={1672} height={941} loading="lazy" />
      {EXAMPLE_SEATS.map(seat => {
        const direction = directionAt(seat.id, moment.time);
        const Icon = icons[direction];
        const [left, top, width, height] = seat.box;
        return <span key={seat.id}>
          {direction === "Unknown" && <span className="example-hidden-seat" style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }} />}
          <span className={`example-tag${seat.id === moment.seat ? " is-active" : ""}${direction === "Unknown" ? " is-unknown" : ""}`} style={{ left: `${seat.tag.x}%`, top: `${seat.tag.y}%` }}><span className="sr-only">Seat {seat.id}: </span><Icon size={11} strokeWidth={2.5} aria-hidden="true" />{label(direction)}</span>
        </span>;
      })}
      <span className="example-time"><Play size={10} fill="currentColor" />{clock(moment.time)} / {clock(EXAMPLE_DURATION)}</span>
      <span className="example-badge">Illustrative example</span>
    </div>
    <div className="example-under">
      <div className="example-tracks" aria-label="Fictional seat timelines">
        {EXAMPLE_SEATS.map(seat => seat.id).sort().map(id => <div className="example-track" key={id}>
          <span>Seat {id}</span>
          <div className="example-bar">
            {EXAMPLE_TIMELINES[id].map(segment => <i key={segment.start} className={`example-seg dir-${segment.direction.toLowerCase()}`} style={{ width: percent(segment.end - segment.start) }} title={`${clock(segment.start)}–${clock(segment.end)} ${label(segment.direction)}`} />)}
            <span className="example-playhead" style={{ left: percent(moment.time) }} />
          </div>
        </div>)}
        <div className="example-moments" role="group" aria-label="Choose an illustrative moment">
          {EXAMPLE_MOMENTS.map((item, index) => <button key={item.time} type="button" aria-pressed={selected === index} aria-label={`Show illustrative moment at ${clock(item.time)}`} onClick={() => setSelected(index)} style={{ left: percent(item.time) }}>{clock(item.time)}</button>)}
        </div>
      </div>
      <p className="example-note" aria-live="polite"><strong>{moment.title}</strong>{moment.note}</p>
    </div>
    <div className="example-bottom"><span>Fictional observations · not model output</span><button type="button" aria-label="Next illustrative moment" onClick={() => setSelected((selected + 1) % EXAMPLE_MOMENTS.length)}><ArrowRight size={16} /></button></div>
  </div>;
}
