// Purpose: Bind Workspace models and Tea language sessions to the shared Monaco editor.
import { useEffect, useRef, useState } from "react";
import { CodeEditor as Editor } from "@openchart/app/components/ui/code-editor";
import { monacoReady } from "@openchart/app/lib/monaco/monaco";
import { useWorkspaceView } from "@openchart/app/features/workspace/components/context";
import { createTeaLanguageClient } from "@openchart/app/features/workspace/api/tea-language-client";

/** Mount and focus one file model with automatic container sizing. @example <CodeEditor {...fileProps} /> */
export default function CodeEditor({
  path,
  workspaceRoot,
  workspaceId,
  onOpenFile,
  value,
  readOnly = false,
  wordWrap = false,
  onChange,
}: {
  path: string;
  workspaceRoot: string;
  workspaceId: string;
  onOpenFile: (path: string) => void;
  value: string;
  readOnly?: boolean;
  wordWrap?: boolean;
  onChange: (value: string) => void;
}) {
  const { transport, teaSessions, onLanguageError, openReference } =
    useWorkspaceView();
  const navigation = useRef({ onOpenFile, openReference });
  navigation.current = { onOpenFile, openReference };
  const tea = path.endsWith(".tea");
  const [model, setModel] = useState<{ path: string; error?: string }>();
  useEffect(() => {
    if (!tea) return;
    let active = true;
    let reference: { dispose(): void } | undefined;
    void monacoReady
      .then(async () => {
        if (!active) return;
        let session = teaSessions.current.get(workspaceId);
        if (!session && !path.startsWith("tea-lib:")) {
          session = createTeaLanguageClient(
            transport,
            workspaceId,
            workspaceRoot,
            (file) => navigation.current.onOpenFile(file),
            (name) => navigation.current.openReference(name),
            onLanguageError,
          );
          teaSessions.current.set(workspaceId, session);
        }
        if (!session) throw new Error("Tea language session is unavailable");
        // The resolver must create the model before Monaco React mounts. A
        // reference to a model React already created adopts it without owning
        // its disposal, leaving stale models after the last editor closes.
        const retained = await session.retainModel(path);
        if (!active) {
          retained.dispose();
          return;
        }
        reference = retained;
        setModel({ path });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const error = cause instanceof Error ? cause.message : String(cause);
        onLanguageError(error);
        setModel({ path, error });
      });
    return () => {
      active = false;
      reference?.dispose();
    };
  }, [
    tea,
    path,
    workspaceId,
    workspaceRoot,
    transport,
    teaSessions,
    onLanguageError,
  ]);
  if (tea && model?.path !== path) return <p role="status">Opening editor…</p>;
  if (tea && model?.error)
    return (
      <p role="status">
        Editor unavailable. Close and reopen the file to try again.
      </p>
    );
  return (
    <div className="flex size-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          path={path}
          keepCurrentModel={tea}
          // Monaco infers every other language from the model path's extension,
          // but `.tsx` infers typescriptreact, which its TypeScript service never
          // checks; custom widgets need that service for their SDK types.
          language={
            path.endsWith(".tea")
              ? "tea"
              : path.endsWith(".widget.tsx")
                ? "typescript"
                : undefined
          }
          value={value}
          onMount={(editor) => {
            editor.focus();
          }}
          onChange={(next) => onChange(next ?? "")}
          options={{ readOnly, wordWrap: wordWrap ? "on" : "off" }}
        />
      </div>
    </div>
  );
}
