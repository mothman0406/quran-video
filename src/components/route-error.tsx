"use client";

import { useEffect } from "react";

export default function RouteError({ error, retry, destination = "/editor" }: { error: Error & { digest?: string }; retry: () => void; destination?: string }) {
  useEffect(() => {
    // Future monitoring integrations should use only this opaque digest.
    console.error("quran-video route error", { digest: error.digest });
  }, [error]);
  return <main className="not-found-page"><p>Something went wrong</p><h1>Please try again.</h1><span>Your local media and account details are not shown here.</span><div><button type="button" onClick={retry}>Try again</button><a href={destination}>Continue</a></div></main>;
}
