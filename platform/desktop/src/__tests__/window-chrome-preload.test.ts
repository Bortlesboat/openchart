import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import type { WindowChrome } from "@openchart/app/lib/host/host";

async function fixture() {
  vi.resetModules();
  let resolve!: (state: { back: boolean; forward: boolean }) => void;
  let reject!: (error: Error) => void;
  const initial = new Promise<{ back: boolean; forward: boolean }>(
    (done, fail) => {
      resolve = done;
      reject = fail;
    },
  );
  const renderer = Object.assign(new EventEmitter(), {
    invoke: vi.fn((channel: string) =>
      channel === "desktop.navigation" ? initial : Promise.resolve(),
    ),
  });
  const expose = vi.fn();
  vi.doMock("electron", () => ({
    contextBridge: { exposeInMainWorld: expose },
    ipcRenderer: renderer,
  }));
  vi.doMock("@clerk/electron/preload", () => ({ exposeClerkBridge: vi.fn() }));
  await import("../preload");
  const bridge = expose.mock.calls[0]![1] as Pick<
    WindowChrome,
    "navigate" | "showMenu" | "onNavigationChange"
  > & { setWindowControls: WindowChrome["setControls"] };
  return { bridge, renderer, resolve, reject };
}

test("chrome subscriptions read current native history and release their listener", async () => {
  const { bridge, renderer, resolve } = await fixture();
  const receive = vi.fn();
  const onError = vi.fn();
  const unsubscribe = bridge.onNavigationChange(receive, onError);
  resolve({ back: true, forward: false });
  await vi.waitFor(() =>
    expect(receive).toHaveBeenCalledWith({ back: true, forward: false }),
  );
  renderer.emit("desktop.navigation", {}, { back: false, forward: true });
  expect(receive).toHaveBeenLastCalledWith({ back: false, forward: true });
  unsubscribe();
  expect(renderer.listenerCount("desktop.navigation")).toBe(0);
  expect(onError).not.toHaveBeenCalled();
});

test.each(["resolve", "reject"] as const)(
  "chrome subscriptions ignore initial %s after their owner unmounts",
  async (completion) => {
    const { bridge, resolve, reject } = await fixture();
    const receive = vi.fn();
    const onError = vi.fn();
    bridge.onNavigationChange(receive, onError)();
    if (completion === "resolve") resolve({ back: true, forward: true });
    else reject(new Error("Window closed"));
    await new Promise<void>((done) => queueMicrotask(done));
    expect(receive).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  },
);

test("preload reports native read errors and forwards only narrow chrome operations", async () => {
  const { bridge, renderer, reject } = await fixture();
  const onError = vi.fn();
  const unsubscribe = bridge.onNavigationChange(vi.fn(), onError);
  reject(new Error("Native history unavailable"));
  await vi.waitFor(() =>
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Native history unavailable" }),
    ),
  );
  await bridge.navigate("back");
  await bridge.showMenu({ id: "file", x: 10, y: 44 });
  await bridge.setWindowControls({
    background: "#121212",
    foreground: "#ffffff",
    height: 44,
  });
  expect(renderer.invoke).toHaveBeenCalledWith("desktop.navigate", "back");
  expect(renderer.invoke).toHaveBeenCalledWith("desktop.showMenu", {
    id: "file",
    x: 10,
    y: 44,
  });
  expect(renderer.invoke).toHaveBeenCalledWith("desktop.setWindowControls", {
    background: "#121212",
    foreground: "#ffffff",
    height: 44,
  });
  unsubscribe();
});
