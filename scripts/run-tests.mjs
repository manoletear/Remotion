// `node --test`'s glob support is inconsistent across Node versions/shells —
// a quoted "src/**/*.test.ts" string was silently failing to match anything
// once a nested test file existed (Node 20 doesn't expand it, and the shell
// invoking `npm test` wasn't either). Enumerate test files ourselves instead.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

function findTestFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
}

const files = findTestFiles("src");
if (files.length === 0) {
  console.error("No *.test.ts files found under src/");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
