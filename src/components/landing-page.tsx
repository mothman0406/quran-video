import Link from "next/link";
import type { MarketingQuranDemo } from "@/lib/landing/marketing-demo";

type LandingPageProps = { demos: MarketingQuranDemo[] };

const features = [
  ["Quran-aware detection", "Identify a recited passage before you begin editing."],
  ["Canonical Quran text", "Captions resolve from the Quran corpus used by the editor."],
  ["Word-level synchronization", "Keep the Quran text aligned with the recitation."],
  ["Built-in translations", "Add a readable translation alongside the Arabic."],
  ["Read-so-far highlighting", "Guide viewers through each word as the recitation progresses."],
  ["Long-ayah handling", "Keep lengthy ayat clear with Quran-aware display splitting."],
  ["Visual subtitle editor", "Refine typography, placement, timing, and layout in one workspace."],
  ["Local & YouTube import", "Start with media from your device or a supported YouTube link."],
  ["Export up to 4K", "Render a finished video in 720p, 1080p, or 4K."],
] as const;

const workflow = [
  ["01", "Upload", "Bring in a video, an audio file, or a YouTube link."],
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

function ProductCard({ arabic, variant, label }: { arabic: string; variant: string; label: string }) {
  return <article className={`landing-video-card landing-video-card-${variant}`}>
    <div className="landing-card-topline"><span>RECITATION</span><i /><span>00:18</span></div>
    <div className="landing-card-caption"><QuranCaption arabic={arabic} highlighted={variant === "highlight"} /><p className="landing-card-translation">A caption treatment made for Quran recitation.</p></div>
    <div className="landing-card-label">{label}</div>
  </article>;
}

export default function LandingPage({ demos }: LandingPageProps) {
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
      <div className="landing-hero-stage" aria-label="Examples of Quran video captions">
        <ProductCard arabic={morning.arabic} variant="minimal" label="Arabic focused" />
        <ProductCard arabic={night.arabic} variant="translation" label="Arabic + translation" />
        <ProductCard arabic={unity.arabic} variant="highlight" label="Read-so-far highlight" />
      </div>
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
      <div className="landing-section-heading"><p className="landing-eyebrow">Edit with clarity</p><h2 id="editor-title">One focused workspace for the finishing work.</h2><p>Preview your video, refine Quran captions, and work directly with the timeline.</p></div>
      <div className="landing-editor-mockup" aria-label="Illustration of the Quran Video editor">
        <div className="landing-editor-mockup-top"><span className="landing-brand-mark-small">۝</span><b>Quran Video</b><span className="landing-editor-project">Untitled project</span><button type="button" tabIndex={-1}>Export</button></div>
        <div className="landing-editor-mockup-body"><aside><span>MEDIA</span><b>↑ Import</b><small>Video or audio</small><hr /><span>PROJECT ASSETS</span><small>Local source</small></aside><div className="landing-editor-canvas"><div className="landing-editor-video"><QuranCaption arabic={night.arabic} highlighted /><p>And by the night when it covers.</p></div><div className="landing-editor-timeline"><i /><i /><i className="landing-timeline-active" /><i /></div></div><aside className="landing-editor-inspector"><span>SUBTITLES</span><b>Arabic</b><small>Typography</small><small>Translation</small><small>Timing</small></aside></div>
      </div>
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
      <div className="landing-section-heading"><p className="landing-eyebrow">Make it yours</p><h2 id="showcase-title">A few directions, one Quran-aware foundation.</h2></div>
      <div className="landing-showcase-grid"><ProductCard arabic={morning.arabic} variant="minimal" label="Minimal" /><ProductCard arabic={night.arabic} variant="translation" label="Translation" /><ProductCard arabic={unity.arabic} variant="highlight" label="Lime highlight" /><ProductCard arabic={eternal.arabic} variant="clean" label="Clean recitation" /></div>
    </section>

    <section className="landing-final-cta" aria-labelledby="final-title"><p className="landing-eyebrow">Ready when you are</p><h2 id="final-title">Turn your recitation into a finished Quran video.</h2><p>No sign-up required to start.</p><Link className="landing-primary-cta" href="/editor">Start creating free <span aria-hidden="true">→</span></Link></section>

    <footer className="landing-footer"><Link className="landing-brand" href="/"><span>۝</span><b>Quran Video</b></Link><p>© {year} Quran Video</p><p>Built for Quran recitation.</p></footer>
  </main>;
}
