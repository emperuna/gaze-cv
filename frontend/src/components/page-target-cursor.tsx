"use client";

import TargetCursor from "@/components/target-cursor";

// Camera-style reticle for the whole landing page (fine pointers only; touch keeps the system cursor).
// It frames anything marked `.cursor-target` like a viewfinder focusing on a subject, and snaps to
// links and buttons; a link inside a card wins over the card because the nearest match is used.
export function PageTargetCursor() {
  return (
    <TargetCursor
      targetSelector="a[href], button:enabled, summary, .cursor-target"
      spinDuration={2}
      hideDefaultCursor
      parallaxOn
      thickness={2}
    />
  );
}
