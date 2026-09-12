import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const assets = [
  ["public/ffmpeg/ffmpeg-core.js", "node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js"],
  ["public/ffmpeg/ffmpeg-core.wasm", "node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm"],
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
