import { ArrowDown, ArrowDownRight, ArrowRight, ArrowUpRight, Camera, Check, ChevronDown, FileImage, FileVideo, Focus, Github, HardDrive, Layers3, LockKeyhole, ScanFace, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { SessionPreview } from "@/components/session-preview";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { HeroTargetCursor } from "@/components/hero-target-cursor";

const repository = "https://github.com/emperuna/gaze-cv";
const workflow = [
  { number: "01", icon: FileVideo, title: "Bring a session into focus.", text: "Choose an image, saved video, or live camera. Use footage you have permission to process.", label: "Choose your input", href: "/analyze", color: "lavender" },
  { number: "02", icon: ScanFace, title: "See what can be observed.", text: "Explore visible head directions. For saved-video seat review, confirm the seats and movement settings first.", label: "Explore the workflow", href: "/analyze?mode=video", color: "butter" },
  { number: "03", icon: Focus, title: "Review the moment in context.", text: "Revisit source timestamps, acknowledge observation gaps, and keep the instructor’s judgment at the center.", label: "Try the example", href: "#example", color: "sky" },
];
const questions = [
  { question: "What does Ocular actually observe?", answer: "Ocular estimates visible head direction: forward, left, right, or down. Unreliable observations are marked unknown. It does not estimate eye gaze, recognize identities, infer intent, or establish misconduct." },
  { question: "Can I use a saved video or a live camera?", answer: "Yes. The local workspace supports images, saved video, and an optional browser camera. Saved-video seat review adds configured seats, timestamped movement events, and local session records. Camera mode provides frame-level head directions without seat histories or recordings." },
  { question: "Where does my footage go?", answer: "Processing runs through the Python prototype on the same computer as the local website. Image and saved-video runs retain files locally; live camera frames stay in memory. Use authorized footage and agree on access, retention, and deletion before a session." },
  { question: "Is the prototype validated for every classroom?", answer: "No. Ocular is a research prototype. Visibility, lighting, camera position, and head size affect results. Classroom generalization, event accuracy, and final held-out evaluation remain under study. The research links below document measurements and limitations." },
];

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="landing-top">
        <SiteHeader />
        <main id="main-content">
          <HeroTargetCursor>
          <section className="ocular-hero container" aria-labelledby="hero-heading">
            <div className="hero-kicker cursor-target"><span className="status-dot" /> A new perspective on classroom review <ArrowUpRight size={13} /></div>
            <h1 id="hero-heading">See the movement.<br />Understand the context.</h1>
            <p className="hero-description">A clearer view of visible head movement. Ocular brings observations<br className="desktop-break" /> together so instructors can give every moment the context it deserves.</p>
            <div className="hero-actions"><Button size="lg" asChild className="soft-button"><a href="/analyze">Open workspace <ArrowRight size={17} /></a></Button><a href="#example" className="hero-secondary">See it in action <ArrowDown size={15} /></a></div>
            <p className="hero-assurance"><LockKeyhole size={12} /> Local processing. Human review, always.</p>
          </section>

          <section id="approach" className="feature-grid container" aria-label="A closer look at Ocular">
            <article className="feature-card input-feature cursor-target">
              <div className="input-icons" aria-label="Supported input sources"><a href="/analyze?mode=image" aria-label="Analyze an image"><FileImage /></a><a href="/analyze?mode=video" aria-label="Review a saved video"><FileVideo /></a><a href="/analyze?mode=camera" aria-label="Open camera analysis"><Camera /></a></div>
              <div><h2>One workspace.<br />Your point of view.</h2><p>An image, a saved session,<br />or a live camera.</p></div>
              <a href="/analyze" className="card-corner-link" aria-label="Explore analysis inputs"><ArrowUpRight size={18} /></a>
            </article>
            <article className="feature-card output-feature cursor-target">
              <a className="hero-portrait-link" href="/analyze" aria-label="Open the Ocular workspace">
                <img src="/images/student-writing-portrait.webp" alt="Illustrative overhead portrait of a university student writing on an answer sheet at a wooden desk" width={1024} height={1536} fetchPriority="high" />
              </a>
              <div className="output-feature-heading"><span className="card-overline">FROM INPUT TO OBSERVATION</span><h2>Your session.<br />Made visible.</h2></div>
            </article>
            <article className="feature-card directions-feature cursor-target">
              <div className="card-topline"><span className="card-overline">VISIBLE HEAD DIRECTION</span><ArrowDownRight size={21} /></div>
              <strong className="feature-number">4<span>directions.</span></strong>
              <p>Forward. Left. Right. Down.<br />And room for the unknown.</p>
            </article>
            <article className="feature-card privacy-feature cursor-target"><div className="privacy-icon"><LockKeyhole size={26} strokeWidth={1.5} /></div><div><h2>Your footage.<br />Your control.</h2><p>Processed on your computer.</p></div></article>
            <article className="feature-card local-feature cursor-target"><HardDrive size={23} strokeWidth={1.5} /><div><h2>Made for<br />a closer look.</h2><p>Return to timestamps.<br />Keep the surrounding context.</p></div></article>
            <article className="feature-card human-feature cursor-target"><span className="card-overline">AIDING OBSERVATION. SUPPORTING PEOPLE.</span><h2>Human judgment.<br />Always at the center.</h2><div className="human-card-bottom"><p>Movement is an observation.<br />Understanding is a human responsibility.</p><ShieldCheck size={39} strokeWidth={1.2} /></div></article>
          </section>
          <div className="principles container" aria-label="Project principles"><span className="cursor-target"><Focus size={19} /> One fixed view</span><span className="cursor-target"><ScanFace size={19} /> Visible directions</span><span className="cursor-target"><Layers3 size={19} /> Timestamped context</span><span className="cursor-target"><ShieldCheck size={19} /> Instructor-led review</span></div>
          </HeroTargetCursor>

          <section id="workflow" className="workflow-section container section-pad" aria-labelledby="workflow-heading">
            <div className="center-heading"><span className="eyebrow">A LITTLE CLARITY GOES A LONG WAY</span><h2 id="workflow-heading">From a moment of movement<br />to a more thoughtful review.</h2><p>One focused workflow. A little more perspective at every step.</p></div>
            <div className="workflow-stack">{workflow.map(({ number, icon: Icon, title, text, label, href, color }) => <article className={`workflow-row ${color}`} key={number}><div className="workflow-identity"><span className="step-icon"><Icon size={23} strokeWidth={1.5} /></span><span className="step-number">{number}</span></div><div className="workflow-copy"><h3>{title}</h3><p>{text}</p></div><a href={href} className="workflow-link">{label}<ArrowUpRight size={15} /></a></article>)}</div>
          </section>

          <section id="example" className="example-section container section-pad" aria-labelledby="example-heading"><div className="example-copy"><span className="eyebrow">EVERY MOMENT HAS MORE TO IT</span><h2 id="example-heading">An observation.<br /><span>Never the whole story.</span></h2><p>A glance to the side. Looking down to write. A moment out of view. Ocular keeps these observations distinct so you can review them with care.</p><ul><li><Check size={16} />Review source time, not processing time</li><li><Check size={16} />Keep missing observations explicit</li><li><Check size={16} />Use seat positions, without recognizing identities</li></ul><a className="text-link" href="/analyze?mode=video">Explore saved-video review <ArrowUpRight size={15} /></a></div><SessionPreview /></section>

          <section className="care-section container" aria-labelledby="care-heading"><div className="care-photo"><img src="/images/classroom-review.png" width={1536} height={1024} loading="lazy" alt="Illustration of university students writing at separate desks" /></div><div className="care-copy"><span className="eyebrow">DESIGNED WITH CARE</span><h2 id="care-heading">People make decisions.<br />Ocular supports the review.</h2><p>Head movement does not establish cheating. Ocular does not infer intent or make disciplinary decisions.</p><div className="care-note"><ShieldCheck size={22} /><p>Use only authorized footage. Agree on access and retention before recording or processing a session.</p></div></div></section>

          <section id="research" className="research-section container section-pad" aria-labelledby="research-heading"><div className="section-heading"><div><span className="eyebrow">OPEN ABOUT WHAT WE KNOW</span><h2 id="research-heading">A working prototype.<br />An ongoing inquiry.</h2></div><p>Built, measured, and still being understood.<br />Explore the evidence behind the interface.</p></div><div className="research-grid"><a href={`${repository}/blob/main/README.md`} target="_blank" rel="noreferrer"><Github size={23} strokeWidth={1.5} /><h3>Explore the source</h3><p>Local setup, supported commands,<br />and the code behind Ocular.</p><ArrowUpRight size={19} /></a><a href={`${repository}/blob/main/docs/checkpoints/cp3-hand-in/README.md`} target="_blank" rel="noreferrer"><Layers3 size={23} strokeWidth={1.5} /><h3>Look into the results</h3><p>Preliminary measurements,<br />comparisons, and known gaps.</p><ArrowUpRight size={19} /></a><a href={`${repository}/blob/main/docs/evaluation/data-card.md`} target="_blank" rel="noreferrer"><FileImage size={23} strokeWidth={1.5} /><h3>Understand the data</h3><p>Sources, permissions, labels,<br />and evaluation limitations.</p><ArrowUpRight size={19} /></a></div><p className="research-footnote">Research prototype: classroom generalization and final held-out evaluation remain unvalidated. Current measurements do not establish that the main method outperforms the baseline.</p></section>

          <section id="faq" className="faq-section container section-pad" aria-labelledby="faq-heading"><div className="center-heading"><span className="eyebrow">A FEW THINGS TO KNOW</span><h2 id="faq-heading">Clarity, before you begin.</h2><p>A closer look at the project, its possibilities, and its limits.</p></div><div className="faq-list">{questions.map(({ question, answer }) => <details key={question}><summary>{question}<ChevronDown size={17} /></summary><p>{answer}</p></details>)}</div></section>

          <section className="closing-section container"><div><span className="eyebrow">OBSERVATION WITH PERSPECTIVE</span><h2>A clearer view starts here.</h2><p>Bring a session. Keep the context.</p></div><Button size="lg" asChild className="soft-button"><a href="/analyze">Open Ocular <ArrowRight size={17} /></a></Button></section>
        </main>
        <footer className="site-footer container"><div><a href="/" aria-label="Ocular home"><Brand /></a><p>Head movement, in context.</p></div><div className="footer-right"><span>A classroom computer vision research project.</span><a href={`${repository}/blob/main/PRD.md`} target="_blank" rel="noreferrer">Scope & limitations <ArrowUpRight size={13} /></a></div></footer>
      </div>
    </>
  );
}
