import nextEnv from "@next/env";
import { formatRuntimeConfigurationIssues } from "../src/lib/runtime-config.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const issues = formatRuntimeConfigurationIssues();
if (issues.length) console.warn(`[quran-video] Configuration review required before public deployment: ${issues.join("; ")}`);
else console.log("[quran-video] Production configuration variables are present.");
