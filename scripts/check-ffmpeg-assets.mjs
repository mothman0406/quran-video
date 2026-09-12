import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const assets = [
  ["public/ffmpeg/ffmpeg-core.js", "node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js"],
  ["public/ffmpeg/ffmpeg-core.wasm", "node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm"],
  ["public/ffmpeg/ffmpeg-worker.js", "node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js"],
  ["public/ffmpeg/const.js", "node_modules/@ffmpeg/ffmpeg/dist/esm/const.js"],
  ["public/ffmpeg/errors.js", "node_modules/@ffmpeg/ffmpeg/dist/esm/errors.js"],
];
const requiredVersions = {
  "@ffmpeg/core": "0.12.10",
  "@ffmpeg/ffmpeg": "0.12.15",
};

const invalid = assets.filter(([published, source]) => !existsSync(resolve(published)) || !existsSync(resolve(source)) || !readFileSync(resolve(published)).equals(readFileSync(resolve(source))));
const invalidVersions = Object.entries(requiredVersions).filter(([packageName, version]) => {
  const manifest = JSON.parse(readFileSync(resolve(`node_modules/${packageName}/package.json`), "utf8"));
  return manifest.version !== version;
});
if (invalid.length || invalidVersions.length) {
  console.error(`Missing, mismatched, or unpinned FFmpeg browser assets:\n${[
    ...invalid.map(([published]) => published),
    ...invalidVersions.map(([packageName, version]) => `${packageName}@${version}`),
  ].join("\n")}`);
  process.exit(1);
}
console.log(`Pinned FFmpeg browser assets present and package-matched (${assets.length} files; ${Object.entries(requiredVersions).map(([packageName, version]) => `${packageName}@${version}`).join(", ")}).`);
