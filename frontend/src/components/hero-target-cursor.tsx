"use client";

import { useRef, type ReactNode } from "react";
import TargetCursor from "@/components/target-cursor";

export function HeroTargetCursor({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="hero-target-cursor-region">
      {children}
      <TargetCursor
        container={containerRef}
        targetSelector=".cursor-target, a, button"
        spinDuration={2}
        hideDefaultCursor
        parallaxOn
        thickness={2}
      />
    </div>
  );
}
