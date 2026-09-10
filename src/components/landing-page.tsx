import Link from "next/link";
import Image from "next/image";
import type { MarketingQuranDemo } from "@/lib/landing/marketing-demo";
import { LANDING_SHOWCASE, type LandingShowcaseAsset } from "@/lib/landing/showcase-assets";

type LandingPageProps = { demos: MarketingQuranDemo[]; showcaseAssets: LandingShowcaseAsset[] };

const features = [
  ["Quran-aware detection", "Identify a recited passage before you begin editing."],
  ["Canonical Quran text", "Captions resolve from the Quran corpus used by the editor."],
  ["Word-level synchronization", "Keep the Quran text aligned with the recitation."],
  ["Built-in translations", "Add a readable translation alongside the Arabic."],
  ["Read-so-far highlighting", "Guide viewers through each word as the recitation progresses."],
  ["Long-ayah handling", "Keep lengthy ayat clear with Quran-aware display splitting."],
  ["Visual subtitle editor", "Refine typography, placement, timing, and layout in one workspace."],
  ["Local media import", "Start with video or audio from your device."],
  ["Export up to 4K", "Render a finished video in 720p, 1080p, or 4K."],
] as const;

const workflow = [
  ["01", "Upload", "Bring in a video or audio file from your device."],
  ["02", "Quran detected", "Identify the passage and align canonical words to the recitation."],
  ["03", "Customize", "Tune styling, translation, word highlighting, timing, and layout."],
  ["04", "Export", "Choose 720p, 1080p, or 4K and download the finished video."],
] as const;

const comparisons = [
  ["Caption source", "Generic transcription", "Canonical Quran alignment"],
  ["Passage workflow", "Manual Quran setup", "Quran-aware detection"],
  ["Word timing", "General caption timing", "Word-level synchronization"],
  ["Long ayat", "Manual line management", "Quran-aware display splitting"],
  ["Translation", "Added separately", "Built into the caption workflow"],
  ["Finishing", "General subtitle editing", "Quran-specific visual editing"],
] as const;

function QuranCaption({ arabic, highlighted = false }: { arabic: string; highlighted?: boolean }) {
  const words = arabic.split(/\s+/u);
  return <p className="landing-arabic" dir="rtl" lang="ar">{words.map((word, index) => <span className={highlighted && index < Math.ceil(words.length * 0.55) ? "landing-word-highlight" : undefined} key={`${word}-${index}`}>{word} </span>)}</p>;
}

function FinishedVideoFallback({ arabic, style }: { arabic: string; style: (typeof LANDING_SHOWCASE)[number]["id"] }) {
  return <div className={`landing-finished-example landing-finished-example-${style}`}>
    {style === "minimal" && <QuranCaption arabic={arabic} />}
    {style === "translation" && <><QuranCaption arabic={arabic} /><p className="landing-finished-translation">Translation in a balanced bilingual layout.</p></>}
    {style === "highlight" && <QuranCaption arabic={arabic} highlighted />}
    {style === "cinematic" && <><span className="landing-verse-reference">112:1</span><QuranCaption arabic={arabic} /></>}
  </div>;
}

function FinishedVideoExample({ example, arabic, asset }: { example: (typeof LANDING_SHOWCASE)[number]; arabic: string; asset?: LandingShowcaseAsset }) {
  return <article className="landing-showcase-card">
    <div className="landing-showcase-frame">
      {asset ? <Image src={asset.src} alt={`${example.title} finished Quran video example`} width={1080} height={1920} sizes="(max-width: 600px) 78vw, (max-width: 850px) 42vw, 270px" /> : <FinishedVideoFallback arabic={arabic} style={example.id} />}
    </div>
    <div className="landing-showcase-copy"><h3>{example.title}</h3><p>{example.description}</p><span>{example.chip}</span></div>
  </article>;
}

function EditorScreenshot({ priority = false, className = "" }: { priority?: boolean; className?: string }) {
  return <Image className={className} src="/landing/editor-demo.png" alt="Quran Video Editor showing a vertical recitation video, synchronized Quran captions, timeline, waveform, and subtitle controls." width={1649} height={954} priority={priority} sizes="(max-width: 600px) 100vw, (max-width: 1180px) calc(100vw - 48px), 1180px" />;
}

