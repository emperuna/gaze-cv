import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, Clock3, FileVideo, Focus, Github, Layers3, Monitor, ScanFace, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { SessionPreview } from "@/components/session-preview";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

const repository = "https://github.com/emperuna/gaze-cv";
const workflow = [
  { number: "01", icon: FileVideo, title: "Start with a saved view.", text: "Use permitted, prerecorded footage from one fixed camera. Set up the visible seat regions for the session.", detail: "One camera. A stable seating view." },
  { number: "02", icon: ScanFace, title: "Make movement visible.", text: "Estimate head direction and organize observations by seat. Keep timestamps, direction changes, and missing observations in context.", detail: "Forward, left, right, down — or unknown." },
  { number: "03", icon: Clock3, title: "Return to the moments.", text: "Review annotated outputs and timestamped movement records. Consider the surrounding activity before drawing any conclusions.", detail: "The instructor brings the judgment." },
];

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <SiteHeader />
      <main id="main-content">
        <section className="hero container" aria-labelledby="hero-heading">
          <div className="hero-copy">
            <div className="eyebrow"><span className="status-dot" /> A CLASSROOM RESEARCH PROJECT</div>
            <h1 id="hero-heading">See the movement.<br /><span>Keep the context.</span></h1>
            <p className="hero-description">A clearer view of head movement.<br className="desktop-break" /> A thoughtful place for human review.</p>
            <p className="hero-detail">GAZE organizes visible head directions and movement histories to help instructors review a session with more context.</p>
            <div className="hero-actions">
              <Button size="lg" asChild><a href="/analyze">Analyze an image or video <ArrowRight /></a></Button>
              <a className="text-link" href="#example">Explore the example <ArrowUpRight size={15} /></a>
            </div>
            <div className="hero-assurance"><ShieldCheck size={16} /><span>Built for observation. Guided by people.</span></div>
          </div>
          <SessionPreview />
        </section>

        <div className="principles container" aria-label="Project principles">
          <div><Monitor size={20} /><span>Local processing</span></div><span className="principles-divider" />
          <div><Focus size={20} /><span>Seat-based observations</span></div><span className="principles-divider" />
          <div><Layers3 size={20} /><span>Timestamped context</span></div><span className="principles-divider" />
          <div><ShieldCheck size={20} /><span>Human review, always</span></div>
        </div>

        <section id="approach" className="approach-section section-pad" aria-labelledby="approach-heading">
          <div className="container approach-grid">
            <div><div className="eyebrow"><span className="section-number">01 /</span> THE APPROACH</div><h2 id="approach-heading">A head turn is a moment.<br /><span>Understanding it takes context.</span></h2></div>
            <div className="approach-copy"><p>A quick glance. A question. Looking down to write. The same movement can mean many different things.</p><p>GAZE helps make visible movements easier to revisit. It describes what can be observed, while the instructor considers what happened around it.</p><a className="text-link" href={`${repository}/blob/main/PRD.md`} target="_blank" rel="noreferrer">Read the project scope <ArrowUpRight size={15} /></a></div>
          </div>
        </section>

        <section id="workflow" className="workflow-section section-pad container" aria-labelledby="workflow-heading">
          <div className="section-heading"><div><div className="eyebrow"><span className="section-number">02 /</span> THE WORKFLOW</div><h2 id="workflow-heading">From a saved session<br />to a clearer picture.</h2></div><p>A focused workflow for reviewing<br className="desktop-break" /> visible head movements.</p></div>
          <div className="workflow-grid">
            {workflow.map(({ number, icon: Icon, title, text, detail }) => <article className="workflow-step" key={number}><div className="step-top"><span className="step-icon"><Icon size={25} strokeWidth={1.5} /></span><span className="step-number">{number}</span></div><h3>{title}</h3><p>{text}</p><div className="step-detail"><span />{detail}</div></article>)}
          </div>
          <div className="workflow-note"><span className="small-tag">GOOD TO KNOW</span><p>The Analyze workspace runs the automatic image/video workflow through the local Python prototype. Seat-based review remains a separate configured command.</p><ArrowDown size={17} aria-hidden="true" /></div>
        </section>

        <section className="human-section container" aria-labelledby="human-heading">
          <div className="human-visual" aria-hidden="true"><div className="human-ring ring-outer" /><div className="human-ring ring-inner" /><div className="human-icon"><ShieldCheck size={50} strokeWidth={1.25} /></div><span className="orbit-label label-observe"><span /> Observe</span><span className="orbit-label label-context"><span /> Context</span><span className="orbit-label label-review"><span /> Review</span><span className="visual-coordinate">HUMAN JUDGMENT AT THE CENTER</span></div>
          <div className="human-copy"><div className="eyebrow">DESIGNED WITH CARE</div><h2 id="human-heading">People make decisions.<br /><span>GAZE supports the review.</span></h2><p>Head movement does not establish cheating. GAZE does not infer intent or make disciplinary decisions.</p><ul><li><Check size={16} />Seat positions, without identity recognition</li><li><Check size={16} />Observation gaps kept explicit</li><li><Check size={16} />Local processing for the prototype</li></ul><span className="human-footnote">Use only authorized footage and agree on access and retention.</span></div>
        </section>

        <section id="research" className="research-section section-pad container" aria-labelledby="research-heading">
          <div className="section-heading"><div><div className="eyebrow"><span className="section-number">03 /</span> WORK IN PROGRESS</div><h2 id="research-heading">Research you can look into.</h2></div><p>A working prototype.<br />An ongoing evaluation.</p></div>
          <div className="research-grid"><div className="research-status"><span className="research-badge"><span className="status-dot" /> RESEARCH PROTOTYPE</span><h3>Built. Measured.<br />Still being understood.</h3><p>The CPU prototype processes images and saved video, produces direction labels, and supports configured seat histories and movement records.</p><p>Classroom generalization, event accuracy, and the final held-out evaluation remain unvalidated. Current measurements do not establish that the main method outperforms the baseline.</p></div><div className="research-resources"><a href={`${repository}/blob/main/README.md`} target="_blank" rel="noreferrer"><span className="resource-icon"><Github size={22} /></span><div><h3>Explore the prototype</h3><p>Source code, local setup, and supported commands.</p></div><ArrowUpRight size={20} /></a><a href={`${repository}/blob/main/docs/checkpoints/cp3-hand-in/README.md`} target="_blank" rel="noreferrer"><span className="resource-icon"><BookOpen size={22} /></span><div><h3>Read the evidence</h3><p>Preliminary results, comparisons, and known gaps.</p></div><ArrowUpRight size={20} /></a><a href={`${repository}/blob/main/docs/evaluation/data-card.md`} target="_blank" rel="noreferrer"><span className="resource-icon"><Layers3 size={22} /></span><div><h3>Understand the data</h3><p>Sources, permissions, labels, and evaluation limits.</p></div><ArrowUpRight size={20} /></a></div></div>
        </section>

        <section className="closing-section"><div className="container closing-inner"><div><span className="eyebrow">OBSERVATION WITH PERSPECTIVE</span><h2>More context.<br /><span>More considered review.</span></h2></div><Button size="lg" asChild><a href={repository} target="_blank" rel="noreferrer">Explore GAZE on GitHub <ArrowUpRight /></a></Button></div></section>
      </main>
      <footer className="site-footer container"><div><a href="#" aria-label="GAZE home"><Brand /></a><p>Head movement, in context.</p></div><div className="footer-right"><span>A classroom computer vision research project.</span><a href={`${repository}/blob/main/PRD.md`} target="_blank" rel="noreferrer">Scope & limitations <ChevronRight size={14} /></a></div></footer>
    </>
  );
}
