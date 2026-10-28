"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleHelp, ScanLine } from "lucide-react";

type Direction = "Forward" | "Left" | "Right" | "Down" | "Unknown";
const frames: { time: string; directions: Direction[]; description: string }[] = [
  { time: "00:12", directions: ["Forward", "Left", "Forward"], description: "Seat 02 turns left. A direction describes an observation, not its cause." },
  { time: "00:24", directions: ["Down", "Forward", "Right"], description: "Seat 01 looks down. Ordinary writing can produce the same head direction." },
  { time: "00:36", directions: ["Forward", "Unknown", "Forward"], description: "Seat 02 has no reliable observation. This gap must not count as continuous movement." },
];

function Student({ index, direction }: { index: number; direction: Direction }) {
  const headX = direction === "Left" ? -7 : direction === "Right" ? 7 : 0;
  const headY = direction === "Down" ? 8 : 0;
  const missing = direction === "Unknown";
  return (
    <g transform={`translate(${90 + index * 170} 112)`} className={missing ? "student student-unknown" : "student"}>
      <ellipse cx="0" cy="164" rx="63" ry="10" fill="#192b2c" opacity=".55" />
      <path d="M-35 125v39M35 125v39" stroke="#596b68" strokeWidth="5" />
      <rect x="-40" y="52" width="80" height="82" rx="15" fill="#375653" />
      <path d="M-31 103V66c0-26 62-26 62 0v37" fill={index === 1 ? "#c4d7bd" : index === 0 ? "#6c9290" : "#8e9eaf"} />
      <g transform={`translate(${headX} ${headY})`}>
        <rect x="-7" y="29" width="14" height="18" rx="5" fill="#bfaa8c" />
        <ellipse cx="0" cy="16" rx={direction === "Left" || direction === "Right" ? 15 : 20} ry="24" fill="#d0bea2" />
        <path d="M-20 14C-25-17 22-23 21 13c-8-7-23-10-41 1Z" fill={index === 2 ? "#48473e" : "#353c38"} />
        <path d="M-24-13h-8v13M24-13h8v13M-24 47h-8V34M24 47h8V34" stroke={missing ? "#89938b" : index === 1 ? "#c8eea4" : "#96b7ac"} strokeWidth="2" fill="none" strokeDasharray={missing ? "3 3" : undefined} />
      </g>
      <path d="m-56 102 111 0 14 35H-70Z" fill="#9f9b84" />
      <path d="M-70 137H69v7H-70Z" fill="#777864" />
      <path d="m-19 107 34 0 6 20H-25Z" fill="#e7e9d8" />
      <path d="m-15 112 23 0m-22 5 24 0" stroke="#a0aea1" strokeWidth="1.5" />
      <path d="M-29 74q-11 13-12 33l17 7M29 74q12 15 13 32l-17 9" stroke={index === 1 ? "#c4d7bd" : index === 0 ? "#6c9290" : "#8e9eaf"} strokeWidth="12" fill="none" strokeLinecap="round" />
      <g transform="translate(-43 -49)">
        <rect width="86" height="26" rx="5" fill={missing ? "#3b4945" : index === 1 ? "#d0edb5" : "#284a43"} />
        <text x="43" y="17" textAnchor="middle" fill={index === 1 && !missing ? "#244132" : "#d4e3d9"} fontSize="10" fontFamily="Arial, sans-serif">{direction}</text>
      </g>
      <text x="0" y="186" fill="#a3b5a9" fontSize="9" textAnchor="middle" fontFamily="monospace" letterSpacing="1.5">SEAT 0{index + 1}</text>
    </g>
  );
}

export function SessionPreview() {
  const [frameIndex, setFrameIndex] = useState(0);
  const frame = frames[frameIndex];
  return (
    <div className="preview-composition" id="example">
      <div className="preview-orbit orbit-one" aria-hidden="true" />
      <div className="preview-orbit orbit-two" aria-hidden="true" />
      <div className="preview-window">
        <div className="preview-titlebar">
          <span className="window-dots" aria-hidden="true"><i /><i /><i /></span>
          <span>GAZE / SESSION REVIEW</span>
          <ScanLine size={15} aria-hidden="true" />
        </div>
        <div className="scene-heading"><span><i /> Saved session</span><span>CAM 01 <span className="scene-divider">/</span> FIXED VIEW</span></div>
        <div className="scene-wrap">
          <svg viewBox="0 0 520 335" role="img" aria-label={`Illustrated classroom at ${frame.time}. ${frame.directions.map((d, i) => `Seat ${i + 1}: ${d}`).join(". ")}.`}>
            <defs>
              <pattern id="floor-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0v40" fill="none" stroke="#49605a" strokeWidth=".5" /></pattern>
              <radialGradient id="scene-light"><stop stopColor="#40594e" /><stop offset="1" stopColor="#243b35" /></radialGradient>
            </defs>
            <rect width="520" height="335" fill="url(#scene-light)" />
            <path d="M0 96h520v239H0Z" fill="url(#floor-grid)" opacity=".55" />
            <rect x="136" y="13" width="248" height="34" rx="3" fill="#223a33" stroke="#52695a" />
            <text x="260" y="34" fill="#92a890" fontSize="8" textAnchor="middle" letterSpacing="3" fontFamily="monospace">CLASSROOM VIEW</text>
            {frame.directions.map((direction, index) => <Student key={index} index={index} direction={direction} />)}
          </svg>
          <div className="scene-caption"><span>Illustrative example</span><span>{frame.time} / 00:48</span></div>
        </div>
        <div className="preview-controls">
          <span className="timeline-label">EXPLORE A MOMENT</span>
          <div className="timeline-buttons" role="group" aria-label="Example session moments">
            {frames.map((item, index) => <button key={item.time} type="button" aria-pressed={frameIndex === index} onClick={() => setFrameIndex(index)}><span className="timeline-tick" />{item.time}</button>)}
          </div>
          <div className="preview-observation" aria-live="polite" aria-atomic="true">
            <span className="observation-icon">{frameIndex === 2 ? <CircleHelp size={15} /> : frameIndex === 1 ? <ArrowRight size={15} /> : <ArrowLeft size={15} />}</span>
            <p>{frame.description}</p>
          </div>
        </div>
      </div>
      <div className="context-note"><span className="context-check"><Check size={15} /></span><div><strong>Context stays with you.</strong><span>Observations for instructor review</span></div><ChevronRight size={16} /></div>
      <span className="preview-footnote">A simplified illustration, not model output or real footage.</span>
    </div>
  );
}
