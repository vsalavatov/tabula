import {cp, mkdir, rm} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webAppRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(webAppRoot, "..");
const kotlinRoot = path.resolve(repoRoot, "shared-bridge-web", "build", "compileSync", "js", "main", "developmentExecutable", "kotlin");
const targetRoot = path.resolve(webAppRoot, "public", "generated", "kotlin");

const kotlinFiles = [
  "kotlin-kotlin-stdlib.js",
  "kotlin-kotlinx-atomicfu-runtime.js",
  "kotlinx-atomicfu.js",
  "kotlinx-coroutines-core.js",
  "kotlinx-serialization-kotlinx-serialization-core.js",
  "kotlinx-serialization-kotlinx-serialization-json.js",
  "kotlin_org_jetbrains_kotlin_kotlin_dom_api_compat.js",
  "sqldelight-runtime.js",
  "sqldelight-extensions-async-extensions.js",
  "sqldelight-extensions-coroutines-extensions.js",
  "Kotlin-DateTime-library-kotlinx-datetime.js",
  "tabula-shared-core.js",
  "tabula-shared-db.js",
  "tabula-shared-bridge-web.js",
];

const vendorFiles = [
  {
    source: path.resolve(webAppRoot, "node_modules", "@js-joda", "core", "dist", "js-joda.js"),
    target: "js-joda.js",
  },
  {
    source: path.resolve(webAppRoot, "node_modules", "sql.js", "dist", "sql-wasm.js"),
    target: "sql-wasm.js",
  },
  {
    source: path.resolve(webAppRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    target: "sql-wasm.wasm",
  },
];

await rm(targetRoot, { recursive: true, force: true });
await mkdir(targetRoot, { recursive: true });

for (const fileName of kotlinFiles) {
  await cp(path.resolve(kotlinRoot, fileName), path.resolve(targetRoot, fileName));
}

for (const file of vendorFiles) {
  await cp(file.source, path.resolve(targetRoot, file.target));
}
