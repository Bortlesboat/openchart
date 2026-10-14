// Purpose: Convert between portable snapshot keys and native Tea compiler filenames.
import path from "node:path";
import type { SnapshotSources } from "@openchart/tea";

/**
 * Supplies an in-memory snapshot to Tea's host-native import resolver. Both the
 * entry and imported filenames are normalized with the same native path rules;
 * the caller's portable snapshot keys and texts remain unchanged. Every import
 * is supplied from the snapshot, so missing imports never fall back to disk.
 * Throws when the snapshot omits its entry. This pure operation owns no files,
 * handles or cleanup; callers validate the shared snapshot schema first.
 *
 * @example compileToProgram([compilerSource(snapshot)], errors);
 */
export function compilerSource(snapshot: SnapshotSources) {
  const source = snapshot.sources[snapshot.entry];
  if (source === undefined)
    throw new Error("Tea snapshot is missing its entry");
  return {
    filename: path.normalize(snapshot.entry),
    source,
    imports: Object.fromEntries(
      Object.entries(snapshot.sources).map(([filename, text]) => [
        path.normalize(filename),
        text,
      ]),
    ),
  };
}

/**
 * Projects compiler-owned absolute filenames to snapshot keys using the host's
 * native path rules. Only native separators become `/`; a literal backslash in
 * a POSIX filename is preserved. The caller validates snapshot bounds and its
 * entry before persistence. This pure operation neither reads files nor retains
 * resources. `paths` permits callers/tests to describe another host's filenames.
 *
 * @example
 * snapshotSources(root, compiled.sources); // { "studies/main.tea": "..." }
 */
export function snapshotSources(
  root: string,
  sources: Readonly<Record<string, string>>,
  paths: Pick<typeof path, "relative" | "sep"> = path,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(sources).map(([filename, text]) => [
      paths.relative(root, filename).split(paths.sep).join("/"),
      text,
    ]),
  );
}
