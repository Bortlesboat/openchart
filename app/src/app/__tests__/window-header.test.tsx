import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { toast } from "sonner";

import { AppWindowFrame } from "@openchart/app/app/window-header";
import {
  SidebarProvider,
  useSidebar,
} from "@openchart/app/components/ui/sidebar";
import {
  AppHostProvider,
  type WindowChrome,
} from "@openchart/app/lib/host/host";
import { testAppHost } from "@openchart/app/testing/test-utils";

beforeEach(() => {
  document.documentElement.className = "light";
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});

function fixture() {
  let announce: Parameters<WindowChrome["onNavigationChange"]>[0] = () => {};
  const unsubscribe = vi.fn();
  const chrome: WindowChrome = {
    menus: [
      { id: "file", label: "File" },
      { id: "edit", label: "Edit" },
      { id: "view", label: "View" },
      { id: "help", label: "Help" },
    ],
    showMenu: vi.fn(async () => {}),
    setControls: vi.fn(async () => {}),
    navigate: vi.fn(async () => {}),
    onNavigationChange: (listener) => {
      announce = listener;
      listener({ back: false, forward: false });
      return unsubscribe;
    },
  };
  function SidebarState() {
    const { state } = useSidebar();
    return <p>{state}</p>;
  }
  const view = render(
    <AppHostProvider value={testAppHost({ windowChrome: chrome })}>
      <SidebarProvider>
        <AppWindowFrame>
          <SidebarState />
        </AppWindowFrame>
      </SidebarProvider>
    </AppHostProvider>,
  );
  return {
    ...view,
    chrome,
    unsubscribe,
    announce: (back: boolean, forward: boolean) =>
      act(() => announce({ back, forward })),
  };
}

test("hosts without window chrome keep their existing content unchanged", () => {
  const view = render(
    <AppHostProvider value={testAppHost()}>
      <AppWindowFrame>
        <p>Workspace</p>
      </AppWindowFrame>
    </AppHostProvider>,
  );
  expect(view.container.innerHTML).toBe("<p>Workspace</p>");
  expect(screen.queryByRole("menubar")).not.toBeInTheDocument();
});

test("native navigation availability and sidebar controls use their existing owners", async () => {
  const view = fixture();
  expect(screen.getByRole("button", { name: "Go back" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Go forward" })).toBeDisabled();
  view.announce(true, false);
  await userEvent.click(screen.getByRole("button", { name: "Go back" }));
  expect(view.chrome.navigate).toHaveBeenCalledWith("back");
  view.announce(false, true);
  await userEvent.click(screen.getByRole("button", { name: "Go forward" }));
  expect(view.chrome.navigate).toHaveBeenCalledWith("forward");
  await userEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
  expect(screen.getByText("collapsed")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
  expect(screen.getByText("expanded")).toBeVisible();
  view.unmount();
  expect(view.unsubscribe).toHaveBeenCalledOnce();
});

test("native menus support clicks, arrow navigation and Alt mnemonics", async () => {
  const { chrome } = fixture();
  const file = screen.getByRole("menuitem", { name: "File" });
  const edit = screen.getByRole("menuitem", { name: "Edit" });
  await userEvent.click(file);
  expect(chrome.showMenu).toHaveBeenCalledWith({ id: "file", x: 0, y: 0 });
  await waitFor(() => expect(file).toHaveFocus());
  await userEvent.keyboard("{ArrowRight}");
  expect(edit).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  expect(chrome.showMenu).toHaveBeenCalledWith({ id: "edit", x: 0, y: 0 });
  await userEvent.keyboard("{Alt>}v{/Alt}");
  expect(chrome.showMenu).toHaveBeenCalledWith({ id: "view", x: 0, y: 0 });
});

test("caption colors follow the applied CSS theme and height", async () => {
  const { chrome } = fixture();
  await waitFor(() => expect(chrome.setControls).toHaveBeenCalledOnce());
  await act(async () => {
    document.documentElement.className = "dark";
  });
  await waitFor(() => expect(chrome.setControls).toHaveBeenCalledTimes(2));
  expect(chrome.setControls).toHaveBeenLastCalledWith({
    background: expect.any(String),
    foreground: expect.any(String),
    height: 0,
  });
});

test("failed native actions are reported through the shared toast", async () => {
  const report = vi.spyOn(toast, "error").mockReturnValue("window-chrome");
  const { chrome } = fixture();
  vi.mocked(chrome.showMenu).mockRejectedValueOnce(
    new Error("Native menu failed"),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: "Help" }));
  await waitFor(() =>
    expect(report).toHaveBeenCalledWith(
      "Couldn't update window",
      expect.objectContaining({ description: "Native menu failed" }),
    ),
  );
  report.mockRestore();
});
