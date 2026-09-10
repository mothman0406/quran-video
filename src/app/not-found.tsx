import Link from "next/link";

export default function NotFound() {
  return <main className="not-found-page"><p>404</p><h1>That page isn’t here.</h1><span>Return to Quran AutoCaption and continue your work.</span><div><Link href="/">Home</Link><Link href="/editor">Open editor</Link></div></main>;
}
