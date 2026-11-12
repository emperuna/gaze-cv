"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, ArrowDown, CircleHelp, Focus, Play } from "lucide-react";

const frames = [
  { time: "00:12", label: "A moment to the left", direction: "Left", icon: ArrowLeft, description: "Seat 02 turns left. A direction describes an observation, not its cause.", seats: ["Forward", "Left", "Forward"] },
  { time: "00:24", label: "A moment of writing", direction: "Down", icon: ArrowDown, description: "Seat 01 looks down. Ordinary writing can produce the same head direction.", seats: ["Down", "Forward", "Right"] },
  { time: "00:36", label: "A moment out of view", direction: "Unknown", icon: CircleHelp, description: "Seat 02 has no reliable observation. This gap must not count as continuous movement.", seats: ["Forward", "Unknown", "Forward"] },
];

export function SessionPreview() {
  const [selected, setSelected] = useState(0);
  const frame = frames[selected];
  const Icon = frame.icon;
  return <div className="session-example">
    <div className="example-titlebar"><span><Focus size={15} /> Ocular / Session review</span><span className="example-badge">Illustrative example</span></div>
    <div className="example-media"><img src="/images/classroom-review.png" alt="Classroom illustration used with fictional observations" width={1536} height={1024} loading="lazy" /><span className="example-time"><Play size={10} fill="currentColor" />{frame.time} / 00:48</span></div>
    <div className="example-body"><div className="example-status"><div><span className="card-overline">A CLOSER LOOK</span><h3>{frame.label}</h3></div><span className={`example-direction${frame.direction === "Unknown" ? " is-unknown" : ""}`}><Icon size={14} />{frame.direction}</span></div>
      <div className="example-timeline" role="group" aria-label="Choose an illustrative timestamp">{frames.map((item, index) => <button key={item.time} type="button" aria-pressed={selected === index} aria-label={`Show illustrative observation at ${item.time}`} onClick={() => setSelected(index)}><span />{item.time}</button>)}</div>
      <div className="example-seats" aria-label="Fictional seat observations">{frame.seats.map((direction, index) => <span key={index}>Seat 0{index + 1}<strong className={direction === "Unknown" ? "unknown-label" : ""}>{direction}</strong></span>)}</div>
      <p className="example-observation" aria-live="polite">{frame.description}</p>
      <div className="example-bottom"><span>Fictional observations · not model output</span><button type="button" aria-label="Next illustrative moment" onClick={() => setSelected((selected + 1) % frames.length)}><ArrowRight size={16} /></button></div>
    </div>
  </div>;
}
