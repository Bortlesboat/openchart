// Purpose: Exercise the collection process boundary without downloading Python.
import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Runs the uv script argument with Node in tests. Windows uses the native Node
 * executable and a cwd-owned `run` entry; POSIX uses an executable shebang.
 * The caller owns the fixture files under `root`; I/O failures reject.
 * @example const uv = await fakeUv(root);
 */
export async function fakeUv(root: string): Promise<string> {
  const windows = process.platform === "win32";
  const uv = path.join(root, windows ? "run" : ".fake-uv");
  await writeFile(
    uv,
    `${windows ? "" : `#!${process.execPath}\n`}const [script, ...args] = process.argv.slice(process.argv.indexOf("--script") + 1);\nrequire("node:child_process").execFileSync(process.execPath, [script, ...args], { stdio: "inherit", windowsHide: true });\n`,
  );
  if (!windows) await chmod(uv, 0o755);
  return windows ? process.execPath : uv;
}
