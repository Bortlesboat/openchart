// Purpose: Define the native operations and release information Desktop supplies to the application.
import { createContext, useContext } from "react";

/** One shipped release in Desktop's bundled changelog. */
export type ChangelogEntry = {
  /** Released version, e.g. "0.1.5". */
  readonly version: string;
  /** Release date as YYYY-MM-DD. */
  readonly date: string;
  /** User-facing changes, one sentence each. */
  readonly items: readonly string[];
};

/**
 * Native window chrome supplied by Desktop, without Electron dependencies.
 * Desktop owns menus and navigation history; the app owns layout and CSS colors.
 * Async operations reject on failure. Subscriptions report failures through
 * onError and return cleanup functions; callers must unsubscribe on unmount.
 * @example await chrome.navigate("back");
 */
export type WindowChrome = {
  /** Top-level native menus, in display order, with labels without mnemonics. */
  readonly menus: readonly { readonly id: string; readonly label: string }[];
  /** Opens a native submenu at viewport coordinates; resolves when dismissed. */
  showMenu: (menu: { id: string; x: number; y: number }) => Promise<void>;
  /** Applies CSS-derived colors and height to the native caption buttons. */
  setControls: (controls: {
    background: string;
    foreground: string;
    height: number;
  }) => Promise<void>;
  /** Reports current history availability immediately and after navigation. */
  onNavigationChange: (
    listener: (state: { back: boolean; forward: boolean }) => void,
    onError: (error: Error) => void,
  ) => () => void;
  /** Navigates the owning window's history; unavailable directions do nothing. */
  navigate: (direction: "back" | "forward") => Promise<void>;
};

/** Desktop supplies every operation; Electron dependencies stay outside the app. */
export type AppHost = {
  /** Optional integrated window chrome; hosts without it retain their existing shell. */
  readonly windowChrome?: WindowChrome;
  /** Opens a single-folder picker; cancellation returns null and failures reject. */
  pickDirectory: () => Promise<string | null>;
  /** Opens an absolute local path with the system's default app; failures reject. */
  openPath: (path: string) => Promise<void>;
  /** Shows an absolute local path selected in the system file manager; failures reject. */
  revealPath: (path: string) => Promise<void>;
  /** Opens a validated Stripe link in the browser; failures reject. */
  openBilling: (url: string) => Promise<void>;
  /** Subscribes to billing return notifications; returns the unsubscribe. */
  onBillingReturn: (listener: () => void) => () => void;
  /** Releases shipped with this build, newest first. */
  changelog: readonly ChangelogEntry[];
  /**
   * Calls back with the release name, e.g. "OpenChart 0.1.6", once an update has
   * downloaded, including one downloaded before subscribing. Returns the unsubscribe.
   */
  onUpdateReady: (listener: (release: string) => void) => () => void;
  /** Quits through the normal path, which may still be cancelled, then installs the update. */
  restartToUpdate: () => Promise<void>;
  /** Native notification instructions; omission uses platform-neutral guidance. */
  readonly notificationGuide?: "macos" | "windows";
  /**
   * Sends a sample system notification. macOS may ask the user to allow it;
   * Windows uses the user's system notification settings. This does not change
   * those settings or report permission back to the app. Failures reject.
   */
  enableNotifications: () => Promise<void>;
};

const AppHostContext = createContext<AppHost | undefined>(undefined);

/**
 * Shares Desktop's native operations throughout the app without owning state.
 * @example <AppHostProvider value={host}>{children}</AppHostProvider>
 */
export const AppHostProvider = AppHostContext.Provider;

/**
 * Reads the native operations supplied at the app entry; throws without its provider.
 * @example const { pickDirectory } = useAppHost();
 */
export function useAppHost(): AppHost {
  const host = useContext(AppHostContext);
  if (!host) throw new Error("useAppHost requires AppHostProvider");
  return host;
}
