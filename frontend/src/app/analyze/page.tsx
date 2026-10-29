import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AnalysisModes } from "@/components/analysis-modes";
import "./workspace.css";

export const metadata: Metadata = {
  title: "Analyze images, video, or a camera — GAZE",
  description: "Run local image, saved-video, or live-camera head-direction analysis.",
};

export default function AnalyzePage() {
  return <><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader /><main id="main-content" className="analysis-page container"><div className="analysis-heading"><div><div className="eyebrow"><span className="status-dot" /> LOCAL ANALYSIS WORKSPACE</div><h1>From input <span>to insight.</span></h1><p>Choose an image, saved video, or camera. Review the visible head directions, with context.</p></div><span className="workspace-label">LOCAL ANALYSIS</span></div><AnalysisModes /></main><footer className="analysis-footer container"><span>Head movement observations support instructor review.</span><a href="/#research">Research & limitations</a></footer></>;
}
