# Local real-alignment labels

Keep only small timing metadata here; recordings remain on the local machine.

Use one JSON file per recording:

```json
{
  "recordingId": "surah-6-74-77",
  "passage": ["6:74", "6:75", "6:76", "6:77"],
  "boundaries": { "6:74": 9500, "6:75": 21000, "6:76": 32000, "6:77": 44832 },
  "finalEndMs": 65280,
  "quality": "verified"
}
```

Run the comparison without uploading media:

```sh
npm run evaluate:real -- /path/to/alignment-debug.json --labels=debug/labels/surah-6-74-77.json
```

`quality: "approximate"` prints useful diagnostics but is deliberately not a release/promotion gate.

The development-only evaluation registry is
`src/lib/recognition/real-evaluation-registry.ts`. It lists the four planned
real-recording passages and preserves `UNKNOWN` truth until a human label is
actually available. It is debug/evaluation metadata only and is never imported
by recognition or timing code.
