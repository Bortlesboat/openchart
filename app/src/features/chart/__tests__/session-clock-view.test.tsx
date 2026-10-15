// Purpose: The chart session clock reads the calendar silently and ticks remaining time.
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { FeedVersion } from "@openchart/feed";
import { ProviderId } from "@openchart/market";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SessionClock } from "@openchart/app/features/chart/components/session-clock";
import type { FeedClient } from "@openchart/app/lib/feed/client";
import {
  FeedReactContext,
  FeedVersionContext,
} from "@openchart/app/lib/feed/provider";
import { createQueryClient } from "@openchart/app/lib/react-query/react-query";

afterEach(() => {
  vi.useRealTimers();
});

function renderClock(
  session: "regular" | "extended" | "24h",
  getCalendar: FeedClient["calendar"]["getCalendar"],
) {
  const queryClient = createQueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const feed = {
    bars: { observe: vi.fn(), getCapabilities: vi.fn() },
    symbology: {
      index: vi.fn(),
      indexStatus: vi.fn(),
      search: vi.fn(),
    },
    calendar: { getCalendar },
    series: { select: vi.fn() },
    close: vi.fn(),
  } as unknown as FeedClient;
  const view = render(
    <QueryClientProvider client={queryClient}>
      <FeedVersionContext.Provider value={FeedVersion.make("test")}>
        <FeedReactContext.Provider value={feed}>
          <SessionClock
            provider={ProviderId.make("test")}
            listing={{ symbol: "AAPL", currency: "USD" }}
            session={session}
          />
        </FeedReactContext.Provider>
      </FeedVersionContext.Provider>
    </QueryClientProvider>,
  );
  return {
    ...view,
    unmount: () => {
      view.unmount();
      queryClient.clear();
    },
  };
}

const sessions = [
  {
    type: "pre" as const,
    start: Date.parse("2026-11-27T09:00:00Z"),
    end: Date.parse("2026-11-27T14:30:00Z"),
  },
  {
    type: "regular" as const,
    start: Date.parse("2026-11-27T14:30:00Z"),
    end: Date.parse("2026-11-27T21:00:00Z"),
  },
];

it("shows regular remaining time and ticks down without refetching the calendar", async () => {
  vi.useFakeTimers({
    now: Date.parse("2026-11-27T16:00:00Z"),
    toFake: ["Date", "setInterval", "clearInterval"],
  });
  const getCalendar = vi.fn().mockResolvedValue({
    calendar: "nasdaq",
    timezone: "UTC",
    days: [
      {
        date: Date.parse("2026-11-27T00:00:00Z"),
        sessions,
      },
    ],
  });
  const view = renderClock("regular", getCalendar);
  await waitFor(() =>
    expect(
      screen.getByLabelText("Regular session open, closes in 5h"),
    ).toHaveTextContent("Regular · 5h"),
  );
  expect(getCalendar).toHaveBeenCalledOnce();
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  expect(
    screen.getByLabelText("Regular session open, closes in 4h 59m"),
  ).toHaveTextContent("Regular · 4h 59m");
  expect(getCalendar).toHaveBeenCalledOnce();
  view.unmount();
});

it("omits the clock when the calendar is missing or fails", async () => {
  const getCalendar = vi.fn().mockRejectedValue(new Error("offline"));
  const view = renderClock("regular", getCalendar);
  await waitFor(() => expect(getCalendar).toHaveBeenCalled());
  expect(screen.queryByLabelText(/session/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Closed/)).not.toBeInTheDocument();
  view.unmount();
});
