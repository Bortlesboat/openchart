// Purpose: Derive open/closed session status and compact countdowns from venue days.
import type {
  AtomicSessionType,
  SessionType,
  TradingDay,
  TradingSession,
} from "@openchart/market";

const DAY_MS = 86_400_000;

const coveredTypes: Record<SessionType, readonly AtomicSessionType[]> = {
  regular: ["regular"],
  extended: ["pre", "regular", "post"],
  "24h": ["pre", "regular", "post", "overnight"],
};

/** Open, closed until the next covered session, or no sessions in the calendar. */
export type SessionClockStatus =
  | {
      readonly kind: "open";
      readonly session: TradingSession;
      readonly remainingMs: number;
    }
  | {
      readonly kind: "closed";
      readonly next: TradingSession | undefined;
      readonly remainingMs: number | undefined;
    }
  | { readonly kind: "empty" };

/**
 * UTC-day aligned calendar window around `now`: two days back and twelve ahead.
 * The bounds stay fixed for a UTC day so live ticks do not refetch.
 * @example sessionClockWindow(Date.UTC(2026, 9, 15, 16));
 */
export function sessionClockWindow(now: number): {
  start: number;
  end: number;
} {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  return { start: today - 2 * DAY_MS, end: today + 12 * DAY_MS };
}

/**
 * Covered sessions at `now` for the chart's session selector.
 * Regular excludes pre/post; extended excludes overnight; 24h uses every atomic type.
 * @example sessionClockStatus({ days, now: Date.now(), coverage: "regular" });
 */
export function sessionClockStatus({
  days,
  now,
  coverage,
}: {
  readonly days: readonly TradingDay[];
  readonly now: number;
  readonly coverage: SessionType;
}): SessionClockStatus {
  const allowed = new Set(coveredTypes[coverage]);
  const sessions = days
    .flatMap((day) => day.sessions)
    .filter((session) => allowed.has(session.type))
    .sort((left, right) => left.start - right.start);
  if (!sessions.length) return { kind: "empty" };
  const open = sessions.find(
    (session) => session.start <= now && now < session.end,
  );
  if (open) {
    return {
      kind: "open",
      session: open,
      remainingMs: Math.max(0, open.end - now),
    };
  }
  const next = sessions.find((session) => session.start > now);
  return {
    kind: "closed",
    next,
    remainingMs: next ? Math.max(0, next.start - now) : undefined,
  };
}

/**
 * Compact remaining time: days and hours, hours and minutes, minutes, or seconds.
 * @example formatCountdown(90 * 60 * 1000);
 */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

/**
 * Short name for an atomic session on the clock.
 * @example sessionTypeLabel("post");
 */
export function sessionTypeLabel(type: AtomicSessionType): string {
  if (type === "regular") return "Regular";
  if (type === "pre") return "Pre-market";
  if (type === "post") return "After hours";
  return "Overnight";
}

/**
 * Toolbar copy for a resolved status, or undefined when the calendar is empty.
 * @example sessionClockLabel({ kind: "closed", next, remainingMs: 60_000 });
 */
export function sessionClockLabel(
  status: SessionClockStatus,
): string | undefined {
  if (status.kind === "empty") return undefined;
  if (status.kind === "open") {
    return `${sessionTypeLabel(status.session.type)} · ${formatCountdown(status.remainingMs)}`;
  }
  if (status.remainingMs === undefined) return "Closed";
  return `Closed · ${formatCountdown(status.remainingMs)}`;
}

/**
 * Screen-reader phrasing that does not tick as a live region.
 * @example sessionClockDescription(status);
 */
export function sessionClockDescription(
  status: SessionClockStatus,
): string | undefined {
  if (status.kind === "empty") return undefined;
  if (status.kind === "open") {
    return `${sessionTypeLabel(status.session.type)} session open, closes in ${formatCountdown(status.remainingMs)}`;
  }
  if (status.remainingMs === undefined || !status.next) return "Market closed";
  return `Market closed, ${sessionTypeLabel(status.next.type)} opens in ${formatCountdown(status.remainingMs)}`;
}
