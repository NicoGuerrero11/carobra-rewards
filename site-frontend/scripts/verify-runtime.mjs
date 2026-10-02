import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

export const NODE_MAJOR = 24;
export const EXPECTED_RUNTIME = `nodejs${NODE_MAJOR}.x`;

export function verifyBuildNode(version = process.versions.node) {
  if (Number(version.split(".")[0]) !== NODE_MAJOR) {
    throw new Error(`Build requires Node ${NODE_MAJOR}.x; received ${version}. Use the frontend .nvmrc.`);
  }
}

export function verifyFunctions(directory) {
  const results = [];
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.name === ".vc-config.json") {
        const { runtime } = JSON.parse(readFileSync(child, "utf8"));
        if (runtime !== EXPECTED_RUNTIME && runtime !== "edge") {
          throw new Error(`${child}: expected ${EXPECTED_RUNTIME} or edge; received ${String(runtime)}.`);
        }
        results.push({ path: child, runtime });
      }
    }
  }
  visit(directory);
  if (!results.some(({ runtime }) => runtime === EXPECTED_RUNTIME)) {
    throw new Error(`No ${EXPECTED_RUNTIME} functions found in ${directory}; run a fresh SSR build.`);
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    verifyBuildNode();
    const root = fileURLToPath(new URL("../", import.meta.url));
    const { engines } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (engines?.node !== `${NODE_MAJOR}.x`) {
      throw new Error(`package.json engines.node must be ${NODE_MAJOR}.x.`);
    }
    if (process.argv.includes("--node")) {
      console.log(`Build Node verified: ${process.version}`);
    } else {
      const functions = verifyFunctions(join(root, ".vercel/output/functions"));
      for (const { path, runtime } of functions) console.log(`${path}: ${runtime}`);
      console.log(`Runtime verified for ${functions.length} function(s).`);
    }
  } catch (error) {
    console.error(`Runtime verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
