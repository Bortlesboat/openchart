import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = join(import.meta.dirname, "..");
const eslint = join(
  dirname(require.resolve("eslint/package.json")),
  "bin/eslint.js",
);
const flags = process.argv.slice(2);
if (flags.some((flag) => flag !== "--fix"))
  throw new Error("Only --fix is supported");
const patterns = readdirSync(join(root, "common"), { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() &&
      existsSync(join(root, "common", entry.name, "tsconfig.json")),
  )
  .map((entry) => `common/${entry.name}/**/*.ts`)
  .concat(["server/**/*.ts", "platform/**/*.{ts,tsx}", "demo/**/*.{ts,tsx}"]);

for (const pattern of patterns) {
  const result = spawnSync(
    process.execPath,
    [eslint, "--max-warnings", "0", pattern, ...flags],
    { cwd: root, stdio: "inherit", windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
