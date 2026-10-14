import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@openchart/app/components/ui/button";
import { SidebarTrigger } from "@openchart/app/components/ui/sidebar";
import { useErrorToast } from "@openchart/app/hooks/use-error-toast";
import { useAppHost, type WindowChrome } from "@openchart/app/lib/host/host";
import { useDarkTheme } from "@openchart/app/lib/theme/theme";

function WindowHeader({ chrome }: { chrome: WindowChrome }) {
  const header = useRef<HTMLElement>(null);
  const menuButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const dark = useDarkTheme();
  const [navigation, setNavigation] = useState({ back: false, forward: false });
  const [error, setError] = useState<Error>();
  const [activeMenu, setActiveMenu] = useState<string>();
  const [focusedMenu, setFocusedMenu] = useState(0);
  useErrorToast(error, {
    id: "window-chrome",
    title: "Couldn't update window",
  });

  const reportFailure = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause : new Error(String(cause)));
  }, []);

  useEffect(() => chrome.onNavigationChange(setNavigation, setError), [chrome]);

  useEffect(() => {
    const element = header.current;
    if (!element) return;
    let active = true;
    const style = getComputedStyle(element);
    void chrome
      .setControls({
        background: style.backgroundColor,
        foreground: style.color,
        height: Math.round(element.getBoundingClientRect().height),
      })
      .then(
        () => {
          if (active) setError(undefined);
        },
        (cause: unknown) => {
          if (active) reportFailure(cause);
        },
      );
    return () => {
      active = false;
    };
  }, [chrome, dark, reportFailure]);

  async function openMenu(index: number) {
    const menu = chrome.menus[index];
    const button = menuButtons.current[index];
    if (!menu || !button || activeMenu) return;
    const bounds = button.getBoundingClientRect();
    setActiveMenu(menu.id);
    setFocusedMenu(index);
    try {
      await chrome.showMenu({
        id: menu.id,
        x: Math.round(bounds.left),
        y: Math.round(bounds.bottom),
      });
      setError(undefined);
    } catch (cause) {
      reportFailure(cause);
    } finally {
      setActiveMenu(undefined);
      if (button.isConnected) button.focus();
    }
  }

  useEffect(() => {
    function handleMnemonic(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.repeat)
        return;
      const index = chrome.menus.findIndex(
        (menu) => menu.label[0]?.toLowerCase() === event.key.toLowerCase(),
      );
      if (index < 0) return;
      event.preventDefault();
      void openMenu(index);
    }
    window.addEventListener("keydown", handleMnemonic);
    return () => window.removeEventListener("keydown", handleMnemonic);
  });

  return (
    <header
      ref={header}
      data-window-header
      className="flex h-11 w-full shrink-0 select-none items-center bg-sidebar text-sidebar-foreground"
    >
      <div data-window-header-controls className="flex items-center gap-1 px-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Go back"
          disabled={!navigation.back}
          onClick={() => {
            void chrome.navigate("back").catch(reportFailure);
          }}
        >
          <ArrowLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Go forward"
          disabled={!navigation.forward}
          onClick={() => {
            void chrome.navigate("forward").catch(reportFailure);
          }}
        >
          <ArrowRight />
        </Button>
        <SidebarTrigger className="mr-3 size-8" />
        <div
          role="menubar"
          aria-label="Application menu"
          className="flex gap-1"
        >
          {chrome.menus.map((menu, index) => (
            <Button
              key={menu.id}
              ref={(element) => {
                menuButtons.current[index] = element;
              }}
              variant="ghost"
              size="sm"
              className="font-normal"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={activeMenu === menu.id}
              tabIndex={index === focusedMenu ? 0 : -1}
              onFocus={() => setFocusedMenu(index)}
              onClick={() => void openMenu(index)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  void openMenu(index);
                } else if (
                  event.key === "ArrowLeft" ||
                  event.key === "ArrowRight" ||
                  event.key === "Home" ||
                  event.key === "End"
                ) {
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? chrome.menus.length - 1
                        : (index +
                            (event.key === "ArrowRight" ? 1 : -1) +
                            chrome.menus.length) %
                          chrome.menus.length;
                  menuButtons.current[next]?.focus();
                }
              }}
            >
              {menu.label}
            </Button>
          ))}
        </div>
      </div>
    </header>
  );
}

/**
 * Composes optional native window chrome above the shared workspace. Sidebar
 * state stays in SidebarProvider; header subscriptions are released on unmount.
 * Hosts without chrome render children unchanged. Failures use the shared toast.
 * @example <AppWindowFrame><AppLayoutContent /></AppWindowFrame>
 */
export function AppWindowFrame({ children }: { children: ReactNode }) {
  const { windowChrome } = useAppHost();
  if (!windowChrome) return children;
  return (
    <>
      <WindowHeader chrome={windowChrome} />
      <div data-window-content className="flex min-h-0 w-full flex-1">
        {children}
      </div>
    </>
  );
}
