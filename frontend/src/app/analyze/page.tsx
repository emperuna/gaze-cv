import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AnalysisWorkspace } from "@/components/analysis-workspace";
import "./workspace.css";

export const metadata: Metadata = {
  title: "Analyze an image or video — GAZE",
  description: "Run local image or saved-video head-direction analysis and review annotated outputs, observations, and processing metadata.",
};

export default function AnalyzePage() {
  return <><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader /><main id="main-content" className="analysis-page container"><div className="analysis-heading"><div><div className="eyebrow"><span className="status-dot" /> LOCAL ANALYSIS WORKSPACE</div><h1>From input <span>to insight.</span></h1><p>Choose an image or saved video. Review the visible head directions, with context.</p></div><span className="workspace-label">IMAGE / VIDEO</span></div><AnalysisWorkspace /></main><footer className="analysis-footer container"><span>Head movement observations support instructor review.</span><a href="/#research">Research & limitations</a></footer></>;
}
