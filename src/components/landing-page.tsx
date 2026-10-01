import Link from "next/link";
import Image from "next/image";
import LandingAuthActions from "@/components/landing-auth-actions";
import { LANDING_SHOWCASE } from "@/lib/landing/showcase-assets";

type LandingPageProps = { authenticated: boolean };

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

function FinishedVideoExample({ example }: { example: (typeof LANDING_SHOWCASE)[number] }) {
  return <article className="landing-showcase-card">
    <div className="landing-showcase-frame">
      <Image src={example.src} alt={example.alt} width={1080} height={1920} sizes="(max-width: 600px) 44vw, (max-width: 850px) 42vw, 280px" />
    </div>
    <div className="landing-showcase-copy"><h3>{example.title}</h3><p>{example.description}</p><span>{example.chip}</span></div>
  </article>;
}

function EditorScreenshot({ priority = false }: { priority?: boolean }) {
  return <Image src="/landing/demo/hero-editor.png" alt="QuranCaptions editor with Arabic captions, translation and ayah timeline" width={2048} height={1182} priority={priority} sizes="(max-width: 600px) calc(100vw - 32px), (max-width: 1200px) calc(100vw - 48px), 1200px" />;
}

export default function LandingPage({ authenticated }: LandingPageProps) {
  const year = new Date().getFullYear();

  return <main className="landing-page">
    <header className="landing-header">
      <Link className="landing-brand" href="/" aria-label="Quran AutoCaption home"><span>۝</span><b>Quran AutoCaption</b></Link>
      <nav className="landing-nav" aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#features">Features</a></nav>
      <LandingAuthActions authenticated={authenticated} />
    </header>

    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-hero-copy">
        <p className="landing-eyebrow"><span />Made for Quran recitation</p>
        <h1 id="landing-title">Beautiful Quran captions, <br />automatically synced to your recitation.</h1>
        <p className="landing-lede">Upload your recitation and get canonical Quran text, translation, word-level synchronization, and a video ready to edit and export.</p>
        <div className="landing-actions"><Link className="landing-primary-cta" href="/create">Start creating free <span aria-hidden="true">→</span></Link><a className="landing-secondary-cta" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a></div>
        <p className="landing-microcopy">No sign-up required to start.</p>
      </div>
      <div className="landing-hero-editor"><EditorScreenshot priority /></div>
    </section>

    <section className="landing-proof" aria-label="Product qualities"><p><b>Quran-first</b> captions</p><span /><p><b>Local-first</b> recognition</p><span /><p><b>Up to 4K</b> export</p></section>

    <section className="landing-section landing-workflow" id="how-it-works" aria-labelledby="workflow-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">From source to finished video</p><h2 id="workflow-title">A clear Quran video workflow.</h2><p>Start with a focused setup flow—without an account wall in the way.</p></div>
      <ol className="landing-workflow-list">{workflow.map(([number, title, detail]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{detail}</p></div></li>)}</ol>
    </section>

    <section className="landing-section landing-before-after" aria-labelledby="before-after-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">From raw to ready</p><h2 id="before-after-title">Give a recitation the presentation it deserves.</h2><p>Use the same source frame, then bring in Quran text, translation, and word guidance.</p></div>
      <div className="landing-comparison-visuals">
        <article className="landing-before-card"><span className="landing-card-kicker">Before</span><div className="landing-comparison-frame"><Image src="/landing/demo/before-landscape.png" alt="Original Quran recitation footage before captions" width={1920} height={1080} sizes="(max-width: 600px) calc(100vw - 62px), (max-width: 1200px) calc((100vw - 138px) / 2), 535px" /></div><p>Recitation video, ready to work with.</p></article>
        <span className="landing-before-after-arrow" aria-hidden="true">→</span>
        <article className="landing-after-card"><span className="landing-card-kicker">After</span><div className="landing-comparison-frame"><Image src="/landing/demo/after-landscape.png" alt="Quran recitation with Arabic captions and English translation" width={1920} height={1080} sizes="(max-width: 600px) calc(100vw - 62px), (max-width: 1200px) calc((100vw - 138px) / 2), 535px" /></div><p>Canonical text and editable video captions.</p></article>
      </div>
      <p className="landing-demo-credit">Recitation: <a href="https://www.youtube.com/watch?v=Pah1-oBpq58" target="_blank" rel="noreferrer">Ibrahim Al Gambi, Taraweeh (Surah Ar-Rahman)</a>, licensed CC BY. Clipped and captioned with QuranCaptions.</p>
    </section>

    <section className="landing-section landing-editor-showcase" aria-labelledby="editor-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">Edit with clarity</p><h2 id="editor-title">Everything you need to finish the video.</h2><p>Preview your video, refine Quran captions, and work directly with the timeline.</p></div>
      <div className="landing-editor-product-shot"><EditorScreenshot /></div>
      <div className="landing-editor-detail-grid"><article><div className="landing-editor-detail-crop"><Image src="/landing/demo/feature-word-highlighting.png" alt="Arabic and English captions with word-level highlighting in the QuranCaptions preview" width={630} height={352} sizes="(max-width: 600px) calc(100vw - 32px), (max-width: 850px) 31vw, 382px" /></div><h3>Word-level highlighting</h3><p>Guide viewers through the active words as the recitation progresses.</p></article><article><div className="landing-editor-detail-crop"><Image src="/landing/demo/feature-timeline.png" alt="Quran-aware caption timeline with video and audio tracks" width={630} height={285} sizes="(max-width: 600px) calc(100vw - 32px), (max-width: 850px) 31vw, 382px" /></div><h3>Quran-aware timeline</h3><p>See caption blocks, video, and waveform together while you refine timing.</p></article><article><div className="landing-editor-detail-crop"><Image src="/landing/demo/feature-subtitle-control.png" alt="Subtitle controls for Quran text, word highlighting, and caption layout" width={279} height={600} sizes="(max-width: 600px) calc(100vw - 32px), (max-width: 850px) 31vw, 382px" /></div><h3>Full subtitle control</h3><p>Adjust translation, typography, highlighting, and placement in context.</p></article></div>
    </section>

    <section className="landing-section landing-features" id="features" aria-labelledby="features-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">Built for the details</p><h2 id="features-title">Tools shaped around Quran video.</h2><p>Purposeful capabilities for a task that generic captioning tools only partially cover.</p></div>
      <div className="landing-feature-grid">{features.map(([title, detail], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{detail}</p></article>)}</div>
      <div className="landing-local-note"><span>◌</span><div><b>Recognition stays close to your work.</b><p>Quran recognition and timing run in your browser. There is no per-video recognition API, and source media stays local by default.</p></div></div>
    </section>

    <section className="landing-section landing-compare" aria-labelledby="compare-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">Why Quran-aware matters</p><h2 id="compare-title">More context at every caption decision.</h2></div>
      <div className="landing-compare-table" role="table" aria-label="Generic captioning compared with Quran-aware editing"><div className="landing-compare-row landing-compare-head" role="row"><span role="columnheader">Workflow</span><span role="columnheader">Generic caption editor</span><span role="columnheader">Quran AutoCaption</span></div>{comparisons.map(([label, generic, quran]) => <div className="landing-compare-row" role="row" key={label}><b role="rowheader">{label}</b><span role="cell">{generic}</span><span role="cell">{quran}</span></div>)}</div>
    </section>

    <section className="landing-section landing-showcase" aria-labelledby="showcase-title">
      <div className="landing-section-heading"><p className="landing-eyebrow">Make it yours</p><h2 id="showcase-title">One recitation. Make it yours.</h2><p>Choose how Quran text, translation, highlighting, and layout appear in the finished video.</p></div>
      <div className="landing-showcase-grid">{LANDING_SHOWCASE.map((example) => <FinishedVideoExample key={example.id} example={example} />)}</div>
    </section>

    <section className="landing-final-cta" aria-labelledby="final-title"><p className="landing-eyebrow">Ready when you are</p><h2 id="final-title">Turn your recitation into a finished Quran video.</h2><p>No sign-up required to start.</p><Link className="landing-primary-cta" href="/create">Start creating free <span aria-hidden="true">→</span></Link></section>

    <footer className="landing-footer"><Link className="landing-brand" href="/"><span>۝</span><b>Quran AutoCaption</b></Link><p>© {year} Quran AutoCaption</p><p>Built for Quran recitation.</p></footer>
  </main>;
}
