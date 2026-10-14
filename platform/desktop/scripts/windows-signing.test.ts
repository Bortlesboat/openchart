import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, test, vi } from "vitest";

const desktopRequire = createRequire(import.meta.url);
const packagerRequire = createRequire(
  desktopRequire.resolve("@electron/packager"),
);
const installerRequire = createRequire(
  desktopRequire.resolve("electron-winstaller"),
);

type Sign = (options: {
  files: string[];
  hookFunction: (filename: string) => Promise<void>;
}) => Promise<void>;

test.each([
  ["Packager", packagerRequire],
  ["Squirrel", installerRequire],
] as const)(
  "%s stops signing on the first hook failure",
  async (consumer, requireSigner) => {
    const { sign } = requireSigner("@electron/windows-sign") as { sign: Sign };
    const failure = new Error(`${consumer} signing failed`);
    const files = [resolve("app.exe"), resolve("update.exe")];
    const hookFunction = vi.fn(async () => {
      throw failure;
    });
    await expect(sign({ files, hookFunction })).rejects.toBe(failure);
    expect(hookFunction).toHaveBeenCalledExactlyOnceWith(files[0]);
  },
);
