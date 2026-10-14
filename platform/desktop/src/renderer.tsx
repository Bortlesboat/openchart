// Purpose: Open the shared app using the backend started by Electron main.
import type { BackendConnection } from "@openchart/app/lib/transport/transport";
import type { AppHost, WindowChrome } from "@openchart/app/lib/host/host";
import changelog from "./changelog/changelog.json";
import { createClerkProvider } from "./clerk-provider";
import "./renderer.css";

declare global {
  interface Window {
    /** Added by preload.ts to supply the connection, folder picker and update restart. */
    readonly desktop: {
      readonly connection: () => Promise<
        BackendConnection & {
          publishableKey: string;
          testAccount?: string;
          initialLocalStorage?: Readonly<Record<string, string>>;
          notificationGuide?: AppHost["notificationGuide"];
          windowChrome?: Pick<WindowChrome, "menus">;
        }
      >;
      readonly pickDirectory: () => Promise<string | null>;
      readonly openPath: (path: string) => Promise<void>;
      readonly revealPath: (path: string) => Promise<void>;
      readonly openBilling: (url: string) => Promise<void>;
      readonly onBillingReturn: (listener: () => void) => () => void;
      readonly onUpdateReady: (
        listener: (release: string) => void,
      ) => () => void;
      readonly restartToUpdate: () => Promise<void>;
      readonly enableNotifications: () => Promise<void>;
      readonly navigate: WindowChrome["navigate"];
      readonly showMenu: WindowChrome["showMenu"];
      readonly setWindowControls: WindowChrome["setControls"];
      readonly onNavigationChange: WindowChrome["onNavigationChange"];
    };
  }
}

// Only Mac desktop pages need to leave room for the system's window buttons.
if (navigator.platform.startsWith("Mac"))
  document.documentElement.classList.add("desktop-macos");

function nativeColor(color: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Window colors require a canvas context");
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return `#${[red!, green!, blue!].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

// Get the connection details before rendering; the page then calls the backend directly.
void window.desktop
  .connection()
  .then(
    async ({
      publishableKey,
      testAccount,
      initialLocalStorage,
      notificationGuide,
      windowChrome,
      ...connection
    }) => {
      for (const [key, value] of Object.entries(initialLocalStorage ?? {})) {
        if (localStorage.getItem(key) === null)
          localStorage.setItem(key, value);
      }
      // App modules may read storage as they load, so they load after seeding.
      const { bootstrap } = await import("@openchart/app/bootstrap");
      if (windowChrome)
        document.documentElement.classList.add("desktop-windows");
      bootstrap(connection, createClerkProvider(publishableKey, testAccount), {
        windowChrome: windowChrome
          ? {
              menus: windowChrome.menus,
              showMenu: (menu) => window.desktop.showMenu(menu),
              navigate: (direction) => window.desktop.navigate(direction),
              onNavigationChange: (listener, onError) =>
                window.desktop.onNavigationChange(listener, onError),
              setControls: async ({ background, foreground, height }) =>
                window.desktop.setWindowControls({
                  background: nativeColor(background),
                  foreground: nativeColor(foreground),
                  height,
                }),
            }
          : undefined,
        pickDirectory: () => window.desktop.pickDirectory(),
        openPath: (path) => window.desktop.openPath(path),
        revealPath: (path) => window.desktop.revealPath(path),
        openBilling: (url) => window.desktop.openBilling(url),
        onBillingReturn: (listener) => window.desktop.onBillingReturn(listener),
        changelog,
        onUpdateReady: (listener) => window.desktop.onUpdateReady(listener),
        restartToUpdate: () => window.desktop.restartToUpdate(),
        notificationGuide,
        enableNotifications: () => window.desktop.enableNotifications(),
      });
    },
  );
