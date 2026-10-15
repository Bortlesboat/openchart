// Purpose: Session clocks honor coverage selectors and compact remaining time.
import { expect, it } from "vitest";
import type { TradingDay } from "@openchart/market";

import {
  formatCountdown,
  sessionClockDescription,
  sessionClockLabel,
  sessionClockStatus,
  sessionClockWindow,
} from "@openchart/app/features/chart/utils/session-clock";

const day: TradingDay = {
  date: Date.parse("2026-11-27T00:00:00Z"),
  sessions: [
    {
      type: "pre",
      start: Date.parse("2026-11-27T09:00:00Z"),
      end: Date.parse("2026-11-27T14:30:00Z"),
    },
    {
      type: "regular",
      start: Date.parse("2026-11-27T14:30:00Z"),
      end: Date.parse("2026-11-27T21:00:00Z"),
    },
    {
      type: "post",
      start: Date.parse("2026-11-27T21:00:00Z"),
      end: Date.parse("2026-11-28T01:00:00Z"),
    },
  ],
};

it("aligns the calendar request to UTC days so live ticks do not move it", () => {
  expect(sessionClockWindow(Date.parse("2026-11-27T16:00:00Z"))).toEqual({
    start: Date.parse("2026-11-25T00:00:00Z"),
    end: Date.parse("2026-12-09T00:00:00Z"),
  });
  expect(sessionClockWindow(Date.parse("2026-11-27T23:59:59Z"))).toEqual(
    sessionClockWindow(Date.parse("2026-11-27T00:00:00Z")),
  );
});

it("treats regular coverage as closed during pre-market and open at the cash session", () => {
  const pre = sessionClockStatus({
    days: [day],
    now: Date.parse("2026-11-27T13:00:00Z"),
    coverage: "regular",
  });
  expect(pre).toMatchObject({
    kind: "closed",
    remainingMs:
      Date.parse("2026-11-27T14:30:00Z") - Date.parse("2026-11-27T13:00:00Z"),
  });
  expect(sessionClockLabel(pre)).toBe("Closed · 1h 30m");
  expect(sessionClockDescription(pre)).toBe(
    "Market closed, Regular opens in 1h 30m",
  );
  const open = sessionClockStatus({
    days: [day],
    now: Date.parse("2026-11-27T16:00:00Z"),
    coverage: "regular",
  });
  expect(open.kind).toBe("open");
  expect(sessionClockLabel(open)).toBe("Regular · 5h");
  const extendedPre = sessionClockStatus({
    days: [day],
    now: Date.parse("2026-11-27T13:00:00Z"),
    coverage: "extended",
  });
  expect(extendedPre.kind).toBe("open");
  expect(sessionClockLabel(extendedPre)).toBe("Pre-market · 1h 30m");
});

it("hides an empty calendar and reports a close with no remaining session", () => {
  expect(sessionClockStatus({ days: [], now: 1, coverage: "24h" })).toEqual({
    kind: "empty",
  });
  expect(sessionClockLabel({ kind: "empty" })).toBeUndefined();
  const closed = sessionClockStatus({
    days: [day],
    now: Date.parse("2026-11-28T12:00:00Z"),
    coverage: "regular",
  });
  expect(closed).toEqual({
    kind: "closed",
    next: undefined,
    remainingMs: undefined,
  });
  expect(sessionClockLabel(closed)).toBe("Closed");
});

it("compacts remaining time without trailing zero units", () => {
  expect(formatCountdown(2 * 86_400_000 + 3_600_000)).toBe("2d 1h");
  expect(formatCountdown(2 * 86_400_000)).toBe("2d");
  expect(formatCountdown(5 * 3_600_000)).toBe("5h");
  expect(formatCountdown(90 * 60_000)).toBe("1h 30m");
  expect(formatCountdown(45_000)).toBe("45s");
  expect(formatCountdown(-1)).toBe("0s");
});
