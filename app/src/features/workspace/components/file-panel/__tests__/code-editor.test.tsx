// Purpose: The resolver owns Tea models before Monaco mounts and releases them with the editor.
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import CodeEditor from "../code-editor";

const language = vi.hoisted(() => ({
  retainModel: vi.fn(),
  report: vi.fn(),
  render: vi.fn(),
  transport: {},
  teaSessions: { current: new Map() },
}));
vi.mock("@openchart/app/lib/monaco/monaco", () => ({
  monacoReady: Promise.resolve(),
}));
vi.mock("@openchart/app/features/workspace/components/context", () => ({
  useWorkspaceView: () => ({
    transport: language.transport,
    teaSessions: language.teaSessions,
    onLanguageError: language.report,
    openReference: () => {},
  }),
}));
vi.mock("@openchart/app/features/workspace/api/tea-language-client", () => ({
  createTeaLanguageClient: () => ({ retainModel: language.retainModel }),
}));
vi.mock("@openchart/app/components/ui/code-editor", () => ({
  CodeEditor: (props: { value: string; keepCurrentModel?: boolean }) => {
    language.render(props);
    return <textarea aria-label="Code" value={props.value} readOnly />;
  },
}));
const props = {
  path: "file:///workspace/main.tea",
  workspaceId: "wsp_test",
  workspaceRoot: "/workspace",
  value: "current text",
  onOpenFile: () => {},
  onChange: () => {},
};
beforeEach(() => {
  vi.resetAllMocks();
  language.teaSessions.current.clear();
});

test("acquires a resolver-owned model before mounting and releases it once on close", async () => {
  let finish!: (reference: { dispose(): void }) => void;
  language.retainModel.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const dispose = vi.fn();
  const view = render(<CodeEditor {...props} />);
  await waitFor(() =>
    expect(language.retainModel).toHaveBeenCalledWith(props.path),
  );
  expect(language.render).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("Opening editor");
  await act(async () => finish({ dispose }));
  expect(screen.getByRole("textbox")).toHaveValue("current text");
  expect(language.render).toHaveBeenLastCalledWith(
    expect.objectContaining({ keepCurrentModel: true }),
  );
  view.rerender(
    <CodeEditor {...props} value="unsaved draft" onOpenFile={() => {}} />,
  );
  expect(screen.getByRole("textbox")).toHaveValue("unsaved draft");
  expect(language.retainModel).toHaveBeenCalledOnce();
  expect(dispose).not.toHaveBeenCalled();
  view.unmount();
  expect(dispose).toHaveBeenCalledOnce();
});

test("closing during acquisition releases the late reference without mounting an editor", async () => {
  let finish!: (reference: { dispose(): void }) => void;
  language.retainModel.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const dispose = vi.fn();
  const { unmount } = render(<CodeEditor {...props} />);
  await waitFor(() => expect(language.retainModel).toHaveBeenCalledOnce());
  unmount();
  await act(async () => finish({ dispose }));
  expect(dispose).toHaveBeenCalledOnce();
  expect(language.render).not.toHaveBeenCalled();
  expect(language.report).not.toHaveBeenCalled();
});

test("a failed model acquisition is reported without creating an unowned model", async () => {
  language.retainModel.mockRejectedValue(new Error("File unavailable"));
  render(<CodeEditor {...props} />);
  await waitFor(() =>
    expect(language.report).toHaveBeenCalledWith("File unavailable"),
  );
  expect(screen.getByRole("status")).toHaveTextContent("Editor unavailable");
  expect(language.render).not.toHaveBeenCalled();
});

test("non-Tea editors keep Monaco React's ordinary model ownership", () => {
  render(<CodeEditor {...props} path="inmemory:///main.txt" />);
  expect(screen.getByRole("textbox")).toHaveValue("current text");
  expect(language.render).toHaveBeenLastCalledWith(
    expect.objectContaining({ keepCurrentModel: false }),
  );
  expect(language.retainModel).not.toHaveBeenCalled();
});
