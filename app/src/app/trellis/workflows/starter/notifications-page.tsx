// Purpose: Send a sample notification and explain the host's notification settings on first launch.
import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import type { OnboardingPageProps } from "@openchart/app/app/trellis/views";
import { Button } from "@openchart/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@openchart/app/components/ui/dialog";
import { useAppHost } from "@openchart/app/lib/host/host";

import allowNotificationsVideo from "./allow-notifications.mp4";

/**
 * The starter workflow's page after connecting an agent. Opening it sends a
 * sample notification once. Desktop's guide selects macOS permission
 * instructions and video or Windows notification settings. Sending again is
 * the fallback for a missed notification; system permissions stay with the OS.
 * Failures show an error and keep the page up. Continue or closing moves on.
 * @example <NotificationsPage transport={transport} onDone={next} />
 */
export function NotificationsPage({ onDone }: OnboardingPageProps) {
  const { enableNotifications, notificationGuide } = useAppHost();
  const macos = notificationGuide === "macos";
  const reduceMotion = useReducedMotion() ?? false;
  const enable = () =>
    enableNotifications().catch((error: unknown) =>
      toast.error("Couldn’t turn on notifications", {
        description: error instanceof Error ? error.message : String(error),
      }),
    );
  // StrictMode's repeated mount keeps this ref, so one sample is sent.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void enable();
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onDone()}>
      <DialogContent
        className="gap-6 p-8 sm:max-w-md lg:max-w-md xl:max-w-md"
        onInteractOutside={(event) => event.preventDefault()}
      >
        {macos && (
          <video
            src={allowNotificationsVideo}
            className="aspect-square w-full rounded-lg bg-black"
            autoPlay={!reduceMotion}
            controls={reduceMotion}
            aria-hidden={!reduceMotion}
            loop
            muted
            playsInline
          />
        )}
        <div className="space-y-2 text-center">
          <DialogTitle className="text-2xl font-semibold">
            Turn on notifications
          </DialogTitle>
          <DialogDescription>
            Hear from your alerts and agents the moment something happens, even
            while OpenChart is in the background.{" "}
            {macos
              ? "macOS asks in the top-right corner: open Options and choose Allow."
              : notificationGuide === "windows"
                ? "Windows shows these in Notification Center. If you don’t see them, open Settings → System → Notifications and turn on OpenChart."
                : "If you don’t see them, allow OpenChart notifications in your system settings."}
          </DialogDescription>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Button onClick={onDone}>Continue</Button>
          <Button
            variant="link"
            className="text-muted-foreground"
            onClick={() => void enable()}
          >
            {macos
              ? "Didn’t see it? Turn on notifications"
              : "Send another test notification"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
