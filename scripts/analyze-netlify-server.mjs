import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const functionName = process.env.NETLIFY_FUNCTION_NAME ?? "___netlify-server-handler";
const root = path.resolve(".netlify/functions-internal", functionName);
const archive = path.resolve(".netlify/functions", `${functionName}.zip`);

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesIn(target);
    if (!entry.isFile()) return [];
    return [{ file: target, size: (await stat(target)).size }];
  }));
  return nested.flat();
}

function packageName(relativePath) {
  const parts = relativePath.split(path.sep);
  const nodeModules = parts.lastIndexOf("node_modules");
  if (nodeModules < 0) return "project/runtime";
  const first = parts[nodeModules + 1] ?? "unknown";
  return first.startsWith("@")
    ? `${first}/${parts[nodeModules + 2] ?? "unknown"}`
    : first;
}

function printRows(title, rows) {
  console.log(`\n${title}`);
  for (const row of rows) console.log(`${row.size}\t${row.label}`);
}

try {
  const [archiveStats, files] = await Promise.all([stat(archive), filesIn(root)]);
  const unpackedBytes = files.reduce((sum, file) => sum + file.size, 0);
  const grouped = new Map();
  for (const file of files) {
    const name = packageName(path.relative(root, file.file));
    grouped.set(name, (grouped.get(name) ?? 0) + file.size);
  }

  console.log(`Netlify function: ${functionName}`);
  console.log(`Packaged ZIP bytes: ${archiveStats.size}`);
  console.log(`Unpacked bytes: ${unpackedBytes}`);
  console.log(`Files: ${files.length}`);
  printRows("Largest files", files
    .map((file) => ({ size: file.size, label: path.relative(root, file.file) }))
    .sort((left, right) => right.size - left.size)
    .slice(0, 30));
  printRows("Largest package contributors", [...grouped]
    .map(([label, size]) => ({ label, size }))
    .sort((left, right) => right.size - left.size)
    .slice(0, 30));
} catch (error) {
  console.error(`Unable to inspect ${functionName}. Run Netlify's local build first: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
