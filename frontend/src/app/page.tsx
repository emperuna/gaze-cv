import { ArrowDown, ArrowDownRight, ArrowRight, ArrowUpRight, Camera, ChevronDown, FileImage, Focus, Github, HardDrive, Laptop, Layers3, LockKeyhole, ScanFace, ShieldCheck, Smartphone } from "lucide-react";
import { Brand } from "@/components/brand";
import { SessionPreview } from "@/components/session-preview";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { PageTargetCursor } from "@/components/page-target-cursor";

const repository = "https://github.com/emperuna/gaze-cv";
const workflow = [
  { number: "01", icon: Camera, title: "Set up the camera.", text: "Mount a phone where it sees every seat and connect it to your laptop as a webcam.", label: "Open the workspace", href: "/analyze", color: "lavender" },
  { number: "02", icon: ScanFace, title: "Mark the seats.", text: "Capture a frame and draw a box around each seat. Adjust how long or how often a turn must happen.", label: "Open the workspace", href: "/analyze", color: "butter" },
  { number: "03", icon: Focus, title: "Check the seat, then decide.", text: "Alerts name the seat to look at. Mark each one Checked or Dismissed, then download the report.", label: "Try the example", href: "#example", color: "sky" },
];
const questions = [
  { question: "What does Ocular actually observe?", answer: "Ocular estimates visible head direction: forward, left, right, or down. Unreliable observations are marked unknown. It does not estimate eye gaze, recognize identities, infer intent, or establish misconduct." },
  { question: "What do I need?", answer: "A laptop running Ocular, a phone on a stand, and a webcam app such as Camo on both. You can also review a recorded clip with the same seat rules." },
  { question: "Where does my footage go?", answer: "Frames are processed on your laptop and not recorded. Each alert keeps one cropped still of that seat, saved on the laptop and included in the PDF you download. Delete the session when you no longer need it, and agree on consent and retention before using Ocular with students." },
  { question: "Is the prototype validated for every classroom?", answer: "No. Ocular is a research prototype. Visibility, lighting, camera position, and head size affect results. Alert accuracy in real classrooms has not been measured. Classroom generalization, event accuracy, and final held-out evaluation remain under study. The research links below document measurements and limitations." },
];

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="landing-top">
        <SiteHeader />
        <main id="main-content">
          <section className="ocular-hero container" aria-labelledby="hero-heading">
            <div className="hero-kicker cursor-target"><span className="status-dot" /> A new perspective on classroom review</div>
            <h1 id="hero-heading">See the movement. <br />Understand <span className="keep">the context.</span></h1>
            <p className="hero-description">A live view of visible head movement. Ocular watches every seat from<br className="desktop-break" /> one fixed camera and tells you which seat to check, so your judgment goes where it is needed.</p>
            <div className="hero-actions"><Button size="lg" asChild className="soft-button"><a href="/analyze">Open workspace <ArrowRight size={17} /></a></Button><a href="#example" className="hero-secondary">See it in action <ArrowDown size={15} /></a></div>
            <p className="hero-assurance"><LockKeyhole size={12} /> Local processing. Human review, always.</p>
          </section>

          <section id="approach" className="feature-grid container" aria-label="A closer look at Ocular">
            <article className="feature-card input-feature cursor-target">
              <div className="input-icons" aria-label="Camera setup"><a href="/analyze" aria-label="Open the workspace, phone camera"><Smartphone /></a><a href="/analyze" aria-label="Open the workspace, laptop dashboard"><Laptop /></a></div>
              <div><h2>One camera. <br />Every <span className="keep">seat.</span></h2><p>Mount a phone at the front. <br />Watch from your laptop.</p></div>
              <a href="/analyze" className="card-corner-link" aria-label="Open the workspace"><ArrowUpRight size={18} /></a>
            </article>
            <article className="feature-card output-feature cursor-target">
              <a className="hero-portrait-link" href="/analyze" aria-label="Open the Ocular workspace">
                <img src="/images/student-writing-portrait.webp" srcSet="/images/student-writing-portrait-600.webp 600w, /images/student-writing-portrait.webp 1024w" sizes="(max-width: 640px) 46vw, (max-width: 900px) 48vw, 300px" alt="Illustrative overhead portrait of a university student writing on an answer sheet at a wooden desk" width={1024} height={1536} />
              </a>
              <div className="output-feature-heading"><span className="card-overline">FROM CAMERA TO ALERT</span><h2>Your session. <br />Made visible.</h2></div>
            </article>
            <article className="feature-card directions-feature cursor-target">
              <div className="card-topline"><span className="card-overline">VISIBLE HEAD DIRECTION</span><ArrowDownRight size={21} /></div>
              <strong className="feature-number">4<span>directions.</span></strong>
              <p>Forward. Left. Right. Down. <br />And room for the unknown.</p>
            </article>
            <article className="feature-card privacy-feature cursor-target"><div className="privacy-icon"><LockKeyhole size={26} strokeWidth={1.5} /></div><div><h2>Your footage. <br />Your control.</h2><p>Processed on your laptop. Only alert stills are kept.</p></div></article>
            <article className="feature-card local-feature cursor-target"><HardDrive size={23} strokeWidth={1.5} /><div><h2>Made for <br />a closer look.</h2><p>A prompt, not a verdict. Each alert <br />names a seat and keeps one still for review.</p></div></article>
            <article className="feature-card human-feature cursor-target"><span className="card-overline">AIDING OBSERVATION. SUPPORTING PEOPLE.</span><h2>Human judgment. <br />Always at the center.</h2><div className="human-card-bottom"><p>Movement is an observation. <br />Understanding is a human responsibility.</p><ShieldCheck size={39} strokeWidth={1.2} /></div></article>
          </section>

          <section id="workflow" className="workflow-section container section-pad" aria-labelledby="workflow-heading">
            <div className="center-heading"><span className="eyebrow">A LITTLE CLARITY GOES A LONG WAY</span><h2 id="workflow-heading">From a moment of movement <br className="desktop-break" />to a more thoughtful review.</h2><p>One focused workflow. A little more perspective at every step.</p></div>
            <div className="workflow-stack">{workflow.map(({ number, icon: Icon, title, text, label, href, color }) => <article className={`workflow-row ${color} cursor-target`} key={number}><div className="workflow-identity"><span className="step-icon"><Icon size={23} strokeWidth={1.5} /></span><span className="step-number">{number}</span></div><div className="workflow-copy"><h3>{title}</h3><p>{text}</p></div><a href={href} className="workflow-link">{label}<ArrowUpRight size={15} /></a></article>)}</div>
          </section>

          <section id="example" className="example-section container section-pad" aria-labelledby="example-heading"><div className="section-heading"><div><span className="eyebrow">EVERY MOMENT HAS MORE TO IT</span><h2 id="example-heading">An observation. <br /><span>Never the whole story.</span></h2></div><a className="text-link" href="/analyze">Open the live dashboard <ArrowUpRight size={15} /></a></div><SessionPreview /></section>

          <section className="care-section container" aria-labelledby="care-heading"><div className="care-photo cursor-target"><img src="/images/classroom-review.webp" srcSet="/images/classroom-review-800.webp 800w, /images/classroom-review.webp 1536w" sizes="(max-width: 640px) calc(100vw - 36px), 520px" width={1536} height={1024} loading="lazy" alt="Illustration of university students writing at separate desks" /></div><div className="care-copy"><span className="eyebrow">DESIGNED WITH CARE</span><h2 id="care-heading">People make decisions. <br />Ocular supports <span className="keep">the review.</span></h2><p>Head movement does not establish cheating. Ocular does not infer intent or make disciplinary decisions.</p><div className="care-note cursor-target"><ShieldCheck size={22} /><p>Agree on consent, access and retention before a live session. Alert stills show students.</p></div></div></section>

          <section id="research" className="research-section container section-pad" aria-labelledby="research-heading"><div className="section-heading"><div><span className="eyebrow">OPEN ABOUT WHAT WE KNOW</span><h2 id="research-heading">A working prototype. <br />An ongoing inquiry.</h2></div><p>Built, measured, and still being understood. <br className="desktop-break" />Explore the evidence behind the interface.</p></div><div className="research-grid"><a href={`${repository}/blob/main/README.md`} target="_blank" rel="noreferrer"><Github size={23} strokeWidth={1.5} /><h3>Explore the source</h3><p>Local setup, supported commands, <br className="desktop-break" />and the code behind Ocular.</p><ArrowUpRight size={19} /></a><a href={`${repository}/blob/main/docs/checkpoints/cp4-hand-in/README.md`} target="_blank" rel="noreferrer"><Layers3 size={23} strokeWidth={1.5} /><h3>Look into the results</h3><p>Preliminary measurements, <br className="desktop-break" />comparisons, and known gaps.</p><ArrowUpRight size={19} /></a><a href={`${repository}/blob/main/docs/evaluation/data-card.md`} target="_blank" rel="noreferrer"><FileImage size={23} strokeWidth={1.5} /><h3>Understand the data</h3><p>Sources, permissions, labels, <br className="desktop-break" />and evaluation limitations.</p><ArrowUpRight size={19} /></a></div><p className="research-footnote">Research prototype: classroom generalization and final held-out evaluation remain unvalidated. Current measurements do not establish that the main method outperforms the baseline.</p></section>

          <section id="faq" className="faq-section container section-pad" aria-labelledby="faq-heading"><div className="center-heading"><span className="eyebrow">A FEW THINGS TO KNOW</span><h2 id="faq-heading">Clarity, before you begin.</h2><p>A closer look at the project, its possibilities, and its limits.</p></div><div className="faq-list">{questions.map(({ question, answer }) => <details key={question}><summary>{question}<ChevronDown size={17} /></summary><p>{answer}</p></details>)}</div></section>

          <section className="closing-section container cursor-target"><div><span className="eyebrow">OBSERVATION WITH PERSPECTIVE</span><h2>A clearer view starts here.</h2><p>Bring a session. Keep the context.</p></div><Button size="lg" asChild className="soft-button"><a href="/analyze">Open Ocular <ArrowRight size={17} /></a></Button></section>
        </main>
        <footer className="site-footer container"><div><a href="/" aria-label="Ocular home"><Brand /></a><p>Head movement, in context.</p></div><div className="footer-right"><span>A classroom computer vision research project.</span><a href={`${repository}/blob/main/PRD.md`} target="_blank" rel="noreferrer">Scope & limitations <ArrowUpRight size={13} /></a></div></footer>
      </div>
      <PageTargetCursor />
    </>
  );
}
