// Purpose: Show live open/closed session status for the focused chart's market.
import { useEffect, useMemo, useState } from "react";
import type { ProviderListing, SessionType } from "@openchart/market";

import { useCalendar } from "@openchart/app/hooks/use-calendar";
import {
  sessionClockDescription,
  sessionClockLabel,
  sessionClockStatus,
  sessionClockWindow,
} from "@openchart/app/features/chart/utils/session-clock";
import { cn } from "@openchart/app/utils/cn";

/** Live session remaining time for this listing. Failures omit the clock.
 * @example <SessionClock provider={source.provider} listing={source.listing} session={cell.session} />
 */
export function SessionClock({
  provider,
  listing,
  session,
}: ProviderListing & { session: SessionType }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const utcDay = Math.floor(now / 86_400_000);
  const range = useMemo(
    () => sessionClockWindow(utcDay * 86_400_000),
    [utcDay],
  );
  const calendar = useCalendar(
    {
      provider,
      listing,
      start: range.start,
      end: range.end,
      timezone: "UTC",
    },
    { silent: true },
  );
  if (!calendar.data) return null;
  const status = sessionClockStatus({
    days: calendar.data.days,
    now,
    coverage: session,
  });
  const label = sessionClockLabel(status);
  const description = sessionClockDescription(status);
  if (!label || !description) return null;
  return (
    <div
      className={cn(
        "max-w-[11rem] truncate px-1 text-xs tabular-nums",
        status.kind === "open" ? "text-foreground" : "text-muted-foreground",
      )}
      aria-label={description}
      title={description}
    >
      {label}
    </div>
  );
}