export default function LandingPage({ demos, showcaseAssets }: LandingPageProps) {
  const [morning, night, unity, eternal] = demos;
  const year = new Date().getFullYear();

  return <main className="landing-page">
    <header className="landing-header">
      <Link className="landing-brand" href="/" aria-label="Quran Video home"><span>۝</span><b>Quran Video</b></Link>
      <nav className="landing-nav" aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#features">Features</a></nav>
      <Link className="landing-header-cta" href="/editor">Start creating <span aria-hidden="true">↗</span></Link>
    </header>

    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-hero-copy">
        <p className="landing-eyebrow"><span />Made for Quran recitation</p>
        <h1 id="landing-title">Beautiful Quran captions,<br />automatically synced to your recitation.</h1>
        <p className="landing-lede">Upload your recitation and get canonical Quran text, translation, word-level synchronization, and a video ready to edit and export.</p>
        <div className="landing-actions"><Link className="landing-primary-cta" href="/editor">Start creating free <span aria-hidden="true">→</span></Link><a className="landing-secondary-cta" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a></div>
        <p className="landing-microcopy">No sign-up required to start.</p>
      </div>
      <div className="landing-hero-editor"><EditorScreenshot priority /></div>
    </section>

    <section className="landing-proof" aria-label="Product qualities"><p><b>Quran-first</b> captions</p><span /><p><b>Local-first</b> recognition</p><span /><p><b>Up to 4K</b> export</p></section>

    <section className="landing-section landing-workflow" id="how-it-works" aria-labelledby="workflow-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">From source to finished video</p><h2 id="workflow-title">A clear Quran video workflow.</h2><p>Everything starts in the editor—without an account wall in the way.</p></div>
      <ol className="landing-workflow-list">{workflow.map(([number, title, detail]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{detail}</p></div></li>)}</ol>
    </section>

    <section className="landing-section landing-before-after" aria-labelledby="before-after-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">From raw to ready</p><h2 id="before-after-title">Give a recitation the presentation it deserves.</h2><p>Use the same source frame, then bring in Quran text, translation, and word guidance.</p></div>
      <div className="landing-comparison-visuals">
        <article className="landing-before-card"><span className="landing-card-kicker">Before</span><div className="landing-raw-video"><span>RAW SOURCE</span><i /></div><p>Recitation video, ready to work with.</p></article>
        <span className="landing-before-after-arrow" aria-hidden="true">→</span>
        <article className="landing-after-card"><span className="landing-card-kicker">After</span><div className="landing-finished-video"><QuranCaption arabic={eternal.arabic} highlighted /><p>Translation ready for your editor.</p><span>112:1</span></div><p>Canonical text and editable video captions.</p></article>
      </div>
    </section>

    <section className="landing-section landing-editor-showcase" aria-labelledby="editor-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">Edit with clarity</p><h2 id="editor-title">Everything you need to finish the video.</h2><p>Preview your video, refine Quran captions, and work directly with the timeline.</p></div>
      <div className="landing-editor-product-shot"><EditorScreenshot /></div>
      <div className="landing-editor-detail-grid"><article><div className="landing-editor-detail-crop landing-editor-detail-preview"><EditorScreenshot /></div><h3>Word-level highlighting</h3><p>Guide viewers through the active words as the recitation progresses.</p></article><article><div className="landing-editor-detail-crop landing-editor-detail-timeline"><EditorScreenshot /></div><h3>Quran-aware timeline</h3><p>See caption blocks, video, and waveform together while you refine timing.</p></article><article><div className="landing-editor-detail-crop landing-editor-detail-inspector"><EditorScreenshot /></div><h3>Full subtitle control</h3><p>Adjust translation, typography, highlighting, and placement in context.</p></article></div>
    </section>

    <section className="landing-section landing-features" id="features" aria-labelledby="features-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">Built for the details</p><h2 id="features-title">Tools shaped around Quran video.</h2><p>Purposeful capabilities for a task that generic captioning tools only partially cover.</p></div>
      <div className="landing-feature-grid">{features.map(([title, detail], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{detail}</p></article>)}</div>
      <div className="landing-local-note"><span>◌</span><div><b>Recognition stays close to your work.</b><p>Quran recognition and timing run in your browser. There is no per-video recognition API, and source media stays local by default.</p></div></div>
    </section>

    <section className="landing-section landing-compare" aria-labelledby="compare-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">Why Quran-aware matters</p><h2 id="compare-title">More context at every caption decision.</h2></div>
      <div className="landing-compare-table" role="table" aria-label="Generic captioning compared with Quran-aware editing"><div className="landing-compare-row landing-compare-head" role="row"><span role="columnheader">Workflow</span><span role="columnheader">Generic caption editor</span><span role="columnheader">Quran Video</span></div>{comparisons.map(([label, generic, quran]) => <div className="landing-compare-row" role="row" key={label}><b role="rowheader">{label}</b><span role="cell">{generic}</span><span role="cell">{quran}</span></div>)}</div>
    </section>

    <section className="landing-section landing-showcase" aria-labelledby="showcase-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">Make it yours</p><h2 id="showcase-title">One recitation. Make it yours.</h2><p>Choose how Quran text, translation, highlighting, and layout appear in the finished video.</p></div>
      <div className="landing-showcase-grid">{LANDING_SHOWCASE.map((example, index) => <FinishedVideoExample key={example.id} example={example} arabic={[morning, night, unity, eternal][index].arabic} asset={showcaseAssets.find((asset) => asset.id === example.id)} />)}</div>
    </section>

    <section className="landing-final-cta" aria-labelledby="final-title"><p className="landing-eyebrow">Ready when you are</p><h2 id="final-title">Turn your recitation into a finished Quran video.</h2><p>No sign-up required to start.</p><Link className="landing-primary-cta" href="/editor">Start creating free <span aria-hidden="true">→</span></Link></section>

    <footer className="landing-footer"><Link className="landing-brand" href="/"><span>۝</span><b>Quran Video</b></Link><p>© {year} Quran Video</p><p>Built for Quran recitation.</p></footer>
  </main>;
}
