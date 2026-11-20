import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AnalysisModes } from "@/components/analysis-modes";
import "./workspace.css";

export const metadata: Metadata = {
  title: "Your workspace — Ocular",
  description: "Live seat alerts from one fixed camera, on your device.",
};

export default function AnalyzePage() {
  return <><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader /><main id="main-content" className="analysis-page container"><div className="analysis-heading"><div><div className="eyebrow"><span className="status-dot" /> YOUR OCULAR WORKSPACE</div><h1>A closer look.<br /><span>A little more context.</span></h1><p>Ocular points to a seat. You decide.</p></div><span className="workspace-label">ON YOUR DEVICE</span></div><AnalysisModes /></main><footer className="analysis-footer container"><span>Ocular · Head movement observations support instructor review.</span><a href="/#research">Research & limitations</a></footer></>;
}
